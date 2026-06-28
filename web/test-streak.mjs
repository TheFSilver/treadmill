// Behavior: the daily streak (the adherence layer) increments on consecutive days, resets
// after a gap, ignores same-day repeats, and persists the session log. Storage + date are
// injected so it's deterministic.
import assert from 'node:assert';
import { recordSession, loadStreak, loadSessions, streakText, prevDay, savePref, loadPref } from './streak.js';

let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };

function fakeStorage() {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } };
}

// Consecutive days build the streak; same-day repeat doesn't double-count.
{
  const storage = fakeStorage();
  let s = recordSession({ protocol: 'coherence', score: { mean: 0.5 } }, { storage, date: '2026-06-01' });
  assert.equal(s.current, 1);
  s = recordSession({ protocol: 'coherence', score: { mean: 0.6 } }, { storage, date: '2026-06-01' });
  assert.equal(s.current, 1, 'second session same day keeps streak at 1');
  s = recordSession({ protocol: 'coherence', score: { mean: 0.7 } }, { storage, date: '2026-06-02' });
  assert.equal(s.current, 2, 'next day → streak 2');
  s = recordSession({ protocol: 'box' }, { storage, date: '2026-06-03' });
  assert.equal(s.current, 3); assert.equal(s.longest, 3);
  ok('streak grows on consecutive days, ignores same-day repeats');
}

// A gap resets current but keeps the longest record.
{
  const storage = fakeStorage();
  recordSession({ protocol: 'coherence' }, { storage, date: '2026-06-01' });
  recordSession({ protocol: 'coherence' }, { storage, date: '2026-06-02' });
  let s = recordSession({ protocol: 'coherence' }, { storage, date: '2026-06-05' }); // 3-day gap
  assert.equal(s.current, 1, 'gap resets current');
  assert.equal(s.longest, 2, 'longest preserved');
  assert.equal(loadStreak({ storage }).current, 1);
  assert.equal(loadSessions({ storage }).length, 3, 'all sessions logged');
  ok('a gap resets the streak but keeps the record + full log');
}

// Date math + label.
assert.equal(prevDay('2026-03-01'), '2026-02-28');
assert.equal(streakText({ current: 0 }), '');
assert.ok(streakText({ current: 4, longest: 4 }).includes('4'));
ok('prevDay + streakText render correctly');

// Preferences round-trip (e.g. last selected protocol restored on reopen).
{
  const storage = fakeStorage();
  assert.equal(loadPref('protocol', 'coherence', { storage }), 'coherence', 'default when unset');
  savePref('protocol', 'wimhof', { storage });
  assert.equal(loadPref('protocol', 'coherence', { storage }), 'wimhof', 'persisted choice restored');
  ok('savePref/loadPref persist the last protocol');
}

console.log(`streak: ${n} checks passed`);
