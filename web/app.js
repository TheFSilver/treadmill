// app.js — browser entry point. Plugs the real adapters (Web Bluetooth treadmill + optional
// H10 for HR) into the UI, and wires the shared habit/history layer. Synergies: H10 heart
// rate (resonance stack) + body weight (fittrack) → real, incline-aware calories.

import { mount } from './ui.js';
import { TreadmillConnection } from './ftms-ble.js';
import { H10Connection } from './web-ble.js';
import { WorkoutSession } from './session.js';
import { makeTreadmillSimulator } from './simulator.js';
import { createNotifier } from './notify.js';
import { recordSession, loadStreak, streakText, loadSessions, deleteSession, todayStr, loadPref, savePref } from './streak.js';
import { summary as summarizeHistory, todayTotals } from './trend.js';
import { loadSettings, saveSettings, positionsFromSettings } from './settings.js';
import { parseMealTimes, nudgeDue } from './postmeal.js';
import { createWakeLock } from './wakelock.js';

const notifier = createNotifier();
const wakeLock = createWakeLock();        // keep the screen on during a workout
const settings = loadSettings();          // weight (fittrack synergy), maxHr, incline angles, goal
const treadmill = new TreadmillConnection();

const app = mount(document, {
  treadmill,                                // FTMS (homeTro HM1) — Android Chrome
  h10: new H10Connection(),                 // optional HR for zone training (resonance synergy)
  makeSession: (o) => new WorkoutSession(o),
  makeSimulator: makeTreadmillSimulator,
  notifier,
  weightKg: settings.weightKg,
  heightCm: settings.heightCm,               // → default stride (steps)
  birthdate: settings.birthdate,             // → age (Keytel HR-calories + Tanaka HRmax)
  sex: settings.sex,                         // → Keytel
  vestKg: loadPref('vest', 0),               // per-session vest, remembered (not a setting)
  maxHr: settings.maxHr,                      // 0 = auto from age (Tanaka)
  positions: positionsFromSettings(settings),
  defaultProgramId: loadPref('program', 'free'),
  defaultPositionId: loadPref('position', 1),
  saveScreen: (s) => savePref('screen', s),
  lastScreen: loadPref('screen', null),
  goalKm: settings.goalKm,
  goalSteps: settings.goalSteps,
  goalType: settings.goalType,
  wakeLock,
  loadHistory: () => loadSessions().filter((s) => s.activity === 'treadmill'),
  summarizeHistory,
  deleteSession: (id) => deleteSession(id),
  todayTotals,
  today: () => todayStr(),
});

app.onProgram = (id) => savePref('program', id);
app.onPosition = (id) => savePref('position', id);
app.onSettings = (partial) => saveSettings(partial);   // weight/maxHr/incline/goal persisted
app.onVest = (kg) => savePref('vest', kg);             // remember the last vest choice

// Shared habit layer: every modality (weigh, breathe, walk) feeds ONE streak (compound).
app.setStreak(streakText(loadStreak()));
app.onFinish = (session) => { app.setStreak(streakText(recordSession(session))); };

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { type: 'module' }).then(() => {
    document.addEventListener('click', () => notifier.requestPermission(), { once: true });
  }).catch(() => {});
}

// Post-meal walk nudge — the one solid lever from the walking-fat-loss science (glucose-blunting).
// Opt-in (settings.postMealNudge); checks each minute against the user's meal times, once per meal.
if (settings.postMealNudge) {
  const meals = parseMealTimes(settings.mealTimes);
  const checkNudge = () => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const today = todayStr();
    const last = loadPref('postMealNudge.last', null);
    const lastMin = last && last.date === today ? last.min : null;
    const r = nudgeDue(nowMin, meals, lastMin);
    if (r.due) { notifier.notify('Marche post-repas', { body: r.message, vibration: [60] }); savePref('postMealNudge.last', { date: today, min: nowMin }); }
  };
  setInterval(checkNudge, 60000); checkNudge();
}

// After a refresh the BLE link is gone (Web Bluetooth limitation), but if the treadmill was
// granted before we can reconnect WITHOUT the chooser. Try silently on load; if the browser
// requires a gesture, the first tap on "Connecter" reconnects in one tap (no device picker)
// and lands back on the page you were on.
treadmill.hasKnownDevice().then((known) => { if (known) app.connectTreadmill(); }).catch(() => {});
