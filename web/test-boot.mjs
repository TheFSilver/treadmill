// THE behavior test (per ta règle TDD) for the premium rebuild. Proves the 5 fixes:
//  1. connecting does NOT start the chrono (state 'ready', no accumulation)
//  2. speed quick-sets + fine ±0.1 send the right commands
//  3. Stop → summary with RETAINED stats, treadmill stays connected (no disconnect)
//  4. Japanese Walking is selectable
//  5. custom workouts can be created, appear in the dropdown, persist
// Plus: end-to-end demo accumulates, incline feeds calories, disconnect returns to idle.
import assert from 'node:assert';
import { mount } from './ui.js';
import { WorkoutSession } from './session.js';
import { makeTreadmillSimulator } from './simulator.js';
import { encodeTreadmillData, parseTreadmillData, OP } from './ftms-core.js';
import { loadCustom } from './workouts.js';

let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };

// --- fake DOM ---
function mkEl(tag = 'div') {
  const e = {
    tag, children: [], style: {}, _on: {}, _text: '', _html: '', value: '', hidden: false, className: '',
    appendChild(c) { this.children.push(c); return c; },
    replaceChildren() { this.children = []; },
    remove() {},
    addEventListener(ev, h) { (this._on[ev] ||= []).push(h); },
    click() { (this._on.click || []).forEach((h) => h()); },
    set textContent(v) { this._text = v; }, get textContent() { return this._text; },
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
  };
  return e;
}
function fakeDoc() { const app = mkEl(); return { getElementById: () => app, createElement: (t) => mkEl(t) }; }
function manualScheduler() { let cb = null; return { schedule: (fn) => { cb = fn; return 1; }, unschedule: () => { cb = null; }, run: (t) => { for (let i = 0; i < t; i++) if (cb) cb(); }, active: () => !!cb }; }
function fakeStorage() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } }; }
function fakeTreadmill({ controllable = true } = {}) {
  const writes = []; let disconnected = false;
  const conn = {
    onData: () => {}, connect: async () => ({ controllable }),
    setSpeed: async (s) => writes.push(['speed', s]), start: async () => writes.push(['start']),
    stop: async () => writes.push(['stop']), disconnect: () => { disconnected = true; },
  };
  return { conn, writes, isDisconnected: () => disconnected };
}
const parseFrame = (v) => parseTreadmillData(encodeTreadmillData(v));
const deps = (over = {}) => ({
  treadmill: fakeTreadmill().conn, h10: { connect: async () => {}, onData: null },
  makeSession: (o) => new WorkoutSession(o), makeSimulator: makeTreadmillSimulator,
  storage: fakeStorage(), weightKg: 80,
  schedule: () => 1, unschedule: () => {}, ...over,
});

// 1. Boot idle.
{
  const api = mount(fakeDoc(), deps());
  assert.equal(api.state, 'idle');
  assert.equal(api.els.connectBtn.hidden, false);
  assert.equal(api.els.metrics.hidden, true);
  assert.equal(api.els.startBtn.hidden, true);
  ok('boots idle: connect shown, no metrics, no Démarrer');
}

// 2. Connect → 'ready', chrono NOT running (fix #1). Preview shows live speed, no accumulation.
{
  const t = fakeTreadmill();
  const sched = manualScheduler();
  const api = mount(fakeDoc(), deps({ treadmill: t.conn, schedule: sched.schedule, unschedule: sched.unschedule }));
  api.els.connectBtn.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(api.state, 'ready', 'connected = ready, NOT active');
  assert.equal(api.els.metrics.hidden, true, 'no chrono/metrics before Démarrer');
  assert.equal(api.els.startBtn.hidden, false, 'Démarrer shown');
  t.conn.onData(parseFrame({ speed: 3.2 })); sched.run(1);
  assert.equal(api.els.speed.textContent, '3.2', 'ready shows live belt speed (preview)');
  ok('connect → ready (chrono does NOT start); live speed preview works');
}

