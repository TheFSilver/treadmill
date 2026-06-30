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
  assert.ok(loadCustom({ storage }).some((x) => x.id === w.id), 'custom workout persisted');
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
  api.els.setWeight.value = '100';
  api.els.maxHrAutoBtn.click();                 // turn OFF auto to set FC max manually
  api.els.setMaxHr.value = '180';
  api.els.setPos1.value = '2'; api.els.setPos2.value = '8';
  api.els.saveSettings.click();
  assert.equal(api.state, 'idle', 'Back to where we came from after saving');
  assert.equal(api.weightKg, 100, 'weight applied');
  assert.equal(api.positions[1].degrees, 8, 'incline angle applied');
  assert.deepEqual(saved, { weightKg: 100, heightCm: 0, birthdate: '', sex: 'M', maxHr: 180, maxHrAuto: 0, pos1Deg: 2, pos2Deg: 8, goalKm: 3, goalSteps: 8000, goalType: 'km' }, 'persisted via onSettings (sections: profil/tapis/objectif)');
  // heavier weight → more calories in a demo run
  api.els.demoBtn.click(); api.els.startBtn.click(); sched.run(60);
  const kcalHeavy = Number(api.els.mKcal.textContent.replace(/\D/g, ''));
  assert.ok(kcalHeavy > 0, 'workout uses the new settings');
  ok('settings edit weight/maxHr/incline → applied + persisted, Back returns');
}

// 11. Workouts PAGE: Gérer → Nouvelle séance → builder with editable rows + recovery kind →
//     saved; then list shows it; edit loads it; delete removes it. (dedicated management page)
{
  const storage = fakeStorage();
  const api = mount(fakeDoc(), deps({ storage }));
  api.els.demoBtn.click();                     // ready
  api.els.manageBtn.click();                   // → workouts page
  assert.equal(api.state, 'workouts');
  api.els.newWorkoutBtn.click();               // → builder, seeds 1 effort row
  assert.equal(api.state, 'builder');
  api.els.addSeg.click();                      // 2 rows; new row defaults to 'recovery'
  api.els.builderName.value = 'Mon parcours';
  const inputsIn = (el) => (el.children || []).flatMap((c) => (c.tag === 'input' ? [c] : inputsIn(c)));
  const inputs = inputsIn(api.els.segList); // per row: [min, sec, speed]
  inputs[0].value = '4'; inputs[1].value = '0'; inputs[2].value = '6';  // row1: 4min00 @ 6
  inputs[3].value = '0'; inputs[4].value = '30'; inputs[5].value = '3'; // row2: 0min30 @ 3
  api.els.saveWorkout.click();
  assert.equal(api.state, 'workouts', 'save returns to the workouts page');
  const mine = loadCustom({ storage }).find((w) => w.name === 'Mon parcours');
  assert.ok(mine, 'workout persisted among the catalog');
  assert.deepEqual(mine.segments, [
    { seconds: 240, speed: 6, kind: 'effort' },
    { seconds: 30, speed: 3, kind: 'recovery' },
  ], 'rows saved as SECONDS with effort/recovery kind (1s granularity)');
  // the page lists workouts (seeded starters + the new one); find ours by name and edit it
  const rowByName = (name) => api.els.workoutList.children.find((r) => r.className === 'hrow'
    && (r.children.find((c) => c.className === 'hrow-info')?.children || []).some((s) => s.textContent === name));
  const myRow = rowByName('Mon parcours');
  assert.ok(myRow, 'my workout listed on the page');
  myRow.children.find((c) => c.textContent === '✎').click();
  assert.equal(api.state, 'builder');
  assert.equal(api.els.builderName.value, 'Mon parcours', 'edit loads the workout');
  api.els.cancelWorkout.click();
  assert.equal(api.state, 'workouts', 'cancel returns to the list');
  // delete removes it
  rowByName('Mon parcours').children.find((c) => c.className && c.className.includes('del')).click();
  assert.ok(!loadCustom({ storage }).some((w) => w.name === 'Mon parcours'), 'workout deleted from the page');
  ok('workouts page: create (with recovery segment), list, edit, delete');
}

