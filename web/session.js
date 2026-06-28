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
  constructor({ weightKg = 75, positionId = 1, positions, maxHr = 190, program = null, strideM = 0.71 } = {}) {
    this.weightKg = weightKg;
    this.positionId = positionId;
    this.positions = positions;
    this.maxHr = maxHr;
    this.program = program;
    this.strideM = strideM;
    this.reset();
  }

  reset() {
    this.elapsedSec = 0; this.movingSec = 0; this.calories = 0; this.distanceM = 0; this.gaDistanceM = 0;
    this.lastSpeed = 0; this.maxSpeed = 0; this.steps = 0;
    this.peakHr = 0; this.hrSum = 0; this.hrCount = 0;
    this.zoneSeconds = [0, 0, 0, 0, 0, 0];
  }

  setPosition(id) { this.positionId = id; }
  get grade() { return gradeForPosition(this.positionId, this.positions); }

  // Call ~1 Hz with the parsed treadmill frame and optional HR (bpm). dtSec defaults to 1.
  update(data = {}, hr = null, dtSec = 1) {
    const speed = data.speed != null ? data.speed : this.lastSpeed;
    this.lastSpeed = speed;
    this.elapsedSec += dtSec;
    if (speed > 0) this.movingSec += dtSec;
    if (speed > this.maxSpeed) this.maxSpeed = speed;

    const deltaM = (speed * 1000 / 3600) * dtSec;
    // Distance: trust the treadmill's own total if present, else integrate speed.
    if (data.distance != null) this.distanceM = data.distance;
    else this.distanceM += deltaM;
    this.gaDistanceM += (gradeAdjustedSpeed(speed, this.grade) * 1000 / 3600) * dtSec;
    this.steps += deltaM / this.strideM; // step estimate from belt distance / stride length

    // Calories OUR way: grade + weight (ignore the treadmill's flat figure).
    this.calories += kcalPerMin(speed, this.grade, this.weightKg) * (dtSec / 60);

    if (hr) {
      this.peakHr = Math.max(this.peakHr, hr);
      this.hrSum += hr; this.hrCount++;
      this.zoneSeconds[zoneForHr(hr, this.maxHr)] += dtSec;
    }

    const seg = segmentAt(this.program, this.elapsedSec);
    const totalSec = programDurationSec(this.program);
    const segs = this.program && this.program.segments;
    const nextSpeed = segs && seg && !seg.done && segs[seg.index + 1] ? segs[seg.index + 1].speed : null;
    return {
      elapsedSec: this.elapsedSec,
      speed,
      gradeAdjustedSpeed: gradeAdjustedSpeed(speed, this.grade),
      grade: this.grade,
      distanceM: this.distanceM,
      gaDistanceM: this.gaDistanceM,
      calories: this.calories,
      steps: Math.round(this.steps),
      maxSpeed: this.maxSpeed,
      mets: mets(speed, this.grade),
      hr: hr || null,
      zone: zoneForHr(hr, this.maxHr),
      segment: seg,
      targetSpeed: seg && !seg.done ? seg.speed : null,
      targetIncline: seg && !seg.done ? seg.incline ?? null : null,
      nextSpeed,
      progress: totalSec ? Math.min(1, this.elapsedSec / totalSec) : 0,
      totalSec,
      remainingSec: totalSec ? Math.max(0, totalSec - this.elapsedSec) : null,
      done: !!(seg && seg.done),
    };
  }

  summary() {
    const moving = this.movingSec || this.elapsedSec;
    return {
      durationSec: this.elapsedSec,
      movingSec: this.movingSec,
      distanceM: Math.round(this.distanceM),
      gaDistanceM: Math.round(this.gaDistanceM),
      calories: Math.round(this.calories),
      steps: Math.round(this.steps),
      maxSpeed: +this.maxSpeed.toFixed(1),
      avgSpeed: moving ? +((this.distanceM / 1000) / (moving / 3600)).toFixed(1) : 0,
      avgHr: this.hrCount ? Math.round(this.hrSum / this.hrCount) : null,
      peakHr: this.peakHr || null,
      zoneSeconds: this.zoneSeconds,
    };
  }
}
