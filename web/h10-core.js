// h10-core.js — parse the standard BLE Heart Rate Measurement characteristic (0x2A37).
//
// Unlike the FitTrack scale (proprietary TEA auth), the Polar H10 exposes HR + RR over
// the STANDARD Heart Rate Service (0x180D) — no crack needed. The RR intervals are what
// we use for HRV. Pure functions, no I/O → testable against raw byte sequences.

export const HEART_RATE_SERVICE = 'heart_rate';                 // 0x180D
export const HEART_RATE_MEASUREMENT = 'heart_rate_measurement'; // 0x2A37
export const BATTERY_SERVICE = 'battery_service';              // 0x180F
// Polar proprietary Measurement Data (raw ECG/ACC @130Hz) — documented for a future
// extension (see PROTOCOL.md). RR-based HRV does not need it.
export const POLAR_PMD_SERVICE = 'fb005c80-02e7-f387-1cad-8acd2d8df0c8';

// Parse a DataView of the Heart Rate Measurement characteristic.
// Returns { hr, contactDetected, rr } — rr = array of intervals in milliseconds.
// Per the BLE spec: byte0 = flags, then HR (8 or 16 bit), optional energy, then RR.
export function parseHeartRate(dataview) {
  if (!dataview || typeof dataview.getUint8 !== 'function') {
    throw new TypeError('parseHeartRate expects a DataView');
  }
  const flags = dataview.getUint8(0);
  const hr16 = (flags & 0x01) !== 0;
  const contactSupported = (flags & 0x04) !== 0;
  const contactDetected = contactSupported ? (flags & 0x02) !== 0 : null;
  const energyPresent = (flags & 0x08) !== 0;
  const rrPresent = (flags & 0x10) !== 0;

  let offset = 1;
  let hr;
  if (hr16) { hr = dataview.getUint16(offset, true); offset += 2; }
  else { hr = dataview.getUint8(offset); offset += 1; }

  if (energyPresent) offset += 2; // skip Energy Expended (uint16)

  const rr = [];
  if (rrPresent) {
    while (offset + 2 <= dataview.byteLength) {
      const raw = dataview.getUint16(offset, true); // units of 1/1024 s
      rr.push(raw * 1000 / 1024);
      offset += 2;
    }
  }
  return { hr, contactDetected, rr };
}

// Build a HR-measurement DataView from { hr, rr, contact } — used by the simulator and
// by tests to round-trip the parser against real-shaped packets.
export function encodeHeartRate({ hr = 60, rr = [], contact = true } = {}) {
  const hr16 = hr > 255;
  let flags = 0x04;              // contact supported
  if (hr16) flags |= 0x01;
  if (contact) flags |= 0x02;
  if (rr.length) flags |= 0x10;

  const bytes = [flags];
  if (hr16) bytes.push(hr & 0xff, (hr >> 8) & 0xff);
  else bytes.push(hr & 0xff);
  for (const ms of rr) {
    const raw = Math.round(ms * 1024 / 1000);
    bytes.push(raw & 0xff, (raw >> 8) & 0xff);
  }
  return new DataView(new Uint8Array(bytes).buffer);
}