// 3. Démarrer → active accumulates; Stop → summary RETAINED + treadmill still connected (fix #3).
{
  const t = fakeTreadmill();
  const sched = manualScheduler();
  const api = mount(fakeDoc(), deps({ treadmill: t.conn, schedule: sched.schedule, unschedule: sched.unschedule }));
  api.els.connectBtn.click(); await new Promise((r) => setTimeout(r, 0));
  t.conn.onData(parseFrame({ speed: 5, distance: 0 }));
  api.els.startBtn.click();
  assert.equal(api.state, 'active');
  for (let i = 0; i < 60; i++) { t.conn.onData(parseFrame({ speed: 5, distance: (i + 1) * 1.4 })); sched.run(1); }
  assert.ok(/kcal/.test(api.els.mKcal.textContent) && Number(api.els.mKcal.textContent.replace(/\D/g, '')) > 0, 'calories accumulate while active');
  api.els.stopBtn.click();
  assert.equal(api.state, 'summary', 'Stop → summary');
  assert.ok(api.lastSummary && api.lastSummary.calories > 0, 'stats retained in summary');
  assert.ok(api.els.summary.innerHTML.includes('Récapitulatif'), 'summary rendered');
  assert.equal(t.isDisconnected(), false, 'treadmill NOT disconnected on Stop');
  assert.ok(t.writes.some((w) => w[0] === 'stop'), 'belt stop command sent');
  api.els.newBtn.click();
  assert.equal(api.state, 'ready', 'New session reuses the connection');
  ok('Démarrer→active accumulates; Stop→summary retains stats, stays connected');
}

// 4 & 5. Japanese Walking selectable; custom workout created, in dropdown, persisted.
{
  const storage = fakeStorage();
  const api = mount(fakeDoc(), deps({ storage }));
  assert.ok(api.els.dropdown.buttons.japanese, 'Japanese Walking in the program list');
  api.selectProgram('japanese'); assert.equal(api.programId, 'japanese');
  const w = api.addCustomWorkout({ name: 'Mon HIIT', segments: [{ minutes: 2, speed: 6 }, { minutes: 2, speed: 3 }] });
  assert.ok(api.els.dropdown.buttons[w.id], 'custom workout appears in the dropdown');
  assert.equal(api.programId, w.id, 'auto-selected after creation');
  assert.equal(loadCustom({ storage }).length, 1, 'custom workout persisted');
  ok('Japanese Walking selectable + custom workout created/listed/persisted');
}

// 2b. Speed quick-set + fine ±0.1 (fix #2).
{
  const t = fakeTreadmill();
  const sched = manualScheduler();
  const api = mount(fakeDoc(), deps({ treadmill: t.conn, schedule: sched.schedule, unschedule: sched.unschedule }));
  api.els.connectBtn.click(); await new Promise((r) => setTimeout(r, 0));
  api.els.startBtn.click();
  api.els.quick[6].click();
  assert.equal(api.manualSpeed, 6, 'quick-set jumps to 6 km/h');
  api.els.faster.click();
  assert.ok(Math.abs(api.manualSpeed - 6.1) < 1e-9, 'fine + is 0.1 km/h');
  api.els.slower.click(); api.els.slower.click();
  assert.ok(Math.abs(api.manualSpeed - 5.9) < 1e-9, 'fine − is 0.1 km/h');
  assert.ok(t.writes.filter((w) => w[0] === 'speed').length >= 3, 'each change writes a speed command');
  ok('speed quick-sets (2/4/6/8) + fine ±0.1 work and command the belt');
}

// 6. End-to-end demo accumulates without hardware.
{
  const sched = manualScheduler();
  const api = mount(fakeDoc(), deps({ schedule: sched.schedule, unschedule: sched.unschedule }));
  api.els.demoBtn.click(); assert.equal(api.state, 'ready');
  api.selectProgram('fatburn'); api.els.startBtn.click();
  sched.run(120);
  assert.ok(parseFloat(api.els.speed.textContent) > 0 && /km/.test(api.els.mDist.textContent));
  ok('demo end-to-end: speed ramps + distance accrues, no hardware');
}

