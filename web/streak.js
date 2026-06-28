// streak.js — the habit layer (the real constraint = doing the practice daily). Logs each
// finished session and maintains a daily streak. Storage + date are injectable so it's
// testable in Node without a browser; in the app it uses localStorage + today's date.

const KEY_SESSIONS = 'resonance.sessions';
const KEY_STREAK = 'resonance.streak';
const memFallback = (() => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } }; })();

function store(s) { return s || (typeof localStorage !== 'undefined' ? localStorage : memFallback); }
function readJSON(s, k, dflt) { try { const v = s.getItem(k); return v ? JSON.parse(v) : dflt; } catch { return dflt; } }
function writeJSON(s, k, v) { s.setItem(k, JSON.stringify(v)); }

export function todayStr(d = new Date()) { return d.toISOString().slice(0, 10); }
export function prevDay(dateStr) { const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }

let _seq = 0;
function newId() { return `s-${Date.now ? Date.now() : 0}-${_seq++}`; }

export function recordSession(session, { storage, date = todayStr(), id = newId() } = {}) {
  const s = store(storage);
  const sessions = readJSON(s, KEY_SESSIONS, []);
  sessions.push({ id, ...session, date });
  writeJSON(s, KEY_SESSIONS, sessions);

  const streak = readJSON(s, KEY_STREAK, { current: 0, longest: 0, lastDate: null });
  if (streak.lastDate === date) { /* already practised today — streak unchanged */ }
  else if (streak.lastDate === prevDay(date)) streak.current += 1;
  else streak.current = 1;
  streak.longest = Math.max(streak.longest, streak.current);
  streak.lastDate = date;
  writeJSON(s, KEY_STREAK, streak);
  return streak;
}

export function loadStreak({ storage } = {}) {
  return readJSON(store(storage), KEY_STREAK, { current: 0, longest: 0, lastDate: null });
}
export function loadSessions({ storage } = {}) {
  return readJSON(store(storage), KEY_SESSIONS, []);
}
// Delete one logged session by id (the streak history stays; we don't recompute past streaks).
export function deleteSession(id, { storage } = {}) {
  const s = store(storage);
  writeJSON(s, KEY_SESSIONS, readJSON(s, KEY_SESSIONS, []).filter((x) => x.id !== id));
}

// Generic preferences (e.g. the last selected protocol, restored on reopen).
export function savePref(key, value, { storage } = {}) { store(storage).setItem('resonance.pref.' + key, JSON.stringify(value)); }
export function loadPref(key, dflt, { storage } = {}) { return readJSON(store(storage), 'resonance.pref.' + key, dflt); }

export function streakText(streak) {
  return streak && streak.current > 0 ? `🔥 ${streak.current} j` + (streak.longest > streak.current ? ` · record ${streak.longest}` : '') : '';
}
