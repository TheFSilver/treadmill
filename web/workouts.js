// workouts.js — the workout catalog. A workout is pure data: { id, name, segments } where
// segments = [{ minutes, speed, incline? }] (null = free walk). Built-ins replace FitShow's
// gated "plans"; custom workouts replace its premium "design your own session". Custom CRUD
// uses an injected storage so it's testable in Node and persists in localStorage in the app.

// "Séance libre" is the one permanent default (no segments — nothing to edit). Named "séance"
// not "marche" because the HM1 reaches 8 km/h → you can run, not only walk.
export const BUILTINS = [{ id: 'free', name: 'Séance libre', segments: null, builtin: true }];

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
  // Japanese Walking (Interval Walking Training, Nose/Masuki — Shinshu Univ., Mayo Clinic 2007).
  // 5×(3 min FAST + 3 min slow) = 30 min. Intensity-based, NOT a fixed speed: fast = ~70% peak
  // aerobic / RPE 6-7 / HR zone 4 ; slow = ~40% / RPE 2-3 / zone 2. Speed is individual — these
  // are brisk defaults (cap 8 km/h on the HM1) ; with the H10, target the HR zones instead.
  { id: 'japanese', name: 'Japanese Walking (IWT)', segments: [
    ...Array.from({ length: 5 }, () => [{ minutes: 3, speed: 7.5, kind: 'effort' }, { minutes: 3, speed: 3.5, kind: 'recovery' }]).flat() ] },
  // Post-meal walk: 12 min steady gentle pace (glucose-blunting lever). Keep Position 2 incline on
  // and the vest light/off — it's a digestion walk, not a training block.
  { id: 'postmeal', name: 'Post-repas 12 min', segments: [{ minutes: 12, speed: 4, kind: 'effort' }] },
];

const KEY = 'treadmill.custom';
const SEED_FLAG = 'treadmill.seeded';
// The original seed set — used to migrate the legacy boolean flag so NEW seeds still propagate
// to users who were already seeded, while honouring any seed they later deleted.
const LEGACY_SEEDED = ['deskwalk', 'fatburn', 'intervals', 'japanese'];

// Seed starter workouts as editable custom entries. ADDITIVE + idempotent: a brand-new seed is
// added once even to already-seeded installs; a seed the user deleted never comes back (its id
// stays recorded). SEED_FLAG holds the JSON list of seed ids already introduced.
export function ensureSeeded({ storage } = {}) {
  const s = store(storage);
  const raw = readJSON(s, SEED_FLAG, null);
  const seededIds = Array.isArray(raw) ? raw : (raw ? LEGACY_SEEDED.slice() : []);
  const list = readJSON(s, KEY, []);
  let changed = false;
  for (const w of SEED_WORKOUTS) {
    if (seededIds.includes(w.id)) continue;                  // already introduced (even if deleted since)
    if (!list.some((x) => x.id === w.id)) { list.push({ ...w, custom: true }); changed = true; }
    seededIds.push(w.id);
  }
  if (changed) s.setItem(KEY, JSON.stringify(list));
  s.setItem(SEED_FLAG, JSON.stringify(seededIds));
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
