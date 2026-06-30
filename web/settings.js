// settings.js — user settings (body weight, max HR, stride, the two incline angles). Pure,
// storage-injected → testable in Node, persisted in localStorage in the app. Weight feeds the
// calorie math (fittrack synergy); the angles calibrate the FitShow dead-angle.

export const DEFAULTS = { weightKg: 80, vestKg: 0, maxHr: 190, strideM: 0.71, pos1Deg: 1, pos2Deg: 4, goalKm: 3, postMealNudge: 0, mealTimes: '12:30,19:30' };
const STRING_KEYS = ['mealTimes']; // non-numeric settings
const KEY = 'treadmill.settings';
const mem = (() => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } }; })();
function store(s) { return s || (typeof localStorage !== 'undefined' ? localStorage : mem); }

export function loadSettings({ storage } = {}) {
  let saved = {};
  try { const v = store(storage).getItem(KEY); saved = v ? JSON.parse(v) : {}; } catch { saved = {}; }
  return { ...DEFAULTS, ...saved };
}

// Merge a partial update into the saved settings and persist. Returns the full merged object.
export function saveSettings(partial, { storage } = {}) {
  const merged = { ...loadSettings({ storage }), ...sanitize(partial) };
  store(storage).setItem(KEY, JSON.stringify(merged));
  return merged;
}

// Build the incline positions [{id,label,degrees}] the engine/UI consume from settings.
export function positionsFromSettings(s) {
  return [
    { id: 1, label: 'Position 1', degrees: s.pos1Deg },
    { id: 2, label: 'Position 2', degrees: s.pos2Deg },
  ];
}

// Keep only known keys: numeric coerced to finite numbers, string keys trimmed (ignore junk).
function sanitize(p = {}) {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) {
    if (p[k] === undefined || p[k] === null || p[k] === '') continue;
    if (STRING_KEYS.includes(k)) { out[k] = String(p[k]).trim(); continue; }
    const n = Number(p[k]);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}
