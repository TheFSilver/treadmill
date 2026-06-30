// trend.js — progression over time (the compound effect). Pure functions over the session
// log: per-day average coherence (for a sparkline) and an overall summary.

export function coherenceTrend(sessions) {
  const byDay = new Map();
  for (const s of sessions) {
    const m = s.score && typeof s.score.mean === 'number' ? s.score.mean : null;
    if (m == null) continue;
    const e = byDay.get(s.date) || { sum: 0, n: 0 };
    e.sum += m; e.n += 1; byDay.set(s.date, e);
  }
  return [...byDay.entries()]
    .map(([date, e]) => ({ date, mean: e.sum / e.n }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Today's totals across sessions (for the daily goal / progress). dateStr = 'YYYY-MM-DD'.
export function todayTotals(sessions, dateStr) {
  const t = { distanceM: 0, calories: 0, steps: 0, durationSec: 0, count: 0 };
  for (const s of sessions) {
    if (s.date !== dateStr) continue;
    t.distanceM += s.distanceM || 0; t.calories += s.calories || 0;
    t.steps += s.steps || 0; t.durationSec += s.durationSec || 0; t.count += 1;
  }
  return t;
}

// Daily-goal progress in either unit. goal = { type:'km'|'steps', km, steps }; totals from
// todayTotals. One pure helper → the UI just renders .label. DRY.
export function goalProgress(goal, totals) {
  const steps = goal.type === 'steps';
  const target = steps ? (goal.steps || 0) : (goal.km || 0);
  const current = steps ? (totals.steps || 0) : (totals.distanceM || 0) / 1000;
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const unit = steps ? 'pas' : 'km';
  const fmt = (v) => (steps ? String(Math.round(v)) : String(Math.round(v * 100) / 100).replace('.', ',')); // French decimal
  return { type: goal.type, target, current, pct, unit, done: pct >= 100, label: `${fmt(current)} / ${fmt(target)} ${unit} (${pct}%)` };
}

export function summary(sessions) {
  const days = new Set(sessions.map((s) => s.date)).size;
  const scored = sessions.map((s) => s.score && s.score.mean).filter((x) => typeof x === 'number');
  const avg = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 0;
  const best = scored.length ? Math.max(...scored) : 0;
  return { total: sessions.length, days, avgCoherence: avg, bestCoherence: best };
}