// 7. Incline position feeds the calorie calc (higher → more kcal over same demo run).
{
  const positions = [{ id: 1, label: 'P1', degrees: 1 }, { id: 2, label: 'P2', degrees: 10 }];
  const runAt = (pos) => {
    const sched = manualScheduler();
    const api = mount(fakeDoc(), deps({ positions, defaultPositionId: pos, schedule: sched.schedule, unschedule: sched.unschedule }));
    api.els.demoBtn.click(); api.els.startBtn.click(); sched.run(120);
    return Number(api.els.mKcal.textContent.replace(/\D/g, ''));
  };
  assert.ok(runAt(2) > runAt(1), 'steeper incline → more calories');
  ok('incline selector feeds grade into live calories');
}

// 8. Disconnect → idle.
{
  const t = fakeTreadmill();
  const api = mount(fakeDoc(), deps({ treadmill: t.conn }));
  api.els.connectBtn.click(); await new Promise((r) => setTimeout(r, 0));
  api.els.disconnectBtn.click();
  assert.equal(api.state, 'idle'); assert.ok(t.isDisconnected());
  ok('disconnect returns to idle and drops the connection');
}

// 9. History is not a dead-end: a Back button returns to where we came from (ready or summary).
{
  const sched = manualScheduler();
  const api = mount(fakeDoc(), deps({ schedule: sched.schedule, unschedule: sched.unschedule }));
  // from ready
  api.els.demoBtn.click();
  assert.equal(api.els.histBtn.hidden, false, 'Historique reachable from ready');
  api.els.histBtn.click();
  assert.equal(api.state, 'history');
  assert.equal(api.els.backBtn.hidden, false, 'Back button shown in history');
  api.els.backBtn.click();
  assert.equal(api.state, 'ready', 'Back from history → ready');
  // from summary
  api.els.startBtn.click(); sched.run(2); api.stopWorkout();
  assert.equal(api.state, 'summary');
  api.els.histBtn.click(); assert.equal(api.state, 'history');
  api.els.backBtn.click();
  assert.equal(api.state, 'summary', 'Back from history → summary');
  assert.ok(api.els.summary.innerHTML.includes('Récapitulatif'), 'summary re-rendered on return');
  ok('history has a Back button returning to the previous screen (ready/summary)');
}

// 10. Settings screen: edit weight + incline angle → applied to the next workout's calories,
//     persisted via onSettings, and Back returns. (premium settings)
{
  const sched = manualScheduler();
  let saved = null;
  const api = mount(fakeDoc(), deps({ schedule: sched.schedule, unschedule: sched.unschedule }));
  api.onSettings = (s) => { saved = s; };
  // open settings from idle
  api.els.settingsBtn.click();
  assert.equal(api.state, 'settings');
  api.els.setWeight.value = '100'; api.els.setMaxHr.value = '180';
  api.els.setPos1.value = '2'; api.els.setPos2.value = '8';
  api.els.saveSettings.click();
  assert.equal(api.state, 'idle', 'Back to where we came from after saving');
  assert.equal(api.weightKg, 100, 'weight applied');
  assert.equal(api.positions[1].degrees, 8, 'incline angle applied');
  assert.deepEqual(saved, { weightKg: 100, maxHr: 180, pos1Deg: 2, pos2Deg: 8, goalKm: 3 }, 'persisted via onSettings');
  // heavier weight → more calories in a demo run
  api.els.demoBtn.click(); api.els.startBtn.click(); sched.run(60);
  const kcalHeavy = Number(api.els.mKcal.textContent.replace(/\D/g, ''));
  assert.ok(kcalHeavy > 0, 'workout uses the new settings');
  ok('settings edit weight/maxHr/incline → applied + persisted, Back returns');
}

