// ui.js — premium workout app, driven by a STATE MACHINE so nothing is illogical:
//   idle    → not connected: Connect / H10 / Demo
//   ready   → connected (live speed preview), pick program/incline, build custom: Démarrer
//   active  → workout running: full live stats, speed quick-sets + fine ±, Stop
//   summary → after Stop: full retained stats, saved to history; treadmill STAYS connected
// Connecting no longer starts the chrono; Stop no longer disconnects or loses data.
// Dependency-injected (connections, session/simulator factories, dropdown, notifier, storage,
// history) → boots and is behavior-tested in Node with a fake document. DRY: one render(),
// one loop, one start path.

import { parseTreadmillData } from './ftms-core.js';
import { WorkoutSession, segDurationSec } from './session.js';
import { getWorkout, allWorkouts, saveCustom, loadCustom, deleteCustom, ensureSeeded } from './workouts.js';
import { DEFAULT_POSITIONS, gradeFromDegrees } from './incline.js';
import { goalProgress } from './trend.js';
import { ageFromBirthdate, strideFromHeight } from './physio.js';
import { createDropdown } from './dropdown.js';

const ZONE_LABELS = ['repos', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const km = (m) => (m / 1000).toFixed(2);

// HM1 limits: speed 1–8 km/h ; segment duration 1 s … 60 min ; total workout ≤ 60 min (belt
// auto-stops at 60). Clamping keeps typed values valid (e.g. 86 → 8, 0 s → 1 s).
const SPEED_MIN = 1, SPEED_MAX = 8, MAX_TOTAL_SEC = 3600, SEG_MIN_SEC = 1;
const clampSpeed = (v) => clamp(Math.round(num(v, SPEED_MIN) * 10) / 10, SPEED_MIN, SPEED_MAX);
// duration from a minutes field + a seconds field → clamped total seconds [1 .. 3600]
const clampDuration = (min, sec) => clamp(Math.round(num(min, 0)) * 60 + Math.round(num(sec, 0)), SEG_MIN_SEC, MAX_TOTAL_SEC);

export function mount(doc, deps) {
  const {
    treadmill, h10, makeSession = (o) => new WorkoutSession(o), makeSimulator,
    notifier = { notify() {}, buzz() {} }, storage,
    weightKg: initWeight = 75, vestKg: initVest = 0, maxHr: initMaxHr = 190, positions: initPositions = DEFAULT_POSITIONS,
    defaultProgramId = 'free', defaultPositionId = 1,
    loadHistory = () => [], summarizeHistory = () => ({ total: 0, days: 0 }), deleteSession = () => {},
    saveScreen = () => {}, lastScreen = null,
    todayTotals = () => ({ distanceM: 0, calories: 0, steps: 0 }), today = () => '',
    goalKm = 3, goalSteps = 8000, goalType = 'km', wakeLock = { request() {}, release() {} },
    heightCm: initHeight = 0, birthdate: initBirthdate = '', sex: initSex = 'M', now = () => Date.now(),
    quickSpeeds = [2, 4, 6, 8],
    schedule = (fn, ms) => setInterval(fn, ms), unschedule = (id) => clearInterval(id),
  } = deps;

  // Mutable settings (editable in the Réglages screen, applied to the next workout).
  let curWeight = initWeight, curVest = initVest, curMaxHr = initMaxHr, curPositions = initPositions;
  let curGoalKm = goalKm, curGoalSteps = goalSteps, curGoalType = goalType;
  let curHeight = initHeight, curBirthdate = initBirthdate, curSex = initSex;

  ensureSeeded({ storage }); // seed starter workouts as editable entries on first run

  const root = doc.getElementById('app');
  const add = (tag, props = {}, parent = root) => { const e = doc.createElement(tag); Object.assign(e, props); parent.appendChild(e); return e; };

  // --- DOM ---------------------------------------------------------------------------------
  const els = {};
  els.status = add('div', { id: 'status', className: 'status', textContent: 'Déconnecté' });
  els.streak = add('div', { id: 'streak', className: 'streak', textContent: '' });

  els.today = add('div', { id: 'today', className: 'today', textContent: '' });

  els.setup = add('div', { id: 'setup', className: 'setup' });
  els.dropdown = createDropdown(doc, { items: allWorkouts({ storage }).map((w) => ({ id: w.id, label: w.name })), placeholder: 'Programme', onSelect: (id) => selectProgram(id) });
  els.setup.appendChild(els.dropdown.el);
  els.manageBtn = add('button', { id: 'manage', className: 'link', textContent: 'Gérer mes séances' }, els.setup);

  // Incline selector — chosen BEFORE the run (manual/mechanical, can't change mid-workout).
  // Dropdown showing each position's angle AND grade %. Rebuilt when the angles change.
  els.inclineRow = add('div', { id: 'incline', className: 'incline-row' });
  add('span', { className: 'incline-label', textContent: 'Inclinaison du tapis' }, els.inclineRow);
  els.inclineDropdown = createDropdown(doc, { items: inclineItems(), placeholder: 'Inclinaison', onSelect: (id) => setPosition(Number(id)) });
  els.inclineRow.appendChild(els.inclineDropdown.el);

  // Weighted vest — a PER-SESSION choice (asked before each run, not buried in settings). Free
  // numeric input 0–40 kg, decimals + comma accepted (e.g. 10,5). Read at start, fed to calories.
  els.vestRow = add('div', { id: 'vest', className: 'incline-row' });
  add('span', { className: 'incline-label', textContent: 'Veste lestée (kg)' }, els.vestRow);
  els.vestInput = add('input', { id: 'vestInput', className: 'inp num2', type: 'text', inputMode: 'decimal', maxLength: 4, placeholder: '0', value: initVest || '' }, els.vestRow);

  // Workouts management page (create / edit / delete custom workouts).
  els.workouts = add('div', { id: 'workouts', className: 'workouts', hidden: true });
  add('div', { className: 'sum-title', textContent: 'Mes séances' }, els.workouts);
  els.workoutList = add('div', { className: 'wk-list' }, els.workouts);
  els.newWorkoutBtn = add('button', { className: 'btn primary small', textContent: '+ Nouvelle séance' }, els.workouts);

  // Custom workout builder (its own screen) — editable rows with effort/recovery kind.
  els.builder = add('div', { id: 'builder', className: 'builder', hidden: true });
  els.builderTitle = add('div', { className: 'sum-title', textContent: 'Nouvelle séance' }, els.builder);
  els.builderName = add('input', { id: 'wname', className: 'inp', placeholder: 'Nom de la séance' }, els.builder);
  els.segList = add('div', { id: 'segs', className: 'seg-list' }, els.builder);
  els.addSeg = add('button', { className: 'btn small', textContent: '+ Segment' }, els.builder);
  els.builderDur = add('div', { className: 'proginfo', textContent: '' }, els.builder);
  els.saveWorkout = add('button', { className: 'btn primary small', textContent: 'Enregistrer' }, els.builder);
  els.cancelWorkout = add('button', { className: 'btn ghost small', textContent: 'Annuler' }, els.builder);

  // Settings screen (Réglages).
  els.settings = add('div', { id: 'settings', className: 'builder', hidden: true });
  add('div', { className: 'sum-title', textContent: 'Réglages' }, els.settings);
  els.setWeight = labeledInput(els.settings, 'Poids (kg)', curWeight);
  els.setHeight = labeledInput(els.settings, 'Taille (cm)', curHeight || '');
  els.setBirthdate = labeledInput(els.settings, 'Date de naissance', curBirthdate, 'date');
  els.sexRow = add('div', { className: 'incline-row' }, els.settings);
  add('span', { className: 'incline-label', textContent: 'Genre' }, els.sexRow);
  els.sexMBtn = add('button', { className: 'pos', textContent: 'Homme' }, els.sexRow);
  els.sexFBtn = add('button', { className: 'pos', textContent: 'Femme' }, els.sexRow);
  els.sexMBtn.addEventListener('click', () => setSex('M'));
  els.sexFBtn.addEventListener('click', () => setSex('F'));
  els.setMaxHr = labeledInput(els.settings, 'FC max (bpm)', curMaxHr);
  els.setPos1 = labeledInput(els.settings, 'Angle Position 1 (°)', degOf(curPositions, 1));
  els.setPos2 = labeledInput(els.settings, 'Angle Position 2 (°)', degOf(curPositions, 2));
  // Daily goal: pick the unit (km or pas), one value field that follows the chosen unit.
  els.goalTypeRow = add('div', { className: 'incline-row' }, els.settings);
  add('span', { className: 'incline-label', textContent: 'Objectif quotidien' }, els.goalTypeRow);
  els.goalKmBtn = add('button', { className: 'pos', textContent: 'km' }, els.goalTypeRow);
  els.goalStepsBtn = add('button', { className: 'pos', textContent: 'pas' }, els.goalTypeRow);
  els.setGoal = labeledInput(els.settings, 'Valeur', curGoalType === 'steps' ? curGoalSteps : curGoalKm);
  els.goalKmBtn.addEventListener('click', () => setGoalType('km'));
  els.goalStepsBtn.addEventListener('click', () => setGoalType('steps'));
  els.saveSettings = add('button', { className: 'btn primary small', textContent: 'Enregistrer' }, els.settings);

  // Live metrics.
  els.metrics = add('div', { id: 'metrics', className: 'metrics' });
  els.speed = add('div', { id: 'speed', className: 'big', textContent: '0.0' }, els.metrics);
  add('div', { className: 'unit', textContent: 'km/h' }, els.metrics);
  els.inclineActive = add('div', { id: 'inclineActive', className: 'target', textContent: '' }, els.metrics);
  els.target = add('div', { id: 'target', className: 'target', textContent: '' }, els.metrics);
  els.progWrap = add('div', { id: 'progwrap', className: 'progwrap', hidden: true }, els.metrics);
  els.progBar = add('div', { id: 'progbar', className: 'progbar' }, els.progWrap);
  els.progInfo = add('div', { id: 'proginfo', className: 'proginfo', textContent: '' }, els.metrics);
  els.live = add('div', { id: 'live', className: 'live-grid' }, els.metrics);
  els.mTime = add('div', { className: 'm', textContent: '' }, els.live);
  els.mDist = add('div', { className: 'm', textContent: '' }, els.live);
  els.mKcal = add('div', { className: 'm', textContent: '' }, els.live);
  els.mSteps = add('div', { className: 'm', textContent: '' }, els.live);
  els.mHr = add('div', { className: 'm', textContent: '' }, els.live);

  // Summary screen.
  els.summary = add('div', { id: 'summary', className: 'summary', hidden: true });

  // Speed controls.
  els.speedctl = add('div', { id: 'speedctl', className: 'speedctl' });
  els.quick = {};
  for (const v of quickSpeeds) { els.quick[v] = add('button', { className: 'btn chip', textContent: `${v}` }, els.speedctl); els.quick[v].addEventListener('click', () => setSpeed(v)); }
  els.slower = add('button', { id: 'slower', className: 'btn step', textContent: '−' }, els.speedctl);
  els.faster = add('button', { id: 'faster', className: 'btn step', textContent: '+' }, els.speedctl);

  // Controls (context buttons).
  els.controls = add('div', { id: 'controls', className: 'controls' });
  els.connectBtn = add('button', { id: 'connect', className: 'btn primary', textContent: 'Connecter le tapis' }, els.controls);
  els.hrBtn = add('button', { id: 'connectHr', className: 'btn', textContent: 'Connecter le H10 (FC)' }, els.controls);
  els.demoBtn = add('button', { id: 'demo', className: 'btn', textContent: 'Démo' }, els.controls);
  els.startBtn = add('button', { id: 'start', className: 'btn primary', textContent: 'Démarrer' }, els.controls);
  els.pauseBtn = add('button', { id: 'pause', className: 'btn', textContent: 'Pause' }, els.controls);
  els.resumeBtn = add('button', { id: 'resume', className: 'btn primary', textContent: 'Reprendre' }, els.controls);
  els.stopBtn = add('button', { id: 'stop', className: 'btn ghost', textContent: 'Stop' }, els.controls);
  els.newBtn = add('button', { id: 'new', className: 'btn primary', textContent: 'Nouvelle séance' }, els.controls);
  els.histBtn = add('button', { id: 'hist', className: 'btn', textContent: 'Historique' }, els.controls);
  els.settingsBtn = add('button', { id: 'settingsBtn', className: 'btn', textContent: '⚙︎ Réglages' }, els.controls);
  els.backBtn = add('button', { id: 'back', className: 'btn', textContent: '← Retour' }, els.controls);
  els.disconnectBtn = add('button', { id: 'disconnect', className: 'btn ghost', textContent: 'Déconnecter' }, els.controls);

  // --- state -------------------------------------------------------------------------------
  let state = 'idle';            // idle | ready | active | summary | history
  let prevState = 'idle';
  let timer = null, sim = null, controllable = false, hrConnected = false, isDemo = false;
  let programId = defaultProgramId, positionId = defaultPositionId;
  let latestFrame = {}, lastHr = null, lastTargetSpeed = null, manualSpeed = 4;
  let session = null, lastSummary = null, segDrafts = [];
  let onFinish = () => {}, onProgram = () => {}, onPosition = () => {}, onSettings = () => {}, onVest = () => {};

  // --- render: single source of visibility -------------------------------------------------
  function show(el, on) { el.hidden = !on; }
  function render() {
    show(els.setup, state === 'ready');
    show(els.workouts, state === 'workouts');
    show(els.builder, state === 'builder');
    show(els.summary, state === 'summary' || state === 'history' || state === 'detail');
    show(els.settings, state === 'settings');
    // incline + vest SELECTORS only on 'ready' (chosen before each run)
    show(els.inclineRow, state === 'ready');
    show(els.vestRow, state === 'ready');
    show(els.connectBtn, state === 'idle');
    show(els.demoBtn, state === 'idle');
    show(els.hrBtn, state === 'idle' || (state === 'ready' && !hrConnected));
    show(els.startBtn, state === 'ready');
    show(els.disconnectBtn, state === 'ready');
    show(els.newBtn, state === 'summary');
    show(els.histBtn, state === 'summary' || state === 'ready');
    show(els.settingsBtn, state === 'idle' || state === 'ready');
    show(els.backBtn, state === 'history' || state === 'settings' || state === 'detail' || state === 'workouts' || state === 'builder');
    show(els.pauseBtn, state === 'active');
    show(els.resumeBtn, state === 'paused');
    show(els.stopBtn, state === 'active' || state === 'paused');
    show(els.metrics, state === 'active' || state === 'paused');
    show(els.speedctl, state === 'active' && controllable);
    show(els.today, state === 'ready' || state === 'summary');
    persistScreen();
  }

  // Remember the current page so a refresh can return to it after reconnect (BLE itself can't
  // survive a reload — Web Bluetooth limitation — but the view can).
  let lastPersisted = null;
  function persistScreen() {
    const keep = ['ready', 'workouts', 'settings', 'history'];
    const s = keep.includes(state) ? state : null;
    if (s && s !== lastPersisted) { lastPersisted = s; saveScreen(s); }
  }
  function restoreAfterConnect() {
    if (lastScreen === 'workouts') return showWorkouts();
    if (lastScreen === 'settings') return openSettings();
    if (lastScreen === 'history') return showHistory();
    state = 'ready'; render();
  }

  function selectProgram(id) { programId = id; els.dropdown.setValue(id, { silent: true }); onProgram(id); }
  function setPosition(id) { positionId = id; if (session) session.setPosition(id); els.inclineDropdown.setValue(String(id), { silent: true }); onPosition(id); render(); }
  // Incline dropdown items: "Position 1 — 1° (1,7 %)". Grade % derived from the angle.
  function inclineItems() { return curPositions.map((p) => ({ id: String(p.id), label: `${p.label} — ${p.degrees}° (${pctStr(p.degrees)})` })); }
  function pctStr(deg) { return gradeFromDegrees(deg).toFixed(1).replace('.', ',') + ' %'; }
  // Per-session weighted vest: read the free numeric field (0–40 kg, comma OK) at start; persist.
  function readVest() { curVest = clamp(parseDec(els.vestInput.value), 0, 50); onVest(curVest); return curVest; }
  function setSex(s) { curSex = s === 'F' ? 'F' : 'M'; els.sexMBtn.className = curSex === 'M' ? 'pos on' : 'pos'; els.sexFBtn.className = curSex === 'F' ? 'pos on' : 'pos'; }
  function curAge() { return ageFromBirthdate(curBirthdate, now()); }
  // Daily-goal unit toggle (km / pas): swap the value field to the chosen unit's stored value.
  function setGoalType(type) {
    curGoalType = type;
    els.setGoal.value = type === 'steps' ? curGoalSteps : curGoalKm;
    els.goalKmBtn.className = type === 'km' ? 'pos on' : 'pos';
    els.goalStepsBtn.className = type === 'steps' ? 'pos on' : 'pos';
  }

  // --- live loop ---------------------------------------------------------------------------
  function getFrame() {
    if (isDemo && sim) { const f = sim.next(1); return { parsed: parseTreadmillData(f.data), hr: f.hr }; }
    return { parsed: latestFrame, hr: lastHr };
  }
  function loopTick() {
    const { parsed, hr } = getFrame();
    if (hr != null) lastHr = hr;
    if (state === 'active') {
      const r = session.update(parsed || {}, hr ?? lastHr);
      if (controllable && r.targetSpeed != null && r.targetSpeed !== lastTargetSpeed) {
        lastTargetSpeed = r.targetSpeed; manualSpeed = r.targetSpeed; treadmill.setSpeed(r.targetSpeed).catch(() => {});
      }
      paintActive(r);
      if (r.done) finishWorkout();
    } else { // ready preview: show live belt speed only
      els.speed.textContent = ((parsed && parsed.speed) || 0).toFixed(1);
    }
  }
  function startLoop() { if (!timer) timer = schedule(loopTick, 1000); }
  function stopLoop() { if (timer) { unschedule(timer); timer = null; } }

  function paintActive(r) {
    els.speed.textContent = r.speed.toFixed(1);
    const pos = curPositions.find((p) => p.id === positionId);
    els.inclineActive.textContent = pos ? `⛰ ${pos.label} (${pos.degrees}° · ${pctStr(pos.degrees)})` : '';
    const kindLabel = r.segmentKind === 'recovery' ? 'récup' : r.segmentKind === 'warmup' ? 'échauffement' : 'effort';
    els.target.textContent = r.targetSpeed != null ? `${kindLabel} · objectif ${r.targetSpeed} km/h` : '';
    els.mTime.textContent = `⏱ ${fmtTime(r.elapsedSec)}`;
    els.mDist.textContent = `📏 ${km(r.distanceM)} km`;
    els.mKcal.textContent = `🔥 ${Math.round(r.calories)} kcal`;
    els.mSteps.textContent = `👣 ${r.steps}`;
    els.mHr.textContent = r.hr ? `♥ ${r.hr} · ${ZONE_LABELS[r.zone]}` : '♥ —';
    // program progress bar + remaining + next step (premium feel)
    const hasProg = r.totalSec != null && r.totalSec > 0;
    els.progWrap.hidden = !hasProg;
    if (hasProg) {
      els.progBar.style.width = `${Math.round(r.progress * 100)}%`;
      const next = r.nextSpeed != null ? ` · puis ${r.nextSpeed} km/h` : '';
      els.progInfo.textContent = `reste ${fmtTime(r.remainingSec)}${next}`;
    } else els.progInfo.textContent = '';
  }

  function renderToday() {
    const t = todayTotals(loadHistory(), today());
    const g = goalProgress({ type: curGoalType, km: curGoalKm, steps: curGoalSteps }, t);
    els.today.textContent = `Aujourd'hui · ${g.label}${g.done ? ' ✅' : ''} · ${t.calories} kcal · ${t.steps} pas`;
  }

  // --- connect / demo ----------------------------------------------------------------------
  async function connectTreadmill() {
    els.status.textContent = 'Connexion…';
    try {
      const res = await treadmill.connect();
      controllable = !!res.controllable; isDemo = false;
      treadmill.onData = (parsed) => { latestFrame = parsed; };
      treadmill.onDisconnect = () => { if (state === 'active') { pauseWorkout(); els.status.textContent = 'Tapis déconnecté — séance en pause'; notifier.notify('Tapis déconnecté', { body: 'Séance mise en pause', vibration: [200] }); } };
      els.status.textContent = controllable ? 'Tapis connecté' : 'Tapis connecté (lecture seule)';
      startLoop(); renderToday(); restoreAfterConnect(); // land back on the screen we were on
    } catch (e) { els.status.textContent = 'Erreur : ' + e.message; render(); }
  }
  async function connectHr() {
    try { await h10.connect(); h10.onData = (d) => { lastHr = d.hr; }; hrConnected = true; els.hrBtn.textContent = 'H10 ✓'; render(); }
    catch (e) { els.status.textContent = 'H10 : ' + e.message; }
  }
  function startDemo() {
    isDemo = true; controllable = true; sim = makeSimulator();
    els.status.textContent = 'Démo'; state = 'ready'; startLoop(); renderToday(); render();
  }

  // --- workout lifecycle -------------------------------------------------------------------
  function startWorkout() {
    const w = getWorkout(programId, { storage });
    session = makeSession({ weightKg: curWeight, vestKg: readVest(), age: curAge(), sex: curSex, positionId, positions: curPositions, maxHr: curMaxHr, strideM: strideFromHeight(curHeight) || 0.71, program: w.segments ? w : null });
    lastTargetSpeed = null; state = 'active';
    if (isDemo && sim) sim.start();
    if (controllable) treadmill.start && treadmill.start().catch(() => {});
    wakeLock.request && wakeLock.request();
    els.status.textContent = `En cours · ${w.name}`;
    notifier.buzz([60]);
    render();
  }

  function pauseWorkout() {
    if (state !== 'active') return;
    state = 'paused';
    if (controllable && treadmill.stop) treadmill.stop().catch(() => {});
    if (isDemo && sim) sim.stop();
    wakeLock.release && wakeLock.release();
    els.status.textContent = 'En pause';
    render();
  }
  function resumeWorkout() {
    if (state !== 'paused') return;
    state = 'active'; lastTargetSpeed = null;
    if (isDemo && sim) sim.start();
    if (controllable) treadmill.start && treadmill.start().catch(() => {});
    wakeLock.request && wakeLock.request();
    els.status.textContent = 'En cours';
    render();
  }

  function finishWorkout() {
    if (controllable && treadmill.stop) treadmill.stop().catch(() => {});
    if (isDemo && sim) sim.stop();
    wakeLock.release && wakeLock.release();
    lastSummary = session.summary();
    lastSummary.program = getWorkout(programId, { storage }).name;
    renderSummary(lastSummary);
    state = 'summary';
    const msg = `${km(lastSummary.distanceM)} km · ${lastSummary.calories} kcal · ${fmtTime(lastSummary.durationSec)}`;
    els.status.textContent = 'Séance terminée';
    notifier.notify('Séance terminée', { body: msg, vibration: [120, 60, 120] });
    onFinish({ activity: 'treadmill', programId, ...lastSummary });
    renderToday();
    render();
  }
  function stopWorkout() { if (state === 'active' || state === 'paused') finishWorkout(); }

  function renderSummary(s, title = 'Récapitulatif') {
    const zoneSeconds = s.zoneSeconds || [];
    const zonesTotal = zoneSeconds.reduce((a, b) => a + b, 0) || 1;
    const rows = [
      ['Durée', fmtTime(s.durationSec)],
      ['Distance', `${km(s.distanceM)} km`],
      ['Distance équiv. (pente)', `${km(s.gaDistanceM || s.distanceM)} km`],
      ['Calories', `${s.calories} kcal`],
      ['Pas', `${s.steps || 0}`],
      ['Vitesse moy', `${s.avgSpeed ?? '—'} km/h`],
      ['Vitesse max', `${s.maxSpeed ?? '—'} km/h`],
      ...(s.inclineDeg != null ? [['Inclinaison', `${s.inclineDeg}°`]] : []),
      ...(s.avgHr ? [['FC moy', `${s.avgHr} bpm`], ['FC pic', `${s.peakHr} bpm`]] : []),
    ];
    const sub = s.date ? `<div class="hist-tot">${s.date} · ${s.program || ''}</div>` : '';
    let html = `<div class="sum-title">${title}</div>${sub}<div class="sum-grid">`;
    for (const [k, v] of rows) html += `<div class="sum-cell"><span class="sum-k">${k}</span><span class="sum-v">${v}</span></div>`;
    html += '</div>';
    if (s.avgHr && zoneSeconds.length) {
      html += '<div class="zones">';
      for (let z = 1; z <= 5; z++) { const pct = Math.round(((zoneSeconds[z] || 0) / zonesTotal) * 100); html += `<div class="zbar"><span>${ZONE_LABELS[z]}</span><div class="ztrack"><div class="zfill z${z}" style="width:${pct}%"></div></div><span>${pct}%</span></div>`; }
      html += '</div>';
    }
    setHTML(els.summary, html);
  }

  // History as real DOM rows: tap a row → detail, tap × → delete. (Not innerHTML, so we can
  // wire per-row handlers and stay testable.)
  function showHistory() {
    if (state !== 'history' && state !== 'detail') prevState = state;
    state = 'history';
    const all = loadHistory();
    const sessions = all.slice(-30).reverse();
    const tot = summarizeHistory(all);
    if (els.summary.replaceChildren) els.summary.replaceChildren(); else if (els.summary.children) els.summary.children.length = 0;
    add('div', { className: 'sum-title', textContent: 'Historique' }, els.summary);
    add('div', { className: 'hist-tot', textContent: `${tot.days || 0} jours · ${sessions.length} séances récentes` }, els.summary);
    const list = add('div', { className: 'hist-list' }, els.summary);
    if (!sessions.length) { add('div', { className: 'hrow', textContent: 'Aucune séance pour l’instant.' }, list); render(); return; }
    for (const s of sessions) {
      const row = add('div', { className: 'hrow tappable' }, list);
      const info = add('div', { className: 'hrow-info' }, row);
      add('span', { textContent: s.date || '' }, info);
      add('span', { textContent: s.program || '' }, info);
      add('span', { textContent: `${km(s.distanceM || 0)} km` }, info);
      add('span', { textContent: `${s.calories || 0} kcal` }, info);
      add('span', { textContent: fmtTime(s.durationSec || 0) }, info);
      info.addEventListener('click', () => showSessionDetail(s));
      const del = add('button', { className: 'btn small ghost del', textContent: '🗑' }, row);
      del.addEventListener('click', () => deleteSessionRow(s));
    }
    render();
  }

  function showSessionDetail(s) {
    prevState = 'history'; state = 'detail';
    renderSummary(s, 'Détail de la séance');
    render();
  }

  function deleteSessionRow(s) {
    if (s && s.id != null) deleteSession(s.id);
    showHistory(); // refresh in place
  }

  // Leave history/settings/detail/workouts/builder back to where we came from.
  function goBack() {
    if (state === 'detail') { showHistory(); return; }
    if (state === 'builder') { showWorkouts(); return; }
    state = prevState || 'ready';
    if (state === 'summary' && lastSummary) renderSummary(lastSummary);
    render();
  }

  // --- workouts management page ------------------------------------------------------------
  function showWorkouts() {
    if (state !== 'workouts' && state !== 'builder') prevState = state;
    state = 'workouts';
    if (els.workoutList.replaceChildren) els.workoutList.replaceChildren(); else if (els.workoutList.children) els.workoutList.children.length = 0;

    // One unified list = the dropdown. "Marche libre" is the default (no actions); every other
    // workout (the seeded starters + the user's own) is editable + deletable.
    for (const w of allWorkouts({ storage })) {
      const row = add('div', { className: 'hrow' }, els.workoutList);
      const info = add('div', { className: 'hrow-info', style: { cursor: 'pointer' } }, row);
      add('span', { textContent: w.name }, info);
      const segs = w.segments || [];
      const totalSec = segs.reduce((s, x) => s + segDurationSec(x), 0);
      add('span', { textContent: segs.length ? `${segs.length} seg · ${fmtTime(totalSec)}` : 'par défaut' }, info);
      if (w.builtin) continue; // free walk = default, nothing to edit/delete
      info.addEventListener('click', () => startBuilder(w));
      const edit = add('button', { className: 'btn small ghost', textContent: '✎' }, row);
      edit.addEventListener('click', () => startBuilder(w));
      const del = add('button', { className: 'btn small ghost del', textContent: '🗑' }, row);
      del.addEventListener('click', () => { deleteCustom(w.id, { storage }); refreshDropdown(); showWorkouts(); });
    }
    add('div', { className: 'hrow muted', textContent: 'Astuce : modifie ou supprime une séance, ou crée la tienne.' }, els.workoutList);
    render();
  }

  function refreshDropdown() {
    els.dropdown.setItems(allWorkouts({ storage }).map((x) => ({ id: x.id, label: x.name })));
  }

  // --- settings (Réglages) -----------------------------------------------------------------
  function openSettings() {
    prevState = state === 'settings' ? prevState : state;
    els.setWeight.value = curWeight;
    els.setHeight.value = curHeight || '';
    els.setBirthdate.value = curBirthdate || '';
    setSex(curSex);
    els.setMaxHr.value = curMaxHr;
    els.setPos1.value = degOf(curPositions, 1);
    els.setPos2.value = degOf(curPositions, 2);
    setGoalType(curGoalType); // sets toggle highlight + value field to the active unit
    state = 'settings'; render();
  }
  function applySettings() {
    const weightKg = num(els.setWeight.value, curWeight);
    const heightCm = num(els.setHeight.value, curHeight);
    const birthdate = String(els.setBirthdate.value || '').trim();
    const maxHr = num(els.setMaxHr.value, curMaxHr);
    const pos1Deg = num(els.setPos1.value, degOf(curPositions, 1));
    const pos2Deg = num(els.setPos2.value, degOf(curPositions, 2));
    const goalVal = num(els.setGoal.value, curGoalType === 'steps' ? curGoalSteps : curGoalKm);
    curWeight = weightKg; curHeight = heightCm; curBirthdate = birthdate; curMaxHr = maxHr; // curSex set by toggle
    if (curGoalType === 'steps') curGoalSteps = goalVal; else curGoalKm = goalVal;
    curPositions = [{ id: 1, label: 'Position 1', degrees: pos1Deg }, { id: 2, label: 'Position 2', degrees: pos2Deg }];
    els.inclineDropdown.setItems(inclineItems());
    els.inclineDropdown.setValue(String(positionId), { silent: true });
    if (session) { session.weightKg = curWeight; session.age = curAge(); session.sex = curSex; session.strideM = strideFromHeight(curHeight) || 0.71; session.maxHr = curMaxHr; session.positions = curPositions; }
    onSettings({ weightKg, heightCm, birthdate, sex: curSex, maxHr, pos1Deg, pos2Deg, goalKm: curGoalKm, goalSteps: curGoalSteps, goalType: curGoalType });
    renderToday();
    goBack();
  }

  function disconnect() {
    stopLoop();
    wakeLock.release && wakeLock.release();
    if (treadmill.disconnect) treadmill.disconnect();
    controllable = false; isDemo = false; sim = null; session = null;
    state = 'idle'; els.status.textContent = 'Déconnecté'; render();
  }

  // --- speed control -----------------------------------------------------------------------
  function setSpeed(v) { manualSpeed = clamp(v, SPEED_MIN, SPEED_MAX); if (isDemo && sim) sim.setTarget(manualSpeed); if (controllable) treadmill.setSpeed(manualSpeed).catch(() => {}); }
  function nudge(d) { setSpeed(Math.round((manualSpeed + d) * 10) / 10); } // fine 0.1 step

  // --- custom builder (its own screen; editable rows with effort/recovery kind) -------------
  let segRows = [];        // [{minEl, spdEl, kind}]
  let editingId = null;    // non-null when editing an existing workout

  // workout: the source to load (or null for blank). asCopy=true → duplicate a built-in into a
  // new editable custom workout (no id, name suffixed "(copie)").
  function startBuilder(workout, asCopy = false) {
    editingId = workout && workout.id && !asCopy ? workout.id : null;
    els.builderTitle.textContent = editingId ? 'Modifier la séance' : (asCopy ? 'Dupliquer la séance' : 'Nouvelle séance');
    els.builderName.value = workout ? (asCopy ? `${workout.name} (copie)` : workout.name) : '';
    segDrafts = workout && workout.segments && workout.segments.length
      ? workout.segments.map((s) => ({ seconds: segDurationSec(s), speed: s.speed, kind: s.kind || 'effort' }))
      : [{ seconds: 300, speed: 4, kind: 'effort' }];
    renderSegs();
    state = 'builder'; render();
  }
  function cancelBuilder() { showWorkouts(); }

  function addSegRow() { segDrafts = readSegs(); segDrafts.push({ seconds: 180, speed: 3, kind: 'recovery' }); renderSegs(); }
  function removeSegRow(i) { segDrafts = readSegs(); segDrafts.splice(i, 1); if (!segDrafts.length) segDrafts.push({ seconds: 300, speed: 4, kind: 'effort' }); renderSegs(); }
  function readSegs() {
    return segRows.map((r) => ({ seconds: clampDuration(r.minEl.value, r.secEl.value), speed: clampSpeed(r.spdEl.value), kind: r.kind }));
  }
  function renderSegs() {
    if (els.segList.replaceChildren) els.segList.replaceChildren(); else if (els.segList.children) els.segList.children.length = 0;
    segRows = [];
    segDrafts.forEach((s, i) => {
      const dur = s.seconds != null ? s.seconds : (s.minutes || 0) * 60;
      const mm = Math.floor(dur / 60), ss = dur % 60;
      const row = add('div', { className: 'seg-row' }, els.segList);
      add('span', { className: 'seg-i', textContent: `${i + 1}` }, row);
      const f1 = add('span', { className: 'seg-field' }, row);
      const minEl = add('input', { className: 'inp tiny', type: 'number', inputmode: 'numeric', value: mm }, f1);
      add('span', { className: 'seg-u', textContent: 'min' }, f1);
      const secEl = add('input', { className: 'inp tiny', type: 'number', inputmode: 'numeric', value: ss }, f1);
      add('span', { className: 'seg-u', textContent: 's' }, f1);
      const f2 = add('span', { className: 'seg-field' }, row);
      const spdEl = add('input', { className: 'inp tiny', type: 'number', inputmode: 'decimal', step: '0.1', value: s.speed }, f2);
      add('span', { className: 'seg-u', textContent: 'km/h' }, f2);
      const ref = { minEl, secEl, spdEl, kind: s.kind || 'effort' };
      // clamp typed values on blur and refresh the total
      for (const el of [minEl, secEl, spdEl]) el.addEventListener('change', () => { segDrafts = readSegs(); renderSegs(); });
      const kindBtn = add('button', { className: `btn kind ${ref.kind}`, textContent: kindShort(ref.kind) }, row);
      kindBtn.addEventListener('click', () => { segDrafts = readSegs(); segDrafts[i].kind = cycleKind(segDrafts[i].kind); renderSegs(); });
      const del = add('button', { className: 'del-seg', textContent: '×' }, row);
      del.addEventListener('click', () => removeSegRow(i));
      segRows.push(ref);
    });
    const totalSec = readSegs().reduce((a, s) => a + s.seconds, 0);
    const over = totalSec > MAX_TOTAL_SEC;
    els.builderDur.className = over ? 'proginfo warn' : 'proginfo';
    els.builderDur.textContent = over
      ? `Durée ${fmtTime(totalSec)} — max 60 min (le tapis s'arrête à 60 min)`
      : `Durée totale ${fmtTime(totalSec)} · ${segDrafts.length} segment(s)`;
  }
  function saveBuilder() {
    segDrafts = readSegs(); // capture typed (clamped) values so a re-render keeps them
    const total = segDrafts.reduce((a, s) => a + s.seconds, 0);
    if (total > MAX_TOTAL_SEC) { renderSegs(); return; } // blocked: over 60 min (warning shown, values kept)
    addCustomWorkout({ id: editingId, name: els.builderName.value, segments: segDrafts });
    showWorkouts();
  }

  // Programmatic add/update (used by Save and by tests). DRY entry point.
  function addCustomWorkout({ id, name, segments }) {
    const segs = (segments && segments.length ? segments : [{ seconds: 300, speed: 4, kind: 'effort' }])
      .map((s) => ({ seconds: clampDuration(0, s.seconds != null ? s.seconds : (s.minutes || 0) * 60), speed: clampSpeed(s.speed), kind: s.kind || 'effort' }));
    const w = saveCustom({ id: id || undefined, name: name || 'Ma séance', segments: segs }, { storage });
    refreshDropdown();
    selectProgram(w.id); // the new/edited workout becomes the chosen program
    segDrafts = []; segRows = []; editingId = null;
    return w;
  }

  // --- wiring ------------------------------------------------------------------------------
  els.connectBtn.addEventListener('click', connectTreadmill);
  els.hrBtn.addEventListener('click', connectHr);
  els.demoBtn.addEventListener('click', startDemo);
  els.startBtn.addEventListener('click', startWorkout);
  els.pauseBtn.addEventListener('click', pauseWorkout);
  els.resumeBtn.addEventListener('click', resumeWorkout);
  els.stopBtn.addEventListener('click', stopWorkout);
  els.disconnectBtn.addEventListener('click', disconnect);
  els.newBtn.addEventListener('click', () => { state = 'ready'; render(); });
  els.histBtn.addEventListener('click', showHistory);
  els.backBtn.addEventListener('click', goBack);
  els.slower.addEventListener('click', () => nudge(-0.1));
  els.faster.addEventListener('click', () => nudge(0.1));
  els.manageBtn.addEventListener('click', showWorkouts);
  els.newWorkoutBtn.addEventListener('click', () => startBuilder(null));
  els.addSeg.addEventListener('click', addSegRow);
  els.saveWorkout.addEventListener('click', saveBuilder);
  els.cancelWorkout.addEventListener('click', cancelBuilder);
  els.settingsBtn.addEventListener('click', openSettings);
  els.saveSettings.addEventListener('click', applySettings);

  // Helpers needing closure (hoisted; used during DOM creation above).
  function labeledInput(parent, label, value, type = 'number') {
    const row = add('label', { className: 'field' }, parent);
    add('span', { className: 'field-l', textContent: label }, row);
    return add('input', { className: 'inp', type, value }, row);
  }

  selectProgram(programId); setPosition(positionId); setSex(curSex); render();

  return {
    els, connectTreadmill, connectHr, startDemo, startWorkout, stopWorkout, disconnect,
    selectProgram, setPosition, setSpeed, addCustomWorkout, showHistory, showSessionDetail, deleteSessionRow, goBack, openSettings, applySettings,
    showWorkouts, startBuilder, saveBuilder, pauseWorkout, resumeWorkout,
    setStreak(t) { els.streak.textContent = t; },
    set onFinish(fn) { onFinish = fn; }, set onProgram(fn) { onProgram = fn; }, set onPosition(fn) { onPosition = fn; }, set onSettings(fn) { onSettings = fn; }, set onVest(fn) { onVest = fn; },
    get weightKg() { return curWeight; }, get vestKg() { return curVest; }, get maxHr() { return curMaxHr; }, get positions() { return curPositions; },
    get goalType() { return curGoalType; }, get goalKm() { return curGoalKm; }, get goalSteps() { return curGoalSteps; },
    get state() { return state; }, get programId() { return programId; }, get positionId() { return positionId; },
    get manualSpeed() { return manualSpeed; }, get lastSummary() { return lastSummary; }, get controllable() { return controllable; },
  };
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function num(v, dflt) { const n = Number(v); return Number.isFinite(n) ? n : dflt; }
function parseDec(v) { const n = Number(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : 0; } // accepts "10,5"
function kindShort(k) { return k === 'recovery' ? 'Récup' : k === 'warmup' ? 'Échauf' : 'Effort'; }
function cycleKind(k) { return k === 'effort' ? 'recovery' : k === 'recovery' ? 'warmup' : 'effort'; }
function degOf(positions, id) { const p = positions.find((x) => x.id === id); return p && p.degrees != null ? p.degrees : 0; }
// Set innerHTML where available (real DOM); fall back to textContent for the fake test DOM.
function setHTML(el, html) { if ('innerHTML' in el) el.innerHTML = html; else el.textContent = html; }
