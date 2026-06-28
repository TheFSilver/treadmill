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
import { WorkoutSession } from './session.js';
import { getWorkout, allWorkouts, saveCustom } from './workouts.js';
import { DEFAULT_POSITIONS } from './incline.js';
import { createDropdown } from './dropdown.js';

const ZONE_LABELS = ['repos', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const km = (m) => (m / 1000).toFixed(2);

export function mount(doc, deps) {
  const {
    treadmill, h10, makeSession = (o) => new WorkoutSession(o), makeSimulator,
    notifier = { notify() {}, buzz() {} }, storage,
    weightKg = 75, maxHr = 190, positions = DEFAULT_POSITIONS,
    defaultProgramId = 'free', defaultPositionId = 1,
    loadHistory = () => [], summarizeHistory = () => ({ total: 0, days: 0 }),
    quickSpeeds = [2, 4, 6, 8],
    schedule = (fn, ms) => setInterval(fn, ms), unschedule = (id) => clearInterval(id),
  } = deps;

  const root = doc.getElementById('app');
  const add = (tag, props = {}, parent = root) => { const e = doc.createElement(tag); Object.assign(e, props); parent.appendChild(e); return e; };

  // --- DOM ---------------------------------------------------------------------------------
  const els = {};
  els.status = add('div', { id: 'status', className: 'status', textContent: 'Déconnecté' });
  els.streak = add('div', { id: 'streak', className: 'streak', textContent: '' });

  els.setup = add('div', { id: 'setup', className: 'setup' });
  els.dropdown = createDropdown(doc, { items: allWorkouts({ storage }).map((w) => ({ id: w.id, label: w.name })), placeholder: 'Programme', onSelect: (id) => selectProgram(id) });
  els.setup.appendChild(els.dropdown.el);
  els.newWorkoutBtn = add('button', { id: 'newWorkout', className: 'link', textContent: '+ Créer une séance' }, els.setup);

  // Incline lives OUTSIDE setup so it stays visible during an active workout (setup is hidden then).
  els.inclineRow = add('div', { id: 'incline', className: 'incline-row' });
  add('span', { className: 'incline-label', textContent: 'Inclinaison' }, els.inclineRow);
  els.posButtons = {};
  for (const p of positions) {
    const tag = p.degrees != null ? `${p.degrees}°` : `${p.grade}%`;
    els.posButtons[p.id] = add('button', { className: 'pos', textContent: `${p.label} (${tag})` }, els.inclineRow);
    els.posButtons[p.id].addEventListener('click', () => setPosition(p.id));
  }

  // Custom workout builder (FitShow premium "design your own", free).
  els.builder = add('div', { id: 'builder', className: 'builder', hidden: true });
  els.builderName = add('input', { id: 'wname', className: 'inp', placeholder: 'Nom de la séance' }, els.builder);
  els.segList = add('div', { id: 'segs', className: 'seg-list' }, els.builder);
  els.addSeg = add('button', { className: 'btn small', textContent: '+ Segment' }, els.builder);
  els.saveWorkout = add('button', { className: 'btn primary small', textContent: 'Enregistrer' }, els.builder);

  // Live metrics.
  els.metrics = add('div', { id: 'metrics', className: 'metrics' });
  els.speed = add('div', { id: 'speed', className: 'big', textContent: '0.0' }, els.metrics);
  add('div', { className: 'unit', textContent: 'km/h' }, els.metrics);
  els.target = add('div', { id: 'target', className: 'target', textContent: '' }, els.metrics);
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
  els.stopBtn = add('button', { id: 'stop', className: 'btn ghost', textContent: 'Stop' }, els.controls);
  els.newBtn = add('button', { id: 'new', className: 'btn primary', textContent: 'Nouvelle séance' }, els.controls);
  els.histBtn = add('button', { id: 'hist', className: 'btn', textContent: 'Historique' }, els.controls);
  els.disconnectBtn = add('button', { id: 'disconnect', className: 'btn ghost', textContent: 'Déconnecter' }, els.controls);

  // --- state -------------------------------------------------------------------------------
  let state = 'idle';            // idle | ready | active | summary | history
  let prevState = 'idle';
  let timer = null, sim = null, controllable = false, hrConnected = false, isDemo = false;
  let programId = defaultProgramId, positionId = defaultPositionId;
  let latestFrame = {}, lastHr = null, lastTargetSpeed = null, manualSpeed = 4;
  let session = null, lastSummary = null, segDrafts = [];
  let onFinish = () => {}, onProgram = () => {}, onPosition = () => {};

  // --- render: single source of visibility -------------------------------------------------
  function show(el, on) { el.hidden = !on; }
  function render() {
    show(els.setup, state === 'ready');
    show(els.builder, state === 'ready' && builderOpen);
    show(els.metrics, state === 'active');
    show(els.summary, state === 'summary' || state === 'history');
    show(els.speedctl, state === 'active' && controllable);
    // incline visible whenever a workout context exists (affects the calc live)
    show(els.inclineRow, state === 'ready' || state === 'active');
    show(els.connectBtn, state === 'idle');
    show(els.demoBtn, state === 'idle');
    show(els.hrBtn, state === 'idle' || (state === 'ready' && !hrConnected));
    show(els.startBtn, state === 'ready');
    show(els.disconnectBtn, state === 'ready');
    show(els.stopBtn, state === 'active');
    show(els.newBtn, state === 'summary');
    show(els.histBtn, state === 'summary' || state === 'ready');
    for (const id in els.posButtons) els.posButtons[id].className = Number(id) === positionId ? 'pos on' : 'pos';
  }
  let builderOpen = false;

  function selectProgram(id) { programId = id; els.dropdown.setValue(id, { silent: true }); onProgram(id); }
  function setPosition(id) { positionId = id; if (session) session.setPosition(id); onPosition(id); render(); }

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
    els.target.textContent = r.targetSpeed != null ? `objectif ${r.targetSpeed} km/h` : '';
    els.mTime.textContent = `⏱ ${fmtTime(r.elapsedSec)}`;
    els.mDist.textContent = `📏 ${km(r.distanceM)} km`;
    els.mKcal.textContent = `🔥 ${Math.round(r.calories)} kcal`;
    els.mSteps.textContent = `👣 ${r.steps}`;
    els.mHr.textContent = r.hr ? `♥ ${r.hr} · ${ZONE_LABELS[r.zone]}` : '♥ —';
  }

  // --- connect / demo ----------------------------------------------------------------------
  async function connectTreadmill() {
    els.status.textContent = 'Connexion…';
    try {
      const res = await treadmill.connect();
      controllable = !!res.controllable; isDemo = false;
      treadmill.onData = (parsed) => { latestFrame = parsed; };
      els.status.textContent = controllable ? 'Tapis connecté' : 'Tapis connecté (lecture seule)';
      state = 'ready'; startLoop(); render();
    } catch (e) { els.status.textContent = 'Erreur : ' + e.message; render(); }
  }
  async function connectHr() {
    try { await h10.connect(); h10.onData = (d) => { lastHr = d.hr; }; hrConnected = true; els.hrBtn.textContent = 'H10 ✓'; render(); }
    catch (e) { els.status.textContent = 'H10 : ' + e.message; }
  }
  function startDemo() {
    isDemo = true; controllable = true; sim = makeSimulator();
    els.status.textContent = 'Démo'; state = 'ready'; startLoop(); render();
  }

  // --- workout lifecycle -------------------------------------------------------------------
  function startWorkout() {
    const w = getWorkout(programId, { storage });
    session = makeSession({ weightKg, positionId, positions, maxHr, program: w.segments ? w : null });
    lastTargetSpeed = null; state = 'active';
    if (isDemo && sim) sim.start();
    if (controllable) treadmill.start && treadmill.start().catch(() => {});
    els.status.textContent = `En cours · ${w.name}`;
    notifier.buzz([60]);
    render();
  }

  function finishWorkout() {
    if (controllable && treadmill.stop) treadmill.stop().catch(() => {});
    if (isDemo && sim) sim.stop();
    lastSummary = session.summary();
    lastSummary.program = getWorkout(programId, { storage }).name;
    renderSummary(lastSummary);
    state = 'summary';
    const msg = `${km(lastSummary.distanceM)} km · ${lastSummary.calories} kcal · ${fmtTime(lastSummary.durationSec)}`;
    els.status.textContent = 'Séance terminée';
    notifier.notify('Séance terminée', { body: msg, vibration: [120, 60, 120] });
    onFinish({ activity: 'treadmill', programId, ...lastSummary });
    render();
  }
  function stopWorkout() { if (state === 'active') finishWorkout(); }

  function renderSummary(s) {
    const zonesTotal = s.zoneSeconds.reduce((a, b) => a + b, 0) || 1;
    const rows = [
      ['Durée', fmtTime(s.durationSec)],
      ['Distance', `${km(s.distanceM)} km`],
      ['Distance équiv. (pente)', `${km(s.gaDistanceM)} km`],
      ['Calories', `${s.calories} kcal`],
      ['Pas', `${s.steps}`],
      ['Vitesse moy', `${s.avgSpeed} km/h`],
      ['Vitesse max', `${s.maxSpeed} km/h`],
      ...(s.avgHr ? [['FC moy', `${s.avgHr} bpm`], ['FC pic', `${s.peakHr} bpm`]] : []),
    ];
    let html = '<div class="sum-title">Récapitulatif</div><div class="sum-grid">';
    for (const [k, v] of rows) html += `<div class="sum-cell"><span class="sum-k">${k}</span><span class="sum-v">${v}</span></div>`;
    html += '</div>';
    if (s.avgHr) {
      html += '<div class="zones">';
      for (let z = 1; z <= 5; z++) { const pct = Math.round((s.zoneSeconds[z] / zonesTotal) * 100); html += `<div class="zbar"><span>${ZONE_LABELS[z]}</span><div class="ztrack"><div class="zfill z${z}" style="width:${pct}%"></div></div><span>${pct}%</span></div>`; }
      html += '</div>';
    }
    setHTML(els.summary, html);
  }

  function showHistory() {
    prevState = state; state = 'history';
    const sessions = loadHistory().slice(-30).reverse();
    const tot = summarizeHistory(loadHistory());
    let html = `<div class="sum-title">Historique</div><div class="hist-tot">${tot.days || 0} jours · ${sessions.length} séances récentes</div><div class="hist-list">`;
    for (const s of sessions) {
      const d = s.date || '';
      html += `<div class="hrow"><span>${d}</span><span>${s.program || ''}</span><span>${km(s.distanceM || 0)} km</span><span>${s.calories || 0} kcal</span><span>${fmtTime(s.durationSec || 0)}</span></div>`;
    }
    if (!sessions.length) html += '<div class="hrow">Aucune séance pour l’instant.</div>';
    html += '</div>';
    setHTML(els.summary, html);
    render();
  }

  function disconnect() {
    stopLoop();
    if (treadmill.disconnect) treadmill.disconnect();
    controllable = false; isDemo = false; sim = null; session = null;
    state = 'idle'; els.status.textContent = 'Déconnecté'; render();
  }

  // --- speed control -----------------------------------------------------------------------
  function setSpeed(v) { manualSpeed = clamp(v, 0.5, 8); if (isDemo && sim) sim.setTarget(manualSpeed); if (controllable) treadmill.setSpeed(manualSpeed).catch(() => {}); }
  function nudge(d) { setSpeed(Math.round((manualSpeed + d) * 10) / 10); } // fine 0.1 step

  // --- custom builder ----------------------------------------------------------------------
  function toggleBuilder() { builderOpen = !builderOpen; if (builderOpen && !segDrafts.length) addSegRow(); render(); renderSegs(); }
  function addSegRow() { segDrafts.push({ minutes: 3, speed: 4 }); }
  function renderSegs() {
    let html = '';
    segDrafts.forEach((s, i) => { html += `<div class="seg">#${i + 1} · ${s.minutes} min @ ${s.speed} km/h</div>`; });
    setHTML(els.segList, html);
  }
  // Programmatic add (used by the form's Save and by tests). DRY entry point.
  function addCustomWorkout({ name, segments }) {
    const w = saveCustom({ name: name || 'Ma séance', segments }, { storage });
    els.dropdown.setItems(allWorkouts({ storage }).map((x) => ({ id: x.id, label: x.name })));
    selectProgram(w.id);
    builderOpen = false; segDrafts = [];
    render();
    return w;
  }

  // --- wiring ------------------------------------------------------------------------------
  els.connectBtn.addEventListener('click', connectTreadmill);
  els.hrBtn.addEventListener('click', connectHr);
  els.demoBtn.addEventListener('click', startDemo);
  els.startBtn.addEventListener('click', startWorkout);
  els.stopBtn.addEventListener('click', stopWorkout);
  els.disconnectBtn.addEventListener('click', disconnect);
  els.newBtn.addEventListener('click', () => { state = 'ready'; render(); });
  els.histBtn.addEventListener('click', showHistory);
  els.slower.addEventListener('click', () => nudge(-0.1));
  els.faster.addEventListener('click', () => nudge(0.1));
  els.newWorkoutBtn.addEventListener('click', toggleBuilder);
  els.addSeg.addEventListener('click', () => { addSegRow(); renderSegs(); });
  els.saveWorkout.addEventListener('click', () => addCustomWorkout({ name: els.builderName.value, segments: segDrafts.slice() }));

  selectProgram(programId); setPosition(positionId); render();

  return {
    els, connectTreadmill, connectHr, startDemo, startWorkout, stopWorkout, disconnect,
    selectProgram, setPosition, setSpeed, addCustomWorkout, showHistory,
    setStreak(t) { els.streak.textContent = t; },
    set onFinish(fn) { onFinish = fn; }, set onProgram(fn) { onProgram = fn; }, set onPosition(fn) { onPosition = fn; },
    get state() { return state; }, get programId() { return programId; }, get positionId() { return positionId; },
    get manualSpeed() { return manualSpeed; }, get lastSummary() { return lastSummary; }, get controllable() { return controllable; },
  };
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
// Set innerHTML where available (real DOM); fall back to textContent for the fake test DOM.
function setHTML(el, html) { if ('innerHTML' in el) el.innerHTML = html; else el.textContent = html; }
