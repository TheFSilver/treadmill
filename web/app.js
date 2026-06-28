// app.js — browser entry point. Plugs the real adapters (Web Bluetooth treadmill + optional
// H10 for HR, Web Audio not needed here) into the UI. Logic lives in the tested modules.
// Synergies: H10 heart rate (resonance stack) + body weight from fittrack → real calories.

import { mount } from './ui.js';
import { TreadmillConnection } from './ftms-ble.js';
import { H10Connection } from './web-ble.js';            // reused from resonance (HR synergy)
import { WorkoutSession } from './session.js';
import { makeTreadmillSimulator } from './simulator.js';
import { createNotifier } from './notify.js';
import { recordSession, loadStreak, streakText, loadPref, savePref } from './streak.js';

// Body weight from fittrack (manual until a shared store is wired). Update to your value.
const WEIGHT_KG = loadPref('weightKg', 80);
const MAX_HR = loadPref('maxHr', 190);

const notifier = createNotifier();

const app = mount(document, {
  treadmill: new TreadmillConnection(),     // FTMS (homeTro HM1) — Android Chrome
  h10: new H10Connection(),                 // optional HR for zone training (resonance synergy)
  makeSession: (o) => new WorkoutSession(o),
  makeSimulator: makeTreadmillSimulator,
  notifier,
  weightKg: WEIGHT_KG,
  maxHr: MAX_HR,
  defaultProgramId: loadPref('program', 'free'),
  defaultPositionId: loadPref('position', 1),
});

app.onProgram = (id) => savePref('program', id);
app.setPosition = ((orig) => (id) => { savePref('position', id); return orig(id); })(app.setPosition);

// Shared habit layer: every modality (weigh, breathe, walk) feeds ONE streak (compound).
app.setStreak(streakText(loadStreak()));
app.onFinish = (session) => { app.setStreak(streakText(recordSession(session))); };

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { type: 'module' }).then(() => {
    document.addEventListener('click', () => notifier.requestPermission(), { once: true });
  }).catch(() => {});
}
