// postmeal.js — the post-meal walk nudge. 10-15 min after a meal, a steady walk blunts the
// glucose spike (the one solid, well-supported lever from the walking-fat-loss science — NOT a
// fasted/visceral-targeting claim). Pure decision logic: given the clock + the user's typical
// meal times, decide if a nudge is due (once per meal window). No meal logging needed.

// "12:30,19:30" → [750, 1170] minutes-of-day. Ignores malformed entries.
export function parseMealTimes(str) {
  return String(str || '').split(',').map((s) => {
    const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    return h > 23 || mi > 59 ? null : h * 60 + mi;
  }).filter((x) => x != null);
}

// nowMin = minutes-of-day. lastFiredMin = minutes-of-day of the last nudge (or null). Due when
// now is in [meal+delay, meal+delay+window] AND we haven't already fired inside that window.
export const NUDGE_MSG = 'Tu viens de manger — 10-15 min de marche douce maintenant lissent ta glycémie 🚶';
export function nudgeDue(nowMin, mealTimesMin, lastFiredMin = null, { delayMin = 10, windowMin = 20 } = {}) {
  for (const mt of mealTimesMin) {
    const start = mt + delayMin, end = mt + delayMin + windowMin;
    if (nowMin >= start && nowMin <= end) {
      if (lastFiredMin != null && lastFiredMin >= start && lastFiredMin <= end) continue; // already nudged this meal
      return { due: true, mealMin: mt, message: NUDGE_MSG };
    }
  }
  return { due: false };
}
