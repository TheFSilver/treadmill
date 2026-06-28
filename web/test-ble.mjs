// Behavior: the Bluetooth path is actually wired — connecting subscribes to HR
// notifications, and a real-shaped packet from the strap reaches onData as parsed {hr,rr}.
// Uses a fake navigator.bluetooth (no hardware). This is the "is the sensor button wired"
// integration check for the BLE layer.
import assert from 'node:assert';
import { H10Connection } from './web-ble.js';
import { encodeHeartRate } from './h10-core.js';

let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };

// No Web Bluetooth (e.g. iOS) → fails loudly, not silently.
{
  const c = new H10Connection(null);
  assert.equal(c.supported, false);
  await assert.rejects(() => c.connect(), /Web Bluetooth/);
  ok('unsupported platform rejects with a clear error');
}

// Fake H10: connect wires notifications; a pushed packet arrives parsed at onData.
{
  let handler = null, notified = false;
  const char = {
    addEventListener(_e, h) { handler = h; },
    async startNotifications() { notified = true; },
  };
  const fakeBt = {
    async requestDevice() {
      return {
        addEventListener() {},
        gatt: { async connect() {
          return { async getPrimaryService() {
            return { async getCharacteristic() { return char; } };
          } };
        } },
      };
    },
  };

  const c = new H10Connection(fakeBt);
  const seen = [];
  c.onData = (d) => seen.push(d);
  await c.connect();
  assert.ok(c.connected && notified && handler, 'connect subscribed to notifications');

  // Strap pushes a beat: HR 58, RR 1020ms.
  handler({ target: { value: encodeHeartRate({ hr: 58, rr: [1020] }) } });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].hr, 58);
  assert.ok(Math.abs(seen[0].rr[0] - 1020) < 1, 'RR reached the callback parsed');
  ok('connect→notify→parse delivers live {hr,rr} to onData');
}

console.log(`ble: ${n} checks passed`);