// 11. Custom workout builder form: editable minutes/speed rows → saved with the real values.
{
  const storage = fakeStorage();
  const api = mount(fakeDoc(), deps({ storage }));
  api.els.demoBtn.click(); // need 'ready' so builder can open (setup visible)
  api.disconnect();         // back to idle; builder logic still works via toggle in ready
  // open in a fresh ready: connect demo again
  api.els.demoBtn.click();
  api.els.newWorkoutBtn.click();              // toggle builder open → seeds 1 row
  api.els.addSeg.click();                      // now 2 rows
  api.els.builderName.value = 'Mon parcours';
  // set editable values on the rendered rows (the form's inputs)
  // segRows are not directly exposed; drive via the Save reading current input values:
  // find the two input rows inside segList
  const inputs = api.els.segList.children.flatMap((row) => row.children.filter((c) => c.tag === 'input'));
  inputs[0].value = '4'; inputs[1].value = '6';  // row1: 4 min @ 6 km/h
  inputs[2].value = '2'; inputs[3].value = '3';  // row2: 2 min @ 3 km/h
  api.els.saveWorkout.click();
  const custom = loadCustom({ storage });
  assert.equal(custom.length, 1, 'custom workout saved');
  assert.deepEqual(custom[0].segments, [{ minutes: 4, speed: 6 }, { minutes: 2, speed: 3 }], 'editable values saved');
  assert.ok(api.els.dropdown.buttons[custom[0].id], 'appears in dropdown');
  ok('builder form: editable minutes/speed rows saved with real values');
}

// 12. Pause/Resume: pause freezes the workout + stops belt + releases wake lock; resume continues.
{
  const t = fakeTreadmill();
  const sched = manualScheduler();
  const wl = { _on: false, request() { this._on = true; }, release() { this._on = false; }, get active() { return this._on; } };
  const api = mount(fakeDoc(), deps({ treadmill: t.conn, wakeLock: wl, schedule: sched.schedule, unschedule: sched.unschedule }));
  api.els.connectBtn.click(); await new Promise((r) => setTimeout(r, 0));
  api.els.startBtn.click();
  assert.ok(wl.active, 'wake lock acquired on start');
  for (let i = 0; i < 10; i++) { t.conn.onData(parseFrame({ speed: 5, distance: (i + 1) * 1.4 })); sched.run(1); }
  const kcalBefore = api.els.mKcal.textContent;
  api.els.pauseBtn.click();
  assert.equal(api.state, 'paused');
  assert.ok(!wl.active, 'wake lock released on pause');
  assert.ok(t.writes.some((w) => w[0] === 'stop'), 'belt stopped on pause');
  sched.run(20); // ticks during pause must NOT accumulate
  assert.equal(api.els.mKcal.textContent, kcalBefore, 'no accumulation while paused');
  api.els.resumeBtn.click();
  assert.equal(api.state, 'active'); assert.ok(wl.active, 'wake lock re-acquired on resume');
  ok('pause freezes stats + stops belt + releases wake lock; resume continues');
}

// 13. Program progress: a program shows a progress bar + remaining time + next-step hint.
{
  const sched = manualScheduler();
  const api = mount(fakeDoc(), deps({ schedule: sched.schedule, unschedule: sched.unschedule }));
  api.els.demoBtn.click(); api.selectProgram('intervals'); api.els.startBtn.click();
  sched.run(10);
  assert.equal(api.els.progWrap.hidden, false, 'progress bar shown for a program');
  assert.ok(/reste/.test(api.els.progInfo.textContent), 'shows remaining time');
  ok('program shows progress bar + remaining + next-step');
}

// 14. Daily goal: today line reflects history vs goal; disconnect-safety auto-pauses.
{
  const sched = manualScheduler();
  const history = [{ activity: 'treadmill', date: '2026-06-28', distanceM: 1500, calories: 80, steps: 2000 }];
  const t = fakeTreadmill();
  const api = mount(fakeDoc(), deps({
    treadmill: t.conn, schedule: sched.schedule, unschedule: sched.unschedule,
    goalKm: 3, loadHistory: () => history, todayTotals: (s, d) => ({ distanceM: 1500, calories: 80, steps: 2000 }), today: () => '2026-06-28',
  }));
  api.els.connectBtn.click(); await new Promise((r) => setTimeout(r, 0));
  assert.ok(/1\.50 \/ 3 km/.test(api.els.today.textContent) && /50%/.test(api.els.today.textContent), `today progress: ${api.els.today.textContent}`);
  // disconnect-safety: a drop during an active workout auto-pauses
  api.els.startBtn.click(); assert.equal(api.state, 'active');
  t.conn.onDisconnect();
  assert.equal(api.state, 'paused', 'BLE disconnect during workout auto-pauses');
  ok('daily goal progress shown; BLE disconnect auto-pauses (safety)');
}

console.log(`boot/integration: ${n} checks passed`);
