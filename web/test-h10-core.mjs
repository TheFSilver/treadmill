// Behavior: we correctly decode REAL-shaped Heart Rate Measurement packets from the H10
// (the bytes the strap will actually push), incl. RR intervals — the data HRV depends on.
import assert from 'node:assert';
import { parseHeartRate, encodeHeartRate } from './h10-core.js';

let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };

// Real packet: flags 0x16 (RR present|contact supported|contact detected), HR8=60,
// one RR = 0x0400 = 1024 (1/1024s) = exactly 1000 ms.
{
  const dv = new DataView(new Uint8Array([0x16, 60, 0x00, 0x04]).buffer);
  const r = parseHeartRate(dv);
  assert.equal(r.hr, 60);
  assert.equal(r.contactDetected, true);
  assert.equal(r.rr.length, 1);
  assert.ok(Math.abs(r.rr[0] - 1000) < 1, `rr≈1000, got ${r.rr[0]}`);
  ok('decodes 8-bit HR + RR with contact flag (real packet)');
}

// 16-bit HR round-trip (HR > 255 forces the 16-bit format flag).
{
  const dv = encodeHeartRate({ hr: 300, rr: [800, 820] });
  const r = parseHeartRate(dv);
  assert.equal(r.hr, 300);
  assert.equal(r.rr.length, 2);
  assert.ok(Math.abs(r.rr[0] - 800) < 1 && Math.abs(r.rr[1] - 820) < 1);
  ok('round-trips 16-bit HR + multiple RR intervals');
}

// No RR present → empty rr, HR still decoded.
{
  const dv = encodeHeartRate({ hr: 55, rr: [] });
  const r = parseHeartRate(dv);
  assert.equal(r.hr, 55);
  assert.deepEqual(r.rr, []);
  ok('handles packets with no RR field');
}

// Garbage input fails loudly rather than silently returning junk.
{
  assert.throws(() => parseHeartRate(null));
  assert.throws(() => parseHeartRate({}));
  ok('rejects non-DataView input');
}

console.log(`h10-core: ${n} checks passed`);
