// wakelock.js — keep the screen awake during a workout (you glance at the treadmill, you
// don't want it sleeping). Thin wrapper over the Screen Wake Lock API, navigator injected so
// it's testable and degrades silently where unsupported.

export function createWakeLock(nav = (typeof navigator !== 'undefined' ? navigator : null)) {
  let lock = null;
  return {
    get supported() { return !!(nav && nav.wakeLock); },
    async request() {
      if (!nav || !nav.wakeLock) return false;
      try { lock = await nav.wakeLock.request('screen'); return true; } catch { return false; }
    },
    release() { try { lock && lock.release && lock.release(); } catch {} lock = null; },
    get active() { return !!lock; },
  };
}
