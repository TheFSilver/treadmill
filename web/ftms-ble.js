// ftms-ble.js — Web Bluetooth adapter for an FTMS treadmill (the homeTro HM1). Subscribes to
// Treadmill Data (0x2ACD) notifications and writes the Control Point (0x2AD9) for
// start/stop/speed/incline. navigator.bluetooth is injected so the path is testable without
// hardware. Android Chrome only (iOS Safari has no Web Bluetooth).

import {
  FTMS_SERVICE, TREADMILL_DATA, CONTROL_POINT,
  parseTreadmillData, requestControl, startCmd, stopCmd, setSpeedCmd, setInclinationCmd,
} from './ftms-core.js';

export class TreadmillConnection {
  constructor(bluetooth) {
    this.bluetooth = bluetooth || (typeof navigator !== 'undefined' ? navigator.bluetooth : null);
    this.onData = () => {};
    this.onDisconnect = () => {};
    this.connected = false;
  }

  get supported() { return !!this.bluetooth; }

  // A previously-granted FTMS/FS- device (no chooser). null if none or unsupported.
  async findKnownDevice() {
    if (!this.bluetooth || !this.bluetooth.getDevices) return null;
    try {
      const known = await this.bluetooth.getDevices();
      return known.find((d) => /^FS-/i.test(d.name || '') || /hometro/i.test(d.name || '')) || null;
    } catch { return null; }
  }
  async hasKnownDevice() { return !!(await this.findKnownDevice()); }

  async connect() {
    if (!this.bluetooth) throw new Error('Web Bluetooth non supporté — utilise Chrome (Android).');
    // Reconnect a previously-granted device WITHOUT the chooser (one-tap after a refresh).
    // (Web Bluetooth tears down the GATT link on reload — we can't keep it alive, but we can
    //  skip the device picker.) Falls back to the picker on first use.
    this.device = await this.findKnownDevice();
    if (!this.device) {
      this.device = await this.bluetooth.requestDevice({
        filters: [{ services: [FTMS_SERVICE] }, { namePrefix: 'FS-' }],
        optionalServices: [FTMS_SERVICE],
      });
    }
    if (this.device.addEventListener) {
      this.device.addEventListener('gattserverdisconnected', () => { this.connected = false; this.onDisconnect(); });
    }
    this.server = await this.device.gatt.connect();
    const svc = await this.server.getPrimaryService(FTMS_SERVICE);
    this.dataChar = await svc.getCharacteristic(TREADMILL_DATA);
    this.dataChar.addEventListener('characteristicvaluechanged', (e) => this.onData(parseTreadmillData(e.target.value)));
    await this.dataChar.startNotifications();
    try {
      this.controlChar = await svc.getCharacteristic(CONTROL_POINT);
      await this.write(requestControl()); // ask for control (required by many treadmills)
      this.controllable = true;
    } catch { this.controllable = false; } // read-only treadmill → stats still work
    this.connected = true;
    return { controllable: this.controllable };
  }

  async write(bytes) {
    if (!this.controlChar) throw new Error('Contrôle indisponible sur cet appareil');
    if (this.controlChar.writeValueWithResponse) return this.controlChar.writeValueWithResponse(bytes);
    return this.controlChar.writeValue(bytes);
  }

  start() { return this.write(startCmd()); }
  stop() { return this.write(stopCmd()); }
  setSpeed(kmh) { return this.write(setSpeedCmd(kmh)); }
  setIncline(pct) { return this.write(setInclinationCmd(pct)); }

  disconnect() { try { this.server && this.server.disconnect(); } catch {} this.connected = false; }
}
