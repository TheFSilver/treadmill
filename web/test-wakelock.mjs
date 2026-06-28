// Behavior: the wake lock requests/releases the screen lock via the injected navigator, and
// degrades silently when unsupported (so a workout never crashes on an old browser).
import assert from 'node:assert';
import { createWakeLock } from './wakelock.js';

let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };

// Supported: request acquires a sentinel, release frees it.
{
  let released = false;
  const nav = { wakeLock: { request: async () => ({ release() { released = true; } }) } };
  const wl = createWakeLock(nav);
  assert.ok(wl.supported);
  assert.equal(await wl.request(), true);
  assert.ok(wl.active, 'active after request');
  wl.release();
  assert.ok(released && !wl.active, 'released frees the lock');
  ok('request/release acquire and free the screen lock');
}

// Unsupported: no throw, returns false.
{
  const wl = createWakeLock(null);
  assert.equal(wl.supported, false);
  assert.equal(await wl.request(), false);
  wl.release(); // must not throw
  ok('degrades silently when wake lock is unsupported');
}

console.log(`wakelock: ${n} checks passed`);
