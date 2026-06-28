// incline.js — the edge FitShow ignores. The HM1 has TWO physical incline positions (never
// flat) that the stock app never counts. We model them and compute grade-adjusted calories +
// pace using the ACSM walking equation, factoring the REAL grade AND body weight (the latter
// pulled from fittrack → synergy). Pure functions.

// Two configurable incline positions (% grade). Calibrate to the real HM1 angles; defaults
// are sensible placeholders (never 0, per the hardware).
export const DEFAULT_POSITIONS = [
  { id: 1, label: 'Position 1', grade: 3 },
  { id: 2, label: 'Position 2', grade: 6 },
];

export function gradeForPosition(positionId, positions = DEFAULT_POSITIONS) {
  const p = positions.find((x) => x.id === positionId);
  return p ? p.grade : 0;
}

// ACSM walking VO2 (ml/kg/min): 0.1*v + 1.8*v*grade + 3.5, v in m/min, grade as fraction.
export function vo2Walking(speedKmh, gradePct) {
  const vMetersPerMin = (speedKmh * 1000) / 60;
  const grade = gradePct / 100;
  return 0.1 * vMetersPerMin + 1.8 * vMetersPerMin * grade + 3.5;
}

// kcal/min = VO2(ml/kg/min) * weight(kg) / 1000 * 5  (5 kcal per L O2).
export function kcalPerMin(speedKmh, gradePct, weightKg) {
  return (vo2Walking(speedKmh, gradePct) * weightKg) / 1000 * 5;
}

// Total kcal over a duration at constant speed/grade (the per-tick building block).
export function kcalBurned(speedKmh, gradePct, weightKg, minutes) {
  return kcalPerMin(speedKmh, gradePct, weightKg) * minutes;
}

// Grade-adjusted pace: the flat-ground speed that costs the same VO2 — so a slow incline
// walk reads as the brisk flat walk it really is. Returns equivalent km/h.
export function gradeAdjustedSpeed(speedKmh, gradePct) {
  if (speedKmh <= 0) return 0;
  const target = vo2Walking(speedKmh, gradePct);
  // invert flat ACSM (grade 0): VO2 = 0.1*v + 3.5 → v(m/min) = (VO2-3.5)/0.1
  const vFlatMetersPerMin = Math.max(0, (target - 3.5) / 0.1);
  return (vFlatMetersPerMin * 60) / 1000;
}

// METs (for the "smart analytics" FitShow gates behind premium).
export function mets(speedKmh, gradePct) { return vo2Walking(speedKmh, gradePct) / 3.5; }