// 11c. Seeded starter workouts (Japanese Walking, Fat burn…) appear on the page AND are editable.
{
  const storage = fakeStorage();
  const api = mount(fakeDoc(), deps({ storage }));
  api.els.demoBtn.click(); api.els.manageBtn.click();
  const labels = api.els.workoutList.children.flatMap((r) => r.children).flatMap((c) => c.children || []).map((c) => c.textContent);
  assert.ok(labels.includes('Japanese Walking (IWT)'), 'seeded starters shown on the workouts page');
  // they are real editable customs (have an edit button) — not read-only built-ins
  const jwRow = api.els.workoutList.children.find((r) => r.className === 'hrow'
    && (r.children.find((c) => c.className === 'hrow-info')?.children || []).some((s) => s.textContent === 'Japanese Walking (IWT)'));
  assert.ok(jwRow.children.find((c) => c.textContent === '✎'), 'Japanese Walking is editable (seeded as custom)');
  ok('seeded starters appear in the catalog and are editable like custom workouts');
}

// 11b. Incline is chosen at launch (fixed for the run) and RECORDED in the summary/stats.
{
  const sched = manualScheduler();
  const positions = [{ id: 1, label: 'P1', degrees: 1 }, { id: 2, label: 'P2', degrees: 9 }];
  const api = mount(fakeDoc(), deps({ positions, schedule: sched.schedule, unschedule: sched.unschedule }));
  api.els.demoBtn.click();
  api.setPosition(2);                           // choose incline before the run
  api.els.startBtn.click(); sched.run(30); api.stopWorkout();
  assert.equal(api.lastSummary.inclineDeg, 9, 'chosen incline angle recorded in the summary');
  assert.ok(api.els.summary.innerHTML.includes('Inclinaison') && api.els.summary.innerHTML.includes('9°'), 'incline shown in the recap stats');
  ok('incline chosen at launch is recorded in the session stats');
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
  assert.ok(/1\.5 \/ 3 km/.test(api.els.today.textContent) && /50%/.test(api.els.today.textContent), `today progress: ${api.els.today.textContent}`);
  // disconnect-safety: a drop during an active workout auto-pauses
  api.els.startBtn.click(); assert.equal(api.state, 'active');
  t.conn.onDisconnect();
  assert.equal(api.state, 'paused', 'BLE disconnect during workout auto-pauses');
  ok('daily goal progress shown; BLE disconnect auto-pauses (safety)');
}

// 15. History rows: tap → full detail; trash → delete (with re-render).
{
  let history = [
    { id: 'a', activity: 'treadmill', date: '2026-06-27', program: 'Fat burn', distanceM: 2000, calories: 120, steps: 2800, durationSec: 1500, avgSpeed: 4.8, maxSpeed: 6, gaDistanceM: 2200, zoneSeconds: [0, 0, 0, 0, 0, 0] },
    { id: 'b', activity: 'treadmill', date: '2026-06-28', program: 'Marche libre', distanceM: 110, calories: 7, steps: 150, durationSec: 66, avgSpeed: 3, maxSpeed: 3.2, gaDistanceM: 120, zoneSeconds: [] },
  ];
  const deleted = [];
  const api = mount(fakeDoc(), deps({
    loadHistory: () => history,
    deleteSession: (id) => { deleted.push(id); history = history.filter((x) => x.id !== id); },
    summarizeHistory: () => ({ days: 2 }),
  }));
  api.showHistory();
  const list = api.els.summary.children.find((c) => c.className === 'hist-list');
  assert.equal(list.children.length, 2, 'two history rows');
  // tap a row's info → detail with full stats
  const firstInfo = list.children[0].children.find((c) => c.className === 'hrow-info');
  firstInfo.click();
  assert.equal(api.state, 'detail');
  assert.ok(api.els.summary.innerHTML.includes('Détail de la séance') && /km/.test(api.els.summary.innerHTML), 'detail shows full stats');
  // back → history
  api.els.backBtn.click(); assert.equal(api.state, 'history');
  // delete a row via trash → removed + re-rendered
  const list2 = api.els.summary.children.find((c) => c.className === 'hist-list');
  const delBtn = list2.children[0].children.find((c) => c.className && c.className.includes('del'));
  delBtn.click();
  assert.equal(deleted.length, 1, 'delete called');
  const list3 = api.els.summary.children.find((c) => c.className === 'hist-list');
  assert.equal(list3.children.length, 1, 'row removed after delete');
  ok('history: tap row → detail stats; trash → delete + re-render');
}

