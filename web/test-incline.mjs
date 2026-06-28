// Behavior: the incline math (the FitShow dead-angle) is correct — calories rise with grade
// and weight, grade-adjusted speed exceeds raw speed on an incline, and positions map to grades.
import assert from 'node:assert';
import {
  gradeForPosition, gradeFromDegrees, vo2Walking, kcalPerMin, kcalBurned, gradeAdjustedSpeed, mets, DEFAULT_POSITIONS,
} from './incline.js';

let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };

// ACSM sanity: 5 km/h flat → ~83.3 m/min → VO2 = 0.1*83.3 + 3.5 = 11.83 ml/kg/min.
assert.ok(Math.abs(vo2Walking(5, 0) - (0.1 * (5000 / 60) + 3.5)) < 1e-9);
ok('VO2 matches the ACSM walking equation (flat)');

// Incline burns MORE than flat at the same speed (the whole point).
const flat = kcalPerMin(5, 0, 75);
const incl = kcalPerMin(5, 6, 75);
assert.ok(incl > flat, `incline kcal (${incl.toFixed(2)}) must exceed flat (${flat.toFixed(2)})`);
ok('incline increases calorie burn vs flat at equal speed');

// Calories scale with body weight (the fittrack synergy).
assert.ok(kcalPerMin(5, 3, 90) > kcalPerMin(5, 3, 60));
ok('calories scale with body weight (fittrack synergy)');

// kcalBurned integrates over time.
assert.ok(Math.abs(kcalBurned(5, 3, 75, 10) - kcalPerMin(5, 3, 75) * 10) < 1e-9);
ok('kcalBurned = kcal/min × minutes');

// Grade-adjusted speed on an incline reads HIGHER than the raw belt speed.
const ga = gradeAdjustedSpeed(4, 6);
assert.ok(ga > 4, `grade-adjusted speed (${ga.toFixed(2)}) should exceed raw 4 km/h`);
assert.ok(Math.abs(gradeAdjustedSpeed(4, 0) - 4) < 1e-9, 'flat → unchanged');
ok('grade-adjusted speed > raw speed on an incline, equal on flat');

// Real HM1 positions (from the manual): hole 1 ≈ 1°, hole 2 ≈ 4°. Grade % via tan().
// tan(1°)≈1.75%, tan(4°)≈6.99% (≈ the spec sheet's "7%").
assert.ok(Math.abs(gradeFromDegrees(4) - 6.993) < 0.01, 'tan(4°) ≈ 7% grade');
assert.ok(Math.abs(gradeForPosition(1) - 1.746) < 0.01, `pos1 (1°) ≈ 1.75%, got ${gradeForPosition(1)}`);
assert.ok(Math.abs(gradeForPosition(2) - 6.993) < 0.01, `pos2 (4°) ≈ 7%, got ${gradeForPosition(2)}`);
assert.ok(DEFAULT_POSITIONS.every((p) => p.degrees > 0), 'no position is flat (HM1 is never 0°)');
assert.ok(gradeForPosition(2) > gradeForPosition(1), 'position 2 steeper than 1');
ok('HM1 positions are 1°/4° (from manual), grade derived via tan()');

assert.ok(mets(5, 0) > 1);
ok('METs computed (premium analytics, free here)');

console.log(`incline: ${n} checks passed`);
