// THE behavior test (per ta règle TDD): the app BOOTS, buttons are WIRED, the loop turns real
// FTMS frames into live stats end-to-end, the incline selector changes the grade used for
// calories, programs drive a target speed to a controllable treadmill, and controls are
// contextual. Fake DOM + manual scheduler → hardware-/browser-free, no leaked timers.
import assert from 'node:assert';
import { mount } from './ui.js';
import { WorkoutSession } from './session.js';
import { makeTreadmillSimulator } from './simulator.js';
import { encodeTreadmillData } from './ftms-core.js';

let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };

function mkEl() {
  return {
    children: [], style: {}, _on: {}, _text: '', hidden: false,
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(e, h) { (this._on[e] ||= []).push(h); },
    click() { (this._on.click || []).forEach((h) => h()); },
    set textContent(v) { this._text = v; }, get textContent() { return this._text; },
  };
}
function fakeDoc() { const app = mkEl(); return { getElementById: () => app, createElement: () => mkEl() }; }
function manualScheduler() { let cb = null; return { schedule: (fn) => { cb = fn; return 1; }, unschedule: () => { cb = null; }, run: (t) => { for (let i = 0; i < t; i++) if (cb) cb(); } }; }

// Fake treadmill connection that lets us push parsed frames + records control writes.
function fakeTreadmill({ controllable = true } = {}) {
  const writes = [];
  const conn = {
    onData: () => {},
    connect: async () => ({ controllable }),
    setSpeed: async (s) => { writes.push(['speed', s]); },
    start: async () => { writes.push(['start']); },
    stop: async () => { writes.push(['stop']); },
  };
  return { conn, writes };
}
const baseDeps = (over = {}) => ({
  treadmill: fakeTreadmill().conn,
  h10: { connect: async () => {}, onData: null },
  makeSession: (o) => new WorkoutSession(o),
  makeSimulator: makeTreadmillSimulator,
  weightKg: 80,
  schedule: () => 1, unschedule: () => {},
  ...over,
});

// 1. Boots; live metrics hidden while idle.
{
  const api = mount(fakeDoc(), baseDeps());
  assert.ok(api.els.connectBtn && api.els.speed && api.els.dropdown);
  assert.equal(api.els.metrics.hidden, true);
  ok('boots; live metrics hidden until running');
}

// 2. Connect wires onData + starts the loop (controllable → Start/speed buttons show).
{
  const t = fakeTreadmill({ controllable: true });
  const sched = manualScheduler();
  const api = mount(fakeDoc(), baseDeps({ treadmill: t.conn, schedule: sched.schedule, unschedule: sched.unschedule }));
  api.els.connectBtn.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(api.running && typeof t.conn.onData === 'function');
  assert.equal(api.els.metrics.hidden, false);
  assert.equal(api.els.startBtn.hidden, false, 'controllable → Start visible');
  // Push a real frame and tick → speed/distance shown.
  t.conn.onData(parseFrame({ speed: 4.5, distance: 300, elapsedTime: 120 }));
  sched.run(1);
  assert.equal(api.els.speed.textContent, '4.5', 'live speed painted from FTMS frame');
  ok('connect → onData wired → FTMS frame becomes live stats');
}

// 3. END-TO-END demo: running ramps speed and accumulates distance/calories.
{
  const sched = manualScheduler();
  const api = mount(fakeDoc(), baseDeps({ schedule: sched.schedule, unschedule: sched.unschedule }));
  api.els.simBtn.click();
  sched.run(120);
  assert.ok(parseFloat(api.els.speed.textContent) > 0, 'belt ramped up');
  assert.ok(/kcal/.test(api.els.subline.textContent), 'subline shows distance + calories');
  ok('end-to-end demo: speed ramps, distance + calories accumulate');
}

// 4. Incline selector changes the grade used (higher position → more calories over same run).
{
  const positions = [{ id: 1, label: 'P1', grade: 0 }, { id: 2, label: 'P2', grade: 10 }];
  const runAt = (pos) => {
    const sched = manualScheduler();
    const api = mount(fakeDoc(), baseDeps({ positions, defaultPositionId: pos, schedule: sched.schedule, unschedule: sched.unschedule }));
    api.els.simBtn.click(); sched.run(120);
    return Number(api.els.subline.textContent.match(/(\d+) kcal/)[1]);
  };
  assert.ok(runAt(2) > runAt(1), 'higher incline position → more kcal (dead-angle fixed)');
  ok('incline selector feeds grade into calorie accounting');
}

// 5. A program drives a target speed to a controllable treadmill.
{
  const t = fakeTreadmill({ controllable: true });
  const sched = manualScheduler();
  const api = mount(fakeDoc(), baseDeps({ treadmill: t.conn, schedule: sched.schedule, unschedule: sched.unschedule }));
  api.selectProgram('intervals');
  api.els.connectBtn.click();
  await new Promise((r) => setTimeout(r, 0));
  sched.run(5);
  assert.ok(t.writes.some((w) => w[0] === 'speed'), 'program pushed a target speed to the belt');
  ok('program drives target speed to the treadmill (custom workouts/plans, free)');
}

// 6. Read-only treadmill: no Start/speed buttons, but stats still run.
{
  const t = fakeTreadmill({ controllable: false });
  const sched = manualScheduler();
  const api = mount(fakeDoc(), baseDeps({ treadmill: t.conn, schedule: sched.schedule, unschedule: sched.unschedule }));
  api.els.connectBtn.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(api.els.startBtn.hidden, true, 'no Start when read-only');
  assert.equal(api.els.metrics.hidden, false, 'stats still shown');
  ok('read-only treadmill: controls hidden, stats still work');
}

console.log(`boot/integration: ${n} checks passed`);

// helper: build a parsed FTMS frame the way ftms-ble would deliver it.
import { parseTreadmillData } from './ftms-core.js';
function parseFrame(v) { return parseTreadmillData(encodeTreadmillData(v)); }