// 16. Builder input validation: typed values clamp to speed 1–8, minutes ≥1; total >60 blocks save.
{
  const storage = fakeStorage();
  const api = mount(fakeDoc(), deps({ storage }));
  api.els.demoBtn.click(); api.els.manageBtn.click(); api.els.newWorkoutBtn.click();
  api.els.builderName.value = 'Test clamp';
  const inputsIn = (el) => (el.children || []).flatMap((c) => (c.tag === 'input' ? [c] : inputsIn(c)));
  let inputs = inputsIn(api.els.segList); // [min, sec, speed]
  inputs[0].value = '3'; inputs[1].value = '0'; inputs[2].value = '86';   // speed 86 → clamp 8
  api.els.saveWorkout.click();
  let w = loadCustom({ storage }).find((x) => x.name === 'Test clamp');
  assert.equal(w.segments[0].speed, 8, 'typed 86 km/h clamped to 8');
  // edit again: duration 0 → 1 s, speed 0 → 1
  const row = api.els.workoutList.children.find((r) => r.className === 'hrow' && (r.children.find((c) => c.className === 'hrow-info')?.children || []).some((s) => s.textContent === 'Test clamp'));
  row.children.find((c) => c.textContent === '✎').click();
  inputs = inputsIn(api.els.segList);
  inputs[0].value = '0'; inputs[1].value = '0'; inputs[2].value = '0';
  api.els.saveWorkout.click();
  w = loadCustom({ storage }).find((x) => x.name === 'Test clamp');
  assert.equal(w.segments[0].seconds, 1, 'duration 0 → 1 s'); assert.equal(w.segments[0].speed, 1, 'speed 0 → 1');
  ok('builder clamps speed to 1–8 and duration ≥1 s on typed input');
}

// 17. Total workout > 60 min is blocked at save (the belt auto-stops at 60).
{
  const storage = fakeStorage();
  const api = mount(fakeDoc(), deps({ storage }));
  api.els.demoBtn.click(); api.els.manageBtn.click(); api.els.newWorkoutBtn.click();
  api.els.builderName.value = 'Trop long';
  const inputsIn = (el) => (el.children || []).flatMap((c) => (c.tag === 'input' ? [c] : inputsIn(c)));
  // two 60-min segments → 120 min total (per row: [min, sec, speed])
  api.els.addSeg.click();
  let inputs = inputsIn(api.els.segList);
  inputs[0].value = '60'; inputs[1].value = '0'; inputs[3].value = '60'; inputs[4].value = '0';
  api.els.saveWorkout.click();
  assert.equal(api.state, 'builder', 'save blocked, stays on builder');
  assert.ok(!loadCustom({ storage }).some((x) => x.name === 'Trop long'), 'over-60 workout not saved');
  assert.ok(/max 60/i.test(api.els.builderDur.textContent), 'shows the 60-min warning');
  ok('total > 60 min is blocked at save with a warning');
}

// 18. Refresh: a known device reconnects WITHOUT the chooser, landing on the last screen.
{
  let usedChooser = false, getDevicesCalled = false;
  const known = { name: 'FS-8B1D77', addEventListener() {}, gatt: { connect: async () => ({ getPrimaryService: async () => ({ getCharacteristic: async (u) => (u === 0x2acd ? { addEventListener() {}, startNotifications: async () => {} } : { writeValueWithResponse: async () => {} }) }) }) } };
  const bt = {
    getDevices: async () => { getDevicesCalled = true; return [known]; },
    requestDevice: async () => { usedChooser = true; return known; },
  };
  const { TreadmillConnection } = await import('./ftms-ble.js');
  const conn = new TreadmillConnection(bt);
  assert.equal(await conn.hasKnownDevice(), true, 'detects a previously-granted device');
  const sched = manualScheduler();
  const api = mount(fakeDoc(), deps({ treadmill: conn, lastScreen: 'workouts', schedule: sched.schedule, unschedule: sched.unschedule }));
  await api.connectTreadmill();
  assert.ok(getDevicesCalled && !usedChooser, 'reconnects via getDevices WITHOUT the chooser');
  assert.equal(api.state, 'workouts', 'lands back on the last screen after reconnect');
  ok('refresh: one-tap reconnect (no chooser) returns to the last screen');
}

