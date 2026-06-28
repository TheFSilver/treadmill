// notify.js — local notifications + haptics, NO server. For in-session cues (retention over,
// session done, eyes-closed buzz) while the app/SW is alive. The Notification API and
// navigator.vibrate are injected so it's behavior-tested in Node. Haptics work even without
// notification permission, so a buzz is always attempted.

export function createNotifier({ notification, vibrate } = {}) {
  const N = notification || (typeof Notification !== 'undefined' ? Notification : null);
  const vib = vibrate || ((typeof navigator !== 'undefined' && navigator.vibrate)
    ? (p) => navigator.vibrate(p) : null);

  return {
    get supported() { return !!N; },
    get permission() { return N ? N.permission : 'unsupported'; },

    async requestPermission() {
      if (!N) return 'unsupported';
      if (N.permission === 'granted' || N.permission === 'denied') return N.permission;
      return N.requestPermission();
    },

    // Haptic only — always tried (no permission needed). Returns whether it fired.
    buzz(pattern = [180]) { if (vib) { vib(pattern); return true; } return false; },

    // Notification (+ optional haptic). Notification only shows if permission granted; the
    // vibration still fires regardless (useful eyes-closed).
    notify(title, { body = '', vibration = null, silent = false } = {}) {
      if (vibration) this.buzz(vibration);
      if (!N || N.permission !== 'granted') return false;
      try { new N(title, { body, silent }); return true; } catch { return false; }
    },
  };
}
