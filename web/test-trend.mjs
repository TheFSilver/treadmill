// Behavior: progression aggregates sessions into a per-day coherence trend and a summary —
// the compound-effect view (your coherence rising over time).
import assert from 'node:assert';
import { coherenceTrend, summary } from './trend.js';

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

console.log(`trend: ${n} checks passed`);