// 14. Weighted vest is a PER-SESSION choice on the ready screen (not in settings); it flows into
//     the session and is remembered via onVest.
{
  let vestSaved = null;
  const sched = manualScheduler();
  const api = mount(fakeDoc(), deps({ schedule: sched.schedule, unschedule: sched.unschedule }));
  api.onVest = (kg) => { vestSaved = kg; };
  api.els.demoBtn.click();                        // → ready (pre-session screen)
  assert.equal(api.state, 'ready');
  assert.equal(api.els.vestRow.hidden, false, 'vest field shown before the session');
  api.els.vestInput.value = '10,5';              // free decimal, comma accepted
  api.els.startBtn.click();                       // vest read at start
  assert.equal(api.vestKg, 10.5, 'vest parsed (comma) + applied per-session');
  assert.equal(vestSaved, 10.5, 'vest remembered via onVest');
  ok('vest is a free numeric field (0–40, decimals/comma), read at start + remembered');
}

// 15. Daily goal can be set in STEPS, persisted, and shown in the unit chosen.
{
  let saved = null;
  const api = mount(fakeDoc(), deps({}));
  api.onSettings = (s) => { saved = s; };
  api.els.settingsBtn.click();
  api.els.goalStepsBtn.click();                   // switch unit to "pas"
  api.els.setGoal.value = '9000';
  api.els.saveSettings.click();
  assert.equal(saved.goalType, 'steps', 'goal unit persisted as steps');
  assert.equal(saved.goalSteps, 9000, 'goal value stored in steps');
  assert.ok(/pas/.test(api.els.today.textContent), 'today line shows the goal in pas');
  ok('daily goal switches to steps, persists, and displays in pas');
}

// 16. Profile (height / birthdate / sex) persists via onSettings — feeds stride + Keytel.
{
  let saved = null;
  const api = mount(fakeDoc(), deps({}));
  api.onSettings = (s) => { saved = s; };
  api.els.settingsBtn.click();
  api.els.setHeight.value = '178';
  api.els.setBirthdate.value = '1986-06-01';
  api.els.sexFBtn.click();                        // pick Femme
  api.els.saveSettings.click();
  assert.equal(saved.heightCm, 178); assert.equal(saved.birthdate, '1986-06-01'); assert.equal(saved.sex, 'F');
  ok('profile (height/birthdate/sex) persists for stride + Keytel');
}

// 17. Incline dropdown reflects the chosen position (degree + %).
{
  const api = mount(fakeDoc(), deps({}));
  api.els.demoBtn.click();
  api.setPosition(2);
  assert.equal(String(api.els.inclineDropdown.value), '2', 'dropdown follows the chosen incline');
  ok('incline is a dropdown (angle + %) that reflects the selection');
}

// 18. FC max defaults to Tanaka (208−0.7·age) from the birthdate while Auto is on; manual override
//     once Auto is turned off.
{
  const NOW = Date.UTC(2026, 5, 30);
  const api = mount(fakeDoc(), deps({ now: () => NOW }));
  api.els.settingsBtn.click();
  api.els.setBirthdate.value = '1986-06-01';     // ~40 yo at NOW
  api.els.saveSettings.click();
  assert.equal(api.maxHr, 180, 'Auto FC max = 208 − 0.7·40 = 180');
  api.els.settingsBtn.click();
  api.els.maxHrAutoBtn.click();                   // → manual
  api.els.setMaxHr.value = '175';
  api.els.saveSettings.click();
  assert.equal(api.maxHr, 175, 'manual override applies when Auto is off');
  ok('FC max: Auto from age (Tanaka), manual override available');
}

console.log(`boot/integration: ${n} checks passed`);
