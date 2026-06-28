// Behavior: the workout brain accumulates the stats that BEAT FitShow — calories from grade +
// body weight (not flat), grade-adjusted distance, HR zones from an H10, and a program that
// steps through segments giving target speeds. These are the premium features, free.
import assert from 'node:assert';
import {
  WorkoutSession, zoneForHr, maxHrFromAge, segmentAt, getProgram, PROGRAMS,
} from './session.js';

let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };

// Calories use grade + weight: an incline session burns more than a flat one, same speed/time.
{
  const flat = new WorkoutSession({ weightKg: 80, positionId: 1, positions: [{ id: 1, grade: 0 }, { id: 2, grade: 8 }] });
  const incl = new WorkoutSession({ weightKg: 80, positionId: 2, positions: [{ id: 1, grade: 0 }, { id: 2, grade: 8 }] });
  for (let t = 0; t < 600; t++) { flat.update({ speed: 5 }); incl.update({ speed: 5 }); }
  assert.ok(incl.calories > flat.calories, `incline kcal (${incl.calories|0}) > flat (${flat.calories|0})`);
  ok('calories reflect grade + weight (the FitShow dead-angle)');
}

// Grade-adjusted distance exceeds raw distance on an incline.
{
  const s = new WorkoutSession({ positionId: 2 }); // default pos2 = 6%
  for (let t = 0; t < 600; t++) s.update({ speed: 4 });
  assert.ok(s.gaDistanceM > s.distanceM, 'grade-adjusted distance > raw on an incline');
  ok('grade-adjusted distance tracks effort, not just belt movement');
}

// HR zones (H10 synergy): a tick with HR accrues time in the right zone + tracks peak/avg.
{
  const s = new WorkoutSession({ maxHr: 200 });
  for (let t = 0; t < 60; t++) s.update({ speed: 5 }, 150); // 150/200 = 75% → Z3
  const sum = s.summary();
  assert.equal(s.zoneSeconds[3], 60, 'all 60s logged in Z3');
  assert.equal(sum.peakHr, 150); assert.equal(sum.avgHr, 150);
  ok('HR zones + peak/avg computed from H10 heart rate (synergy)');
}

assert.equal(zoneForHr(150, 200), 3);
assert.equal(zoneForHr(190, 200), 5);
assert.equal(zoneForHr(0, 200), 0);
assert.ok(Math.abs(maxHrFromAge(40) - (208 - 28)) < 1e-9);
ok('zone + maxHr helpers correct');

// A program steps through its segments and yields target speed; finishes at the end.
{
  const program = { segments: [{ minutes: 1, speed: 3 }, { minutes: 1, speed: 6 }] };
  const s = new WorkoutSession({ program });
  let r;
  r = s.update({ speed: 3 }); assert.equal(r.targetSpeed, 3); assert.equal(r.segment.index, 0);
  for (let t = 0; t < 65; t++) r = s.update({ speed: 3 }); // cross into segment 2
  assert.equal(r.targetSpeed, 6, 'advanced to the 6 km/h segment');
  for (let t = 0; t < 60; t++) r = s.update({ speed: 6 });
  assert.ok(r.done, 'program finishes after its total duration');
  ok('program steps segments, exposes target speed, completes (custom workouts/plans, free)');
}

// segmentAt boundaries + registry.
assert.equal(segmentAt({ segments: [{ minutes: 1, speed: 3 }] }, 0).speed, 3);
assert.ok(segmentAt({ segments: [{ minutes: 1, speed: 3 }] }, 120).done);
assert.equal(getProgram('intervals').id, 'intervals');
assert.equal(getProgram('zzz').id, PROGRAMS[0].id, 'unknown → free');
ok('segment boundaries + program registry');

console.log(`session: ${n} checks passed`);
