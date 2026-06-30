// Behavior: progression aggregates sessions into a per-day coherence trend and a summary —
// the compound-effect view (your coherence rising over time).
import assert from 'node:assert';
import { coherenceTrend, summary, goalProgress } from './trend.js';

let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };

const sessions = [
  { date: '2026-06-01', score: { mean: 0.40 } },
  { date: '2026-06-01', score: { mean: 0.60 } },   // same day → averaged
  { date: '2026-06-02', score: { mean: 0.70 } },
  { date: '2026-06-03', protocol: 'wimhof' },       // no score → ignored in trend
];

{
  const t = coherenceTrend(sessions);
  assert.equal(t.length, 2, 'two scored days');
  assert.ok(Math.abs(t[0].mean - 0.5) < 1e-9, 'day 1 averages 0.4 & 0.6 → 0.5');
  assert.ok(t[0].date < t[1].date, 'sorted by date');
  ok('coherence trend: per-day average, sorted, ignores unscored sessions');
}

{
  const s = summary(sessions);
  assert.equal(s.total, 4);
  assert.equal(s.days, 3);
  assert.ok(Math.abs(s.bestCoherence - 0.70) < 1e-9);
  ok('summary: totals, distinct days, best coherence');
}

// Daily goal in KM: progress vs distance.
{
  const g = goalProgress({ type: 'km', km: 3, steps: 8000 }, { distanceM: 1500, steps: 2000 });
  assert.equal(g.unit, 'km'); assert.equal(g.target, 3); assert.equal(g.current, 1.5);
  assert.equal(g.pct, 50); assert.equal(g.done, false);
  assert.ok(g.label.includes('1,5 / 3 km') && g.label.includes('50%'));
  ok('goalProgress (km): % of distance toward the km target');
}
// Daily goal in STEPS: progress vs steps; reaching it marks done.
{
  const g = goalProgress({ type: 'steps', km: 3, steps: 8000 }, { distanceM: 6000, steps: 8200 });
  assert.equal(g.unit, 'pas'); assert.equal(g.target, 8000); assert.equal(g.current, 8200);
  assert.equal(g.pct, 100); assert.equal(g.done, true);
  ok('goalProgress (steps): % of steps, capped + done at 100%');
}
// Zero target → no division blowup.
assert.equal(goalProgress({ type: 'km', km: 0 }, { distanceM: 500 }).pct, 0);
ok('goalProgress guards a zero target');

console.log(`trend: ${n} checks passed`);
