// simulator.js — synthetic FTMS treadmill so the app runs and is tested WITHOUT the HM1.
// Emits Treadmill Data frames that follow a target speed, integrating distance/time, plus an
// optional HR stream (stands in for an H10) so the synergy is testable too. Deterministic.
import { encodeTreadmillData } from './ftms-core.js';

export function makeTreadmillSimulator({ startSpeed = 0 } = {}) {
  let speed = startSpeed, distance = 0, elapsed = 0, target = startSpeed;
  return {
    setTarget(kmh) { target = kmh; },
    start() { if (target === 0) target = 4; },
    stop() { target = 0; },
    // next(dtSec) advances one tick and returns { data: DataView, hr }.
    next(dtSec = 1) {
      speed += Math.max(-0.3, Math.min(0.3, target - speed)); // ramp toward target
      elapsed += dtSec;
      distance += (speed * 1000 / 3600) * dtSec;
      const hr = speed > 0 ? Math.round(90 + speed * 12) : 70; // crude HR proxy
      return {
        hr,
        data: encodeTreadmillData({ speed, distance, elapsedTime: elapsed, energy: Math.round(distance / 12) }),
      };
    },
  };
}
