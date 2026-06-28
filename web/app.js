// app.js — browser entry point. Plugs the real adapters (Web Bluetooth treadmill + optional
// H10 for HR) into the UI, and wires the shared habit/history layer. Synergies: H10 heart
// rate (resonance stack) + body weight (fittrack) → real, incline-aware calories.

import { mount } from './ui.js';
import { TreadmillConnection } from './ftms-ble.js';
import { H10Connection } from './web-ble.js';
import { WorkoutSession } from './session.js';
import { makeTreadmillSimulator } from './simulator.js';
import { createNotifier } from './notify.js';
import { recordSession, loadStreak, streakText, loadSessions, loadPref, savePref } from './streak.js';
import { summary as summarizeHistory } from './trend.js';

const notifier = createNotifier();

const app = mount(document, {
  treadmill: new TreadmillConnection(),     // FTMS (homeTro HM1) — Android Chrome
  h10: new H10Connection(),                 // optional HR for zone training (resonance synergy)
  makeSession: (o) => new WorkoutSession(o),
  makeSimulator: makeTreadmillSimulator,
  notifier,
  weightKg: loadPref('weightKg', 80),       // from fittrack (manual for now)
  maxHr: loadPref('maxHr', 190),
  defaultProgramId: loadPref('program', 'free'),
  defaultPositionId: loadPref('position', 1),
  loadHistory: () => loadSessions().filter((s) => s.activity === 'treadmill'),
  summarizeHistory,
});

app.onProgram = (id) => savePref('program', id);
app.onPosition = (id) => savePref('position', id);

// Shared habit layer: every modality (weigh, breathe, walk) feeds ONE streak (compound).
app.setStreak(streakText(loadStreak()));
app.onFinish = (session) => { app.setStreak(streakText(recordSession(session))); };

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { type: 'module' }).then(() => {
    document.addEventListener('click', () => notifier.requestPermission(), { once: true });
  }).catch(() => {});
}
