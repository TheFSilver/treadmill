// Behavior: settings load with defaults, save merges + persists + coerces, junk is ignored,
// and positions are derived from the two incline angles.
import assert from 'node:assert';
import { loadSettings, saveSettings, positionsFromSettings, DEFAULTS } from './settings.js';

let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };
function fakeStorage() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } }; }

// Defaults when nothing saved.
{
  const s = loadSettings({ storage: fakeStorage() });
  assert.equal(s.weightKg, DEFAULTS.weightKg);
  assert.equal(s.pos1Deg, 1); assert.equal(s.pos2Deg, 4);
  ok('loads sensible defaults');
}

// Save merges + persists; partial update keeps other keys.
{
  const storage = fakeStorage();
  saveSettings({ weightKg: 72 }, { storage });
  const merged = saveSettings({ maxHr: 185, pos2Deg: 5 }, { storage });
  assert.equal(merged.weightKg, 72, 'earlier change kept');
  assert.equal(merged.maxHr, 185);
  assert.equal(merged.pos2Deg, 5);
  assert.equal(loadSettings({ storage }).weightKg, 72, 'persisted');
  ok('save merges partial updates and persists');
}

// String inputs (from form fields) are coerced; empty/junk ignored.
{
  const storage = fakeStorage();
  const m = saveSettings({ weightKg: '90', maxHr: '', pos1Deg: 'abc' }, { storage });
  assert.equal(m.weightKg, 90, 'string "90" → 90');
  assert.equal(m.maxHr, DEFAULTS.maxHr, 'empty ignored → default kept');
  assert.equal(m.pos1Deg, DEFAULTS.pos1Deg, 'junk ignored');
  ok('coerces numeric strings, ignores empty/junk');
}

// positionsFromSettings reflects the angles.
{
  const pos = positionsFromSettings({ pos1Deg: 2, pos2Deg: 6 });
  assert.equal(pos.length, 2);
  assert.equal(pos[0].degrees, 2); assert.equal(pos[1].degrees, 6);
  assert.equal(pos[0].id, 1); assert.equal(pos[1].label, 'Position 2');
  ok('positions derived from the two incline angles');
}

console.log(`settings: ${n} checks passed`);
