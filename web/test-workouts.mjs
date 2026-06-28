// Behavior: the catalog has the built-in plans (incl. Japanese Walking IWT), and custom
// workouts can be created, listed, fetched, persisted, and deleted — the FitShow premium
// "design your own session" / "plans", free.
import assert from 'node:assert';
import { BUILTINS, allWorkouts, getWorkout, saveCustom, loadCustom, deleteCustom } from './workouts.js';

let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };
function fakeStorage() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } }; }

// Japanese Walking (IWT) is present and shaped right: 10 segments alternating brisk/slow, 30 min.
{
  const jw = BUILTINS.find((w) => w.id === 'japanese');
  assert.ok(jw, 'Japanese Walking present');
  assert.equal(jw.segments.length, 10, '5×(brisk+slow) = 10 segments');
  assert.equal(jw.segments.reduce((s, x) => s + x.minutes, 0), 30, 'total 30 min');
  assert.ok(jw.segments[0].speed > jw.segments[1].speed, 'alternates brisk then slow');
  ok('Japanese Walking (IWT) is a real 30-min alternating protocol');
}

// Custom workout: create → appears in allWorkouts + fetchable + persisted.
{
  const storage = fakeStorage();
  const w = saveCustom({ name: 'Ma séance', segments: [{ minutes: 10, speed: 4 }] }, { storage });
  assert.ok(w.id && w.custom);
  assert.ok(allWorkouts({ storage }).some((x) => x.id === w.id), 'shows in catalog');
  assert.equal(getWorkout(w.id, { storage }).name, 'Ma séance');
  assert.equal(loadCustom({ storage }).length, 1, 'persisted');
  ok('custom workout created, listed, fetched, persisted');
}

// Update by id replaces (no duplicate); delete removes.
{
  const storage = fakeStorage();
  const w = saveCustom({ name: 'A', segments: [{ minutes: 5, speed: 3 }] }, { storage });
  saveCustom({ id: w.id, name: 'A modifié', segments: [{ minutes: 6, speed: 4 }] }, { storage });
  assert.equal(loadCustom({ storage }).length, 1, 'update does not duplicate');
  assert.equal(getWorkout(w.id, { storage }).name, 'A modifié');
  deleteCustom(w.id, { storage });
  assert.equal(loadCustom({ storage }).length, 0, 'deleted');
  ok('custom workout updates in place and deletes');
}

// Unknown id falls back to the first built-in (free).
assert.equal(getWorkout('nope').id, 'free');
ok('unknown id falls back to free walk');

console.log(`workouts: ${n} checks passed`);
