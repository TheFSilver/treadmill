// Behavior: we decode REAL-shaped FTMS Treadmill Data frames (the bytes the HM1 pushes) and
// build correct Control Point commands (start/stop/set-speed/incline) — the bytes that drive
// the treadmill. If these were wrong, the app would mis-read stats or fail to control.
import assert from 'node:assert';
import {
  parseTreadmillData, encodeTreadmillData,
  requestControl, startCmd, stopCmd, setSpeedCmd, setInclinationCmd, parseControlResponse, OP,
} from './ftms-core.js';

let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };
const near = (a, b, t = 1e-6) => Math.abs(a - b) < t;

// Real frame: flags=0x0084 → bit2 (distance) + bit7 (energy); bit0=0 → speed present.
// speed=0x0226=550→5.50 km/h, distance=0x000190=400 m, energy total=0x0019=25 kcal (+per h/min).
{
  const bytes = [0x84, 0x00, 0x26, 0x02, 0x90, 0x01, 0x00, 0x19, 0x00, 0x00, 0x00, 0x00];
  const r = parseTreadmillData(new DataView(new Uint8Array(bytes).buffer));
  assert.ok(near(r.speed, 5.5), `speed 5.5, got ${r.speed}`);
  assert.equal(r.distance, 400);
  assert.equal(r.energy, 25);
  ok('decodes a real flags-driven frame (speed+distance+energy)');
}

// Round-trip with more fields incl. inclination + heart rate + elapsed time.
{
  const dv = encodeTreadmillData({ speed: 4.2, distance: 1234, inclination: 6, energy: 88, heartRate: 121, elapsedTime: 905 });
  const r = parseTreadmillData(dv);
  assert.ok(near(r.speed, 4.2) && r.distance === 1234 && near(r.inclination, 6));
  assert.equal(r.energy, 88); assert.equal(r.heartRate, 121); assert.equal(r.elapsedTime, 905);
  ok('round-trips speed/distance/inclination/energy/HR/time');
}

// "No speed" frame (bit0=1) is handled without misreading later fields.
{
  const dv = encodeTreadmillData({ distance: 50 });   // no speed → flags bit0 set
  const r = parseTreadmillData(dv);
  assert.ok(!('speed' in r) && r.distance === 50);
  ok('handles a frame with no instantaneous speed');
}

assert.throws(() => parseTreadmillData(null));
ok('rejects non-DataView input');

// Control Point commands are the exact opcode byte sequences.
assert.deepEqual([...requestControl()], [OP.REQUEST_CONTROL]);
assert.deepEqual([...startCmd()], [OP.START]);
assert.deepEqual([...stopCmd()], [OP.STOP, 0x01]);
assert.deepEqual([...setSpeedCmd(5.5)], [OP.SET_SPEED, 0x26, 0x02]);     // 550 = 0x0226
assert.deepEqual([...setInclinationCmd(6)], [OP.SET_INCLINATION, 0x3c, 0x00]); // 60 = 0x003c
ok('builds correct start/stop/set-speed/set-incline commands');

// Control Point response parsing (success vs failure).
{
  const okResp = parseControlResponse(new DataView(new Uint8Array([0x80, OP.START, 0x01]).buffer));
  assert.ok(okResp.ok && okResp.requestOp === OP.START);
  const bad = parseControlResponse(new DataView(new Uint8Array([0x80, OP.START, 0x02]).buffer));
  assert.equal(bad.ok, false);
  ok('parses Control Point success/failure responses');
}

console.log(`ftms-core: ${n} checks passed`);
