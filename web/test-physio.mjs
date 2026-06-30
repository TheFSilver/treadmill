// Behavior: body-profile math — age from birthdate, Tanaka HRmax, stride from height, and the
// Keytel HR-calorie model used when the H10 is connected (else ACSM). Pure, injected now-ms.
import assert from 'node:assert';
import { ageFromBirthdate, maxHrFromAge, strideFromHeight, keytelKcalPerMin, kcalPerMinAuto } from './physio.js';
import { kcalPerMin as acsm } from './incline.js';

let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };
const NOW = Date.UTC(2026, 5, 30); // 2026-06-30

// Age from birthdate (and guards).
assert.equal(ageFromBirthdate('1986-09-22', NOW), 39, 'pre-birthday this year → 39');
assert.equal(ageFromBirthdate('1986-06-01', NOW), 40, 'after birthday → 40');
assert.equal(ageFromBirthdate('garbage', NOW), null);
assert.equal(ageFromBirthdate('', NOW), null);
ok('ageFromBirthdate computes integer years, guards junk');

// Tanaka HRmax + stride from height.
assert.equal(maxHrFromAge(40), 180, '208 − 0.7·40 = 180');
assert.equal(maxHrFromAge(null), null);
assert.equal(strideFromHeight(178), 0.737, '1.78 × 0.414');
assert.equal(strideFromHeight(0), null);
ok('Tanaka HRmax + stride-from-height defaults');

// Keytel: rises with HR; sex changes the result; needs HR+age+weight.
{
  const m = keytelKcalPerMin(140, { age: 40, sex: 'M', weightKg: 80 });
  assert.ok(Math.abs(m - 13.67) < 0.1, `male@140bpm ≈ 13.7 kcal/min (got ${m.toFixed(2)})`);
  assert.ok(keytelKcalPerMin(160, { age: 40, sex: 'M', weightKg: 80 }) > m, 'higher HR → more kcal');
  assert.notEqual(keytelKcalPerMin(140, { age: 40, sex: 'F', weightKg: 80 }), m, 'sex changes the estimate');
  assert.equal(keytelKcalPerMin(140, { age: null, sex: 'M', weightKg: 80 }), null, 'no age → null');
  assert.equal(keytelKcalPerMin(40, { age: 40, sex: 'M', weightKg: 80 }), 0, 'resting HR clamped ≥0 (not negative)');
  ok('Keytel HR-calorie model: HR-driven, sex-aware, guarded, clamped');
}

// Auto chooser: Keytel when HR+age present, else ACSM. With HR it ignores the vest (HR already
// reflects the load — no double count).
{
  const withHr = kcalPerMinAuto({ speedKmh: 5, gradePct: 7, weightKg: 80, vestKg: 12, hr: 140, age: 40, sex: 'M' });
  assert.ok(Math.abs(withHr - keytelKcalPerMin(140, { age: 40, sex: 'M', weightKg: 80 })) < 1e-9, 'HR present → Keytel (bare weight)');
  const noHr = kcalPerMinAuto({ speedKmh: 5, gradePct: 7, weightKg: 80, vestKg: 12 });
  assert.ok(Math.abs(noHr - acsm(5, 7, 80, 12)) < 1e-9, 'no HR → ACSM (with grade + vest)');
  const noAge = kcalPerMinAuto({ speedKmh: 5, gradePct: 7, weightKg: 80, hr: 140 });
  assert.ok(Math.abs(noAge - acsm(5, 7, 80, 0)) < 1e-9, 'HR but no age → ACSM fallback');
  ok('kcalPerMinAuto picks Keytel (HR+age) else ACSM, no vest double-count');
}

console.log(`physio: ${n} checks passed`);
