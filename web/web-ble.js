// web-ble.js — Web Bluetooth adapter for the Polar H10. Subscribes to the standard Heart
// Rate Measurement notifications (service 0x180D) and pushes parsed { hr, rr } to onData.
// navigator.bluetooth is injected so the connection path is testable without hardware.
// Android Chrome supports Web Bluetooth natively; iOS Safari does not (see README).

import {
  parseHeartRate,
  HEART_RATE_SERVICE,
  HEART_RATE_MEASUREMENT,
  BATTERY_SERVICE,
} from './h10-core.js';

export class H10Connection {
  constructor(bluetooth) {
    this.bluetooth = bluetooth || (typeof navigator !== 'undefined' ? navigator.bluetooth : null);
    this.onData = () => {};
    this.onDisconnect = () => {};
    this.connected = false;
  }

  get supported() { return !!this.bluetooth; }

  async connect() {
    if (!this.bluetooth) {
      throw new Error('Web Bluetooth non supporté — utilise Chrome (Android ou desktop).');
    }
    this.device = await this.bluetooth.requestDevice({
      filters: [{ services: [HEART_RATE_SERVICE] }],
      optionalServices: [BATTERY_SERVICE],
    });
    if (this.device.addEventListener) {
      this.device.addEventListener('gattserverdisconnected', () => {
        this.connected = false;
        this.onDisconnect();
      });
    }
    this.server = await this.device.gatt.connect();
    const svc = await this.server.getPrimaryService(HEART_RATE_SERVICE);
    this.char = await svc.getCharacteristic(HEART_RATE_MEASUREMENT);
    this.char.addEventListener('characteristicvaluechanged', (e) => {
      this.onData(parseHeartRate(e.target.value));
    });
    await this.char.startNotifications();
    this.connected = true;
    return true;
  }

  disconnect() {
    try { this.server && this.server.disconnect(); } catch {}
    this.connected = false;
  }
}
