// workouts.js — the workout catalog. A workout is pure data: { id, name, segments } where
// segments = [{ minutes, speed, incline? }] (null = free walk). Built-ins replace FitShow's
// gated "plans"; custom workouts replace its premium "design your own session". Custom CRUD
// uses an injected storage so it's testable in Node and persists in localStorage in the app.

export const BUILTINS = [
  { id: 'free', name: 'Marche libre', segments: null, builtin: true },
  { id: 'deskwalk', name: 'Desk walk 45 min', builtin: true, segments: [{ minutes: 45, speed: 3 }] },
  { id: 'fatburn', name: 'Fat burn 30 min', builtin: true, segments: [
    { minutes: 5, speed: 3.5 }, { minutes: 20, speed: 5 }, { minutes: 5, speed: 3 } ] },
  { id: 'intervals', name: 'Intervalles 20 min', builtin: true, segments: [
    { minutes: 3, speed: 3.5 },
    ...Array.from({ length: 6 }, () => [{ minutes: 1, speed: 6 }, { minutes: 1, speed: 3.5 }]).flat(),
    { minutes: 2, speed: 3 } ] },
  // Japanese Walking (Interval Walking Training, Nemoto/Masuki). 5×(3 min brisk ~RPE hard +
  // 3 min slow) = 30 min. The protocol François researched in depth — proven VO2max/BP gains.
  { id: 'japanese', name: 'Japanese Walking (IWT)', builtin: true, segments: [
    ...Array.from({ length: 5 }, () => [{ minutes: 3, speed: 6 }, { minutes: 3, speed: 3 }]).flat() ] },
];

const KEY = 'treadmill.custom';
const mem = (() => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } }; })();
function store(s) { return s || (typeof localStorage !== 'undefined' ? localStorage : mem); }
function readJSON(s, k, d) { try { const v = s.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }

export function loadCustom({ storage } = {}) { return readJSON(store(storage), KEY, []); }

// Save (create or update by id). Generates a stable id from the name + index if absent.
export function saveCustom(workout, { storage } = {}) {
  const s = store(storage);
  const list = readJSON(s, KEY, []);
  const id = workout.id || 'custom-' + slug(workout.name) + '-' + (list.length + 1);
  const entry = { id, name: workout.name, segments: workout.segments, custom: true };
  const i = list.findIndex((w) => w.id === id);
  if (i >= 0) list[i] = entry; else list.push(entry);
  s.setItem(KEY, JSON.stringify(list));
  return entry;
}

export function deleteCustom(id, { storage } = {}) {
  const s = store(storage);
  s.setItem(KEY, JSON.stringify(readJSON(s, KEY, []).filter((w) => w.id !== id)));
}

export function allWorkouts({ storage } = {}) { return [...BUILTINS, ...loadCustom({ storage })]; }
export function getWorkout(id, { storage } = {}) { return allWorkouts({ storage }).find((w) => w.id === id) || BUILTINS[0]; }

function slug(s) { return String(s || 'seance').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24); }
