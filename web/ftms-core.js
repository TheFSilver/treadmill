// ftms-core.js — Bluetooth FiTness Machine Service (FTMS, 0x1826). The homeTro HM1 advertises
// FTMS, so we control it with the OPEN standard — no FitShow app, no premium, no lock.
// Pure functions over raw frames → testable without hardware.

export const FTMS_SERVICE = 0x1826;
export const TREADMILL_DATA = 0x2acd;          // notify: speed/distance/time/energy/HR…
export const CONTROL_POINT = 0x2ad9;           // write: request control / start / stop / set speed
export const MACHINE_STATUS = 0x2ada;          // notify: machine state changes
export const FITSHOW_SERVICE = 0xfff0;         // proprietary fallback (not needed when FTMS present)

// --- Treadmill Data (0x2ACD) -------------------------------------------------------------
// Layout = uint16 flags, then fields in fixed order, each present per its flag bit. The
// Instantaneous Speed field is present when flag bit0 ("More Data") is 0.
const FIELDS = [
  // [flagBit, key, reader(cursor) -> value]   (null flagBit = special: instantaneous speed)
  [null, 'speed',         (c) => c.u16() / 100],          // km/h (0.01)
  [1,    'avgSpeed',      (c) => c.u16() / 100],
  [2,    'distance',      (c) => c.u24()],                // m
  [3,    'inclination',   (c) => { const i = c.s16() / 10; c.s16(); return i; }], // % (+ ramp angle, skipped)
  [4,    'elevationGain', (c) => { const up = c.u16() / 10; c.u16(); return up; }],
  [5,    'instPace',      (c) => c.u8()],
  [6,    'avgPace',       (c) => c.u8()],
  [7,    'energy',        (c) => { const t = c.u16(); c.u16(); c.u8(); return t; }], // total kcal (+per hour/min skipped)
  [8,    'heartRate',     (c) => c.u8()],                 // bpm
  [9,    'met',           (c) => c.u8() / 10],
  [10,   'elapsedTime',   (c) => c.u16()],                // s
  [11,   'remainingTime', (c) => c.u16()],
];

export function parseTreadmillData(dv) {
  if (!dv || typeof dv.getUint8 !== 'function') throw new TypeError('parseTreadmillData expects a DataView');
  const flags = dv.getUint16(0, true);
  const c = cursor(dv, 2);
  const out = {};
  for (const [bit, key, read] of FIELDS) {
    const present = bit === null ? (flags & 0x01) === 0 : (flags & (1 << bit)) !== 0;
    if (present) out[key] = read(c);
  }
  return out;
}

// Build a Treadmill Data frame from a value object (used by the simulator + tests).
export function encodeTreadmillData(v = {}) {
  let flags = 0;
  const body = [];
  const push16 = (n) => { body.push(n & 0xff, (n >> 8) & 0xff); };
  const push24 = (n) => { body.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff); };

  if ('speed' in v) push16(Math.round(v.speed * 100)); else flags |= 0x01; // bit0=1 → no speed
  if ('avgSpeed' in v) { flags |= 1 << 1; push16(Math.round(v.avgSpeed * 100)); }
  if ('distance' in v) { flags |= 1 << 2; push24(Math.round(v.distance)); }
  if ('inclination' in v) { flags |= 1 << 3; push16(Math.round(v.inclination * 10)); push16(0); }
  if ('energy' in v) { flags |= 1 << 7; push16(Math.round(v.energy)); push16(0); body.push(0); }
  if ('heartRate' in v) { flags |= 1 << 8; body.push(v.heartRate & 0xff); }
  if ('elapsedTime' in v) { flags |= 1 << 10; push16(Math.round(v.elapsedTime)); }

  const bytes = [flags & 0xff, (flags >> 8) & 0xff, ...body];
  return new DataView(new Uint8Array(bytes).buffer);
}

// --- Control Point (0x2AD9) --------------------------------------------------------------
// Commands the machine. Many treadmills require Request Control (0x00) before start/speed.
export const OP = { REQUEST_CONTROL: 0x00, RESET: 0x01, SET_SPEED: 0x02, SET_INCLINATION: 0x03, START: 0x07, STOP: 0x08 };

export function requestControl() { return new Uint8Array([OP.REQUEST_CONTROL]); }
export function startCmd() { return new Uint8Array([OP.START]); }
export function stopCmd() { return new Uint8Array([OP.STOP, 0x01]); }   // 0x01 = stop (0x02 = pause)
export function pauseCmd() { return new Uint8Array([OP.STOP, 0x02]); }
export function setSpeedCmd(kmh) {                                       // uint16, 0.01 km/h
  const v = Math.round(kmh * 100);
  return new Uint8Array([OP.SET_SPEED, v & 0xff, (v >> 8) & 0xff]);
}
export function setInclinationCmd(pct) {                                 // sint16, 0.1 %
  const v = Math.round(pct * 10);
  return new Uint8Array([OP.SET_INCLINATION, v & 0xff, (v >> 8) & 0xff]);
}

// Control Point response: [0x80, requestOp, resultCode]; resultCode 0x01 = success.
export function parseControlResponse(dv) {
  const op = dv.getUint8(0);
  if (op !== 0x80) return { ok: false, raw: op };
  return { ok: dv.getUint8(2) === 0x01, requestOp: dv.getUint8(1), result: dv.getUint8(2) };
}

// --- helpers -----------------------------------------------------------------------------
function cursor(dv, start) {
  let o = start;
  return {
    u8() { const x = dv.getUint8(o); o += 1; return x; },
    u16() { const x = dv.getUint16(o, true); o += 2; return x; },
    s16() { const x = dv.getInt16(o, true); o += 2; return x; },
    u24() { const x = dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getUint8(o + 2) << 16); o += 3; return x; },
  };
}
