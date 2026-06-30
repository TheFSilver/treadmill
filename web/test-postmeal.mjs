// Behavior: the post-meal walk nudge fires in the right window after each meal, once, and never
// off-window — the only well-supported lever from the walking-fat-loss video (glucose-blunting).
import assert from 'node:assert';
import { parseMealTimes, nudgeDue, NUDGE_MSG } from './postmeal.js';

let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };
const at = (h, m) => h * 60 + m;

// Parsing meal times, ignoring junk.
{
  assert.deepEqual(parseMealTimes('12:30,19:30'), [at(12, 30), at(19, 30)]);
  assert.deepEqual(parseMealTimes('8:00, , 25:99, lol, 13:15'), [at(8, 0), at(13, 15)]);
  assert.deepEqual(parseMealTimes(''), []);
  ok('parseMealTimes parses HH:MM, drops malformed entries');
}

const meals = [at(12, 30), at(19, 30)];

// Fires 10-30 min after lunch, with the message.
{
  const r = nudgeDue(at(12, 45), meals); // 15 min after lunch
  assert.equal(r.due, true); assert.equal(r.mealMin, at(12, 30)); assert.equal(r.message, NUDGE_MSG);
  ok('nudge fires inside the post-meal window (10-30 min after)');
}

// Does NOT fire before the delay or after the window.
{
  assert.equal(nudgeDue(at(12, 33), meals).due, false, 'too soon (3 min after)');
  assert.equal(nudgeDue(at(13, 5), meals).due, false, 'too late (35 min after)');
  assert.equal(nudgeDue(at(16, 0), meals).due, false, 'nowhere near a meal');
  ok('nudge stays silent outside the window');
}

// Fires once per meal: if already fired in this window, no repeat.
{
  const first = nudgeDue(at(12, 42), meals, null);
  assert.equal(first.due, true);
  const again = nudgeDue(at(12, 48), meals, at(12, 42)); // already nudged this lunch window
  assert.equal(again.due, false, 'no second nudge for the same meal');
  ok('nudge fires once per meal (no nagging)');
}

// Dinner works too, independently of lunch's last-fired.
{
  const r = nudgeDue(at(19, 45), meals, at(12, 42)); // last fired at lunch; now after dinner
  assert.equal(r.due, true); assert.equal(r.mealMin, at(19, 30));
  ok('each meal has its own window (dinner fires even after a lunch nudge)');
}

console.log(`postmeal: ${n} checks passed`);
