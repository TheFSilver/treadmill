// physio.js — body-profile math. Weight/incline/vest drive the ACSM model (mechanical work);
// age + sex unlock the Keytel HR model (real expenditure when the H10 is connected). Height
// gives a default stride for step counting. Pure (now-ms injected for testable age).

import { kcalPerMin as acsmKcalPerMin } from './incline.js';

// 'YYYY-MM-DD' → integer years at nowMs. null if unparseable/implausible.
export function ageFromBirthdate(birthdate, nowMs) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthdate || ''));
  if (!m) return null;
  const b = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const age = (nowMs - b) / (365.2425 * 24 * 3600 * 1000);
  return age > 0 && age < 120 ? Math.floor(age) : null;
}

// Tanaka 2001: HRmax = 208 − 0.7·age (better than 220−age). null if no age.
export function maxHrFromAge(age) { return age ? Math.round(208 - 0.7 * age) : null; }

// Default stride (m) ≈ 0.414 × height. null if no height. (For step estimation.)
export function strideFromHeight(heightCm) { return heightCm ? +((heightCm / 100) * 0.414).toFixed(3) : null; }

// Keytel et al. 2005 — HR-based energy expenditure (kcal/min). sex 'F' uses the female equation.
// Needs HR + age + weight. Clamped ≥0 (the equation goes negative at resting HR).
export function keytelKcalPerMin(hr, { age, sex, weightKg }) {
  if (!hr || !age || !weightKg) return null;
  const kcal = sex === 'F'
    ? (-20.4022 + 0.4472 * hr - 0.1263 * weightKg + 0.0740 * age) / 4.184
    : (-55.0969 + 0.6309 * hr + 0.1988 * weightKg + 0.2017 * age) / 4.184;
  return Math.max(0, kcal);
}

// Auto chooser: when HR + age are available use Keytel (HR already reflects incline AND vest via
// effort, so we pass bare body weight — no double-count); otherwise fall back to ACSM
// (speed + grade + weight + vest). Returns kcal/min.
export function kcalPerMinAuto({ speedKmh, gradePct, weightKg, vestKg = 0, hr = null, age = null, sex = 'M' }) {
  if (hr && age) {
    const k = keytelKcalPerMin(hr, { age, sex, weightKg });
    if (k != null) return k;
  }
  return acsmKcalPerMin(speedKmh, gradePct, weightKg, vestKg);
}
