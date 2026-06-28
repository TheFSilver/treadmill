// session.js — the workout brain. Each tick it folds in the treadmill frame (+ optional HR
// from an H10) and produces live stats: calories computed OUR way (grade + body weight via
// incline.js — the FitShow dead-angle), grade-adjusted distance/pace, HR zone (H10 synergy),
// and, if a program is set, the current target speed/incline (= FitShow's premium "custom
// workouts" / "plans", free). Pure + injected deps → fully testable.

import { kcalPerMin, gradeForPosition, gradeAdjustedSpeed, mets } from './incline.js';

// HR zones as fractions of max HR (Z1..Z5). zoneForHr → 0 (below) .. 5.
export function maxHrFromAge(age) { return 208 - 0.7 * age; }
export function zoneForHr(hr, maxHr) {
  if (!hr || !maxHr) return 0;
  const pct = hr / maxHr;
  if (pct < 0.5) return 0;
  if (pct < 0.6) return 1;
  if (pct < 0.7) return 2;
  if (pct < 0.8) return 3;
  if (pct < 0.9) return 4;
  return 5;
}

// A program = ordered segments [{ minutes, speed, incline? }]. Free run = no program.
export function segmentAt(program, elapsedSec) {
  if (!program || !program.segments || !program.segments.length) return null;
  let acc = 0;
  for (let i = 0; i < program.segments.length; i++) {
    acc += program.segments[i].minutes * 60;
    if (elapsedSec < acc) return { index: i, ...program.segments[i], total: program.segments.length };
  }
  return { index: program.segments.length, done: true, total: program.segments.length };
}
export function programDurationSec(program) {
  return program && program.segments ? program.segments.reduce((s, x) => s + x.minutes * 60, 0) : 0;
}

export class WorkoutSession {
  constructor({ weightKg = 75, positionId = 1, positions, maxHr = 190, program = null } = {}) {
    this.weightKg = weightKg;
    this.positionId = positionId;
    this.positions = positions;
    this.maxHr = maxHr;
    this.program = program;
    this.reset();
  }

  reset() {
    this.elapsedSec = 0; this.calories = 0; this.distanceM = 0; this.gaDistanceM = 0;
    this.lastSpeed = 0; this.peakHr = 0; this.hrSum = 0; this.hrCount = 0;
    this.zoneSeconds = [0, 0, 0, 0, 0, 0];
  }

  setPosition(id) { this.positionId = id; }
  get grade() { return gradeForPosition(this.positionId, this.positions); }

  // Call ~1 Hz with the parsed treadmill frame and optional HR (bpm). dtSec defaults to 1.
  update(data = {}, hr = null, dtSec = 1) {
    const speed = data.speed != null ? data.speed : this.lastSpeed;
    this.lastSpeed = speed;
    this.elapsedSec += dtSec;

    // Distance: trust the treadmill's own total if present, else integrate speed.
    if (data.distance != null) this.distanceM = data.distance;
    else this.distanceM += (speed * 1000 / 3600) * dtSec;
    this.gaDistanceM += (gradeAdjustedSpeed(speed, this.grade) * 1000 / 3600) * dtSec;

    // Calories OUR way: grade + weight (ignore the treadmill's flat figure).
    this.calories += kcalPerMin(speed, this.grade, this.weightKg) * (dtSec / 60);

    if (hr) {
      this.peakHr = Math.max(this.peakHr, hr);
      this.hrSum += hr; this.hrCount++;
      this.zoneSeconds[zoneForHr(hr, this.maxHr)] += dtSec;
    }

    const seg = segmentAt(this.program, this.elapsedSec);
    const totalSec = programDurationSec(this.program);
    return {
      elapsedSec: this.elapsedSec,
      speed,
      gradeAdjustedSpeed: gradeAdjustedSpeed(speed, this.grade),
      grade: this.grade,
      distanceM: this.distanceM,
      gaDistanceM: this.gaDistanceM,
      calories: this.calories,
      mets: mets(speed, this.grade),
      hr: hr || null,
      zone: zoneForHr(hr, this.maxHr),
      segment: seg,
      targetSpeed: seg && !seg.done ? seg.speed : null,
      targetIncline: seg && !seg.done ? seg.incline ?? null : null,
      progress: totalSec ? Math.min(1, this.elapsedSec / totalSec) : 0,
      done: !!(seg && seg.done),
    };
  }

  summary() {
    return {
      durationSec: this.elapsedSec,
      distanceM: Math.round(this.distanceM),
      gaDistanceM: Math.round(this.gaDistanceM),
      calories: Math.round(this.calories),
      avgHr: this.hrCount ? Math.round(this.hrSum / this.hrCount) : null,
      peakHr: this.peakHr || null,
      zoneSeconds: this.zoneSeconds,
    };
  }
}

// Built-in programs = FitShow's gated "plans", free. Speeds in km/h, durations in minutes.
export const PROGRAMS = [
  { id: 'free', name: 'Marche libre', segments: null },
  { id: 'fatburn', name: 'Fat burn 30 min', segments: [
    { minutes: 5, speed: 3.5 }, { minutes: 20, speed: 5 }, { minutes: 5, speed: 3 } ] },
  { id: 'intervals', name: 'Intervalles 20 min', segments: [
    { minutes: 3, speed: 3.5 },
    ...Array.from({ length: 6 }, () => [{ minutes: 1, speed: 6 }, { minutes: 1, speed: 3.5 }]).flat(),
    { minutes: 2, speed: 3 } ] },
  { id: 'deskwalk', name: 'Desk walk 45 min', segments: [{ minutes: 45, speed: 3 }] },
];
export function getProgram(id) { return PROGRAMS.find((p) => p.id === id) || PROGRAMS[0]; }
