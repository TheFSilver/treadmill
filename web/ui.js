// ui.js — wires the DOM to the workout engine. Dependency-injected (treadmill + optional H10
// connections, session, dropdown, notifier, simulator, scheduler) so it boots and is tested
// in Node with a fake document. A single render() owns visibility (DRY) — nothing irrelevant
// shows: no live stats until running, control buttons only if the treadmill is controllable.
//
// The 1 Hz loop reads frames via a getFrame() that always returns { parsed, hr } — one shape
// for both the real device (latest BLE frame, decoupled from the BLE rate) and the simulator.

import { parseTreadmillData } from './ftms-core.js';
import { getProgram, PROGRAMS } from './session.js';
import { DEFAULT_POSITIONS } from './incline.js';
import { createDropdown } from './dropdown.js';

const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function mount(doc, deps) {
  const {
    treadmill, h10, makeSession, makeSimulator, notifier = { notify() {}, buzz() {} },
    weightKg = 75, maxHr = 190, positions = DEFAULT_POSITIONS,
    defaultProgramId = 'free', defaultPositionId = 1,
    schedule = (fn, ms) => setInterval(fn, ms), unschedule = (id) => clearInterval(id),
  } = deps;

  const root = doc.getElementById('app');
  const add = (tag, props = {}, parent = root) => { const e = doc.createElement(tag); Object.assign(e, props); parent.appendChild(e); return e; };

  const els = {};
  els.status = add('div', { id: 'status', className: 'status', textContent: 'Déconnecté' });
  els.streak = add('div', { id: 'streak', className: 'streak', textContent: '' });

  els.dropdown = createDropdown(doc, { items: PROGRAMS.map((p) => ({ id: p.id, label: p.name })), placeholder: 'Programme', onSelect: (id) => selectProgram(id) });
  root.appendChild(els.dropdown.el);

  // Incline position selector — the FitShow dead-angle, front and center.
  els.inclineRow = add('div', { id: 'incline', className: 'incline-row' });
  add('span', { className: 'incline-label', textContent: 'Inclinaison' }, els.inclineRow);
  els.posButtons = {};
  for (const p of positions) {
    els.posButtons[p.id] = add('button', { className: 'pos', textContent: `${p.label} (${p.grade}%)` }, els.inclineRow);
    els.posButtons[p.id].addEventListener('click', () => setPosition(p.id));
  }

  els.metrics = add('div', { id: 'metrics', className: 'metrics' });
  els.speed = add('div', { id: 'speed', className: 'big', textContent: '0.0' }, els.metrics);
  add('div', { className: 'unit', textContent: 'km/h' }, els.metrics);
  els.subline = add('div', { id: 'subline', className: 'subline', textContent: '' }, els.metrics);
  els.hr = add('div', { id: 'hr', className: 'hr', textContent: '' }, els.metrics);
  els.target = add('div', { id: 'target', className: 'target', textContent: '' }, els.metrics);

  els.controls = add('div', { id: 'controls', className: 'controls' });
  els.connectBtn = add('button', { id: 'connect', className: 'btn primary', textContent: 'Connecter le tapis' }, els.controls);
  els.hrBtn = add('button', { id: 'connectHr', className: 'btn', textContent: 'Connecter le H10 (FC)' }, els.controls);
  els.simBtn = add('button', { id: 'sim', className: 'btn', textContent: 'Démo' }, els.controls);
  els.startBtn = add('button', { id: 'start', className: 'btn primary', textContent: 'Démarrer' }, els.controls);
  els.slower = add('button', { id: 'slower', className: 'btn', textContent: '−' }, els.controls);
  els.faster = add('button', { id: 'faster', className: 'btn', textContent: '+' }, els.controls);
  els.stopBtn = add('button', { id: 'stop', className: 'btn ghost', textContent: 'Stop' }, els.controls);

  let timer = null, sim = null, running = false, controllable = false, hrConnected = false;
  let programId = defaultProgramId, positionId = defaultPositionId, lastHr = null, lastTargetSpeed = null;
  let manualSpeed = 4, session = null, latestFrame = {}, onFinish = () => {}, onProgram = () => {};

  function render() {
    els.metrics.hidden = !running;
    els.startBtn.hidden = !(running && controllable);   // belt start, only while session active + controllable
    els.slower.hidden = els.faster.hidden = !(running && controllable);
    els.stopBtn.hidden = !running;
    els.connectBtn.hidden = running;
    els.hrBtn.hidden = running || hrConnected;
    els.simBtn.hidden = running;
    els.dropdown.el.hidden = running;
    for (const id in els.posButtons) els.posButtons[id].className = Number(id) === positionId ? 'pos on' : 'pos';
  }

  function selectProgram(id) { programId = id; els.dropdown.setValue(id, { silent: true }); onProgram(id); }
  function setPosition(id) { positionId = id; if (session) session.setPosition(id); render(); }

  function paint(r) {
    els.speed.textContent = r.speed.toFixed(1);
    els.subline.textContent = `${fmtTime(r.elapsedSec)} · ${(r.distanceM / 1000).toFixed(2)} km · ${Math.round(r.calories)} kcal · ${r.grade}%`;
    els.hr.textContent = r.hr ? `♥ ${r.hr} · Z${r.zone}` : '';
    els.target.textContent = r.targetSpeed != null ? `objectif ${r.targetSpeed} km/h` : '';
  }

  function tick(getFrame) {
    const { parsed, hr } = getFrame();
    const r = session.update(parsed || {}, hr ?? lastHr);
    if (controllable && r.targetSpeed != null && r.targetSpeed !== lastTargetSpeed) {
      lastTargetSpeed = r.targetSpeed; treadmill.setSpeed(r.targetSpeed).catch(() => {});
    }
    paint(r);
    if (r.done) finish();
    return r;
  }

  function finish() {
    const s = session.summary();
    stop();
    const msg = `${(s.distanceM / 1000).toFixed(2)} km · ${s.calories} kcal · ${fmtTime(s.durationSec)}`;
    els.status.textContent = msg;
    notifier.notify('Séance terminée', { body: msg, vibration: [120, 60, 120] });
    onFinish({ activity: 'treadmill', program: programId, ...s });
  }

  // Single start path (DRY). Callers stop() any prior run first. getFrame → { parsed, hr }.
  function beginLoop(getFrame, statusText) {
    session = makeSession({ weightKg, positionId, positions, maxHr, program: getProgram(programId).segments ? getProgram(programId) : null });
    running = true; lastTargetSpeed = null;
    els.status.textContent = statusText;
    timer = schedule(() => tick(getFrame), 1000);
    render();
    return session;
  }

  async function connectTreadmill() {
    stop();
    els.status.textContent = 'Connexion…';
    try {
      const res = await treadmill.connect();
      controllable = !!res.controllable;
      treadmill.onData = (parsed) => { latestFrame = parsed; };  // BLE pushes; loop reads latest
      beginLoop(() => ({ parsed: latestFrame, hr: lastHr }), controllable ? 'Tapis connecté' : 'Tapis connecté (lecture seule)');
    } catch (e) { els.status.textContent = 'Erreur : ' + e.message; render(); }
  }

  async function connectHr() {
    try { await h10.connect(); h10.onData = (d) => { lastHr = d.hr; }; hrConnected = true; els.hrBtn.textContent = 'H10 connecté'; render(); }
    catch (e) { els.status.textContent = 'H10 : ' + e.message; }
  }

  function startDemo() {
    stop();
    sim = makeSimulator(); sim.start();
    beginLoop(() => { const f = sim.next(1); return { parsed: parseTreadmillData(f.data), hr: f.hr }; }, `Démo · ${getProgram(programId).name}`);
  }

  function stop() {
    if (timer) { unschedule(timer); timer = null; }
    if (controllable && treadmill.stop) treadmill.stop().catch(() => {});
    if (sim) { sim.stop(); sim = null; }
    running = false; render();
  }

  els.connectBtn.addEventListener('click', connectTreadmill);
  els.hrBtn.addEventListener('click', connectHr);
  els.simBtn.addEventListener('click', startDemo);
  els.startBtn.addEventListener('click', () => { if (controllable) treadmill.start().catch(() => {}); });
  els.faster.addEventListener('click', () => { manualSpeed = Math.min(12, manualSpeed + 0.5); if (controllable) treadmill.setSpeed(manualSpeed).catch(() => {}); });
  els.slower.addEventListener('click', () => { manualSpeed = Math.max(0.5, manualSpeed - 0.5); if (controllable) treadmill.setSpeed(manualSpeed).catch(() => {}); });
  els.stopBtn.addEventListener('click', stop);

  selectProgram(programId); setPosition(positionId); render();

  return {
    els, startDemo, connectTreadmill, connectHr, stop, selectProgram, setPosition,
    setStreak(t) { els.streak.textContent = t; },
    set onFinish(fn) { onFinish = fn; }, set onProgram(fn) { onProgram = fn; },
    get running() { return running; }, get programId() { return programId; }, get positionId() { return positionId; },
  };
}
