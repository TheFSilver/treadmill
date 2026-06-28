// Behavior: the SW turns a push payload into a sensible notification — JSON parsed, plain
// text tolerated, sane defaults so a malformed push never throws in the service worker.
import assert from 'node:assert';
import { notificationFromPush } from './push-format.js';

let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };

{
  const { title, options } = notificationFromPush(JSON.stringify({ title: 'Resonance 🫀', body: 'Cohérence', vibrate: [50] }));
  assert.equal(title, 'Resonance 🫀');
  assert.equal(options.body, 'Cohérence');
  assert.deepEqual(options.vibrate, [50]);
  ok('parses a JSON push into title/body/vibrate');
}
{
  const { title, options } = notificationFromPush('pas du json');
  assert.equal(title, 'Resonance');
  assert.equal(options.body, 'pas du json');
  ok('non-JSON payload falls back to body text');
}
{
  const { title, options } = notificationFromPush('');
  assert.equal(title, 'Resonance');
  assert.ok(Array.isArray(options.vibrate) && options.icon);
  ok('empty payload → safe defaults (never throws in the SW)');
}

console.log(`push-format: ${n} checks passed`);
