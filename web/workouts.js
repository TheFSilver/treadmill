// workouts.js — the workout catalog. A workout is pure data: { id, name, segments } where
// segments = [{ minutes, speed, incline? }] (null = free walk). Built-ins replace FitShow's
// gated "plans"; custom workouts replace its premium "design your own session". Custom CRUD
// uses an injected storage so it's testable in Node and persists in localStorage in the app.

// "Marche libre" is the one permanent default (free walk, no segments — nothing to edit).
export const BUILTINS = [{ id: 'free', name: 'Marche libre', segments: null, builtin: true }];

// Structured starter workouts. SEEDED as editable custom workouts on first run, so the user
// can edit/delete them like their own (they expect all of these to be "their" workouts).
export const SEED_WORKOUTS = [
  { id: 'deskwalk', name: 'Desk walk 45 min', segments: [{ minutes: 45, speed: 3, kind: 'effort' }] },
  { id: 'fatburn', name: 'Fat burn 30 min', segments: [
    { minutes: 5, speed: 3.5, kind: 'warmup' }, { minutes: 20, speed: 5, kind: 'effort' }, { minutes: 5, speed: 3, kind: 'recovery' } ] },
  { id: 'intervals', name: 'Intervalles 20 min', segments: [
    { minutes: 3, speed: 3.5, kind: 'warmup' },
    ...Array.from({ length: 6 }, () => [{ minutes: 1, speed: 6, kind: 'effort' }, { minutes: 1, speed: 3.5, kind: 'recovery' }]).flat(),
    { minutes: 2, speed: 3, kind: 'recovery' } ] },
  // Japanese Walking (Interval Walking Training, Nemoto/Masuki). 5×(3 min brisk + 3 min slow) = 30 min.
  { id: 'japanese', name: 'Japanese Walking (IWT)', segments: [
    ...Array.from({ length: 5 }, () => [{ minutes: 3, speed: 6, kind: 'effort' }, { minutes: 3, speed: 3, kind: 'recovery' }]).flat() ] },
];

const KEY = 'treadmill.custom';
const SEED_FLAG = 'treadmill.seeded';

// Seed the starter workouts as editable custom entries, once. Idempotent.
export function ensureSeeded({ storage } = {}) {
  const s = store(storage);
  if (s.getItem(SEED_FLAG)) return;
  const list = readJSON(s, KEY, []);
  for (const w of SEED_WORKOUTS) if (!list.some((x) => x.id === w.id)) list.push({ ...w, custom: true });
  s.setItem(KEY, JSON.stringify(list));
  s.setItem(SEED_FLAG, '1');
}
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
