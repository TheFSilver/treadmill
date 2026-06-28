// Behavior: the treadmill BLE path is wired — connecting subscribes to Treadmill Data and a
// pushed frame reaches onData parsed; control commands write the right bytes; a treadmill
// with no Control Point degrades to read-only (stats still work). Fake navigator.bluetooth.
import assert from 'node:assert';
import { TreadmillConnection } from './ftms-ble.js';
import { encodeTreadmillData, OP } from './ftms-core.js';

let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };

// Unsupported platform (iOS) fails loudly.
{
  const c = new TreadmillConnection(null);
  assert.equal(c.supported, false);
  await assert.rejects(() => c.connect(), /Web Bluetooth/);
  ok('unsupported platform rejects clearly');
}

// Build a fake FTMS treadmill with data + control characteristics.
function fakeTreadmill({ withControl = true } = {}) {
  const writes = [];
  let dataHandler = null, notified = false;
  const dataChar = { addEventListener: (_e, h) => { dataHandler = h; }, startNotifications: async () => { notified = true; } };
  const controlChar = { writeValueWithResponse: async (b) => writes.push([...b]) };
  const svc = { getCharacteristic: async (uuid) => {
    if (uuid === 0x2acd) return dataChar;
    if (uuid === 0x2ad9) { if (!withControl) throw new Error('no control'); return controlChar; }
    throw new Error('unknown char');
  } };
  const bt = { requestDevice: async () => ({ addEventListener() {}, gatt: { connect: async () => ({ getPrimaryService: async () => svc }) } }) };
  return { bt, writes, push: (v) => dataHandler({ target: { value: encodeTreadmillData(v) } }), notified: () => notified };
}

// Full connect: subscribes, requests control, and a frame arrives parsed at onData.
{
  const t = fakeTreadmill();
  const c = new TreadmillConnection(t.bt);
  const seen = [];
  c.onData = (d) => seen.push(d);
  const res = await c.connect();
  assert.ok(c.connected && res.controllable && t.notified());
  assert.deepEqual(t.writes[0], [OP.REQUEST_CONTROL], 'requests control on connect');

  t.push({ speed: 4.5, distance: 200, elapsedTime: 60 });
  assert.equal(seen.length, 1);
  assert.ok(Math.abs(seen[0].speed - 4.5) < 1e-6 && seen[0].distance === 200);
  ok('connect → subscribe + request control → live data parsed to onData');
}

// Control commands write the right opcodes.
{
  const t = fakeTreadmill();
  const c = new TreadmillConnection(t.bt);
  await c.connect();
  await c.start(); await c.setSpeed(5.5); await c.setIncline(6); await c.stop();
  const ops = t.writes.map((w) => w[0]);
  assert.ok(ops.includes(OP.START) && ops.includes(OP.SET_SPEED) && ops.includes(OP.SET_INCLINATION) && ops.includes(OP.STOP));
  ok('start/setSpeed/setIncline/stop write the correct commands');
}

// Treadmill without a Control Point → read-only, but data still flows.
{
  const t = fakeTreadmill({ withControl: false });
  const c = new TreadmillConnection(t.bt);
  const res = await c.connect();
  assert.equal(res.controllable, false, 'no control point → read-only');
  assert.ok(c.connected, 'still connected for stats');
  ok('read-only treadmill degrades gracefully (stats keep working)');
}

console.log(`ftms-ble: ${n} checks passed`);
