// Behavior: notifications show only when permission is granted, haptics always fire (even
// without permission — eyes-closed cue), and permission requests flow correctly. APIs injected.
import assert from 'node:assert';
import { createNotifier } from './notify.js';

let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };

function fakeNotification(permission) {
  const made = [];
  function N(title, opts) { made.push({ title, opts }); }
  N.permission = permission;
  N.requestPermission = async () => { N.permission = 'granted'; return 'granted'; };
  N._made = made;
  return N;
}

// Granted: notify() shows a notification AND vibrates.
{
  const N = fakeNotification('granted');
  const buzzed = [];
  const notifier = createNotifier({ notification: N, vibrate: (p) => buzzed.push(p) });
  const shown = notifier.notify('Séance terminée', { body: 'Bravo', vibration: [120, 60, 120] });
  assert.ok(shown && N._made.length === 1 && N._made[0].title === 'Séance terminée');
  assert.deepEqual(buzzed, [[120, 60, 120]], 'vibration fired with notification');
  ok('granted → shows notification + vibrates');
}

// Not granted: NO notification, but the haptic STILL fires (eyes-closed cue works anyway).
{
  const N = fakeNotification('default');
  const buzzed = [];
  const notifier = createNotifier({ notification: N, vibrate: (p) => buzzed.push(p) });
  const shown = notifier.notify('x', { vibration: [200] });
  assert.equal(shown, false, 'no notification without permission');
  assert.equal(N._made.length, 0);
  assert.deepEqual(buzzed, [[200]], 'haptic still fires');
  ok('no permission → no notification, but haptic still fires');
}

// requestPermission flips to granted; denied/granted are returned as-is.
{
  const N = fakeNotification('default');
  const notifier = createNotifier({ notification: N });
  assert.equal(await notifier.requestPermission(), 'granted');
  const denied = createNotifier({ notification: fakeNotification('denied') });
  assert.equal(await denied.requestPermission(), 'denied');
  ok('requestPermission resolves correctly');
}

// No Notification API at all (e.g. unsupported) → graceful.
{
  const notifier = createNotifier({ notification: null, vibrate: null });
  assert.equal(notifier.supported, false);
  assert.equal(notifier.notify('x', {}), false);
  assert.equal(notifier.buzz(), false);
  ok('unsupported environment degrades gracefully');
}

console.log(`notify: ${n} checks passed`);
