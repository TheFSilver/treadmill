// sw.js — offline shell + Web Push handler. Module service worker (imports push-format).
import { notificationFromPush } from './push-format.js';

const CACHE = 'treadmill-v1';
const ASSETS = [
  './', './index.html', './app.js', './ui.js', './ftms-ble.js', './ftms-core.js',
  './incline.js', './session.js', './simulator.js', './web-ble.js', './h10-core.js',
  './dropdown.js', './notify.js', './streak.js', './trend.js',
  './push-format.js', './push-client.js',
  './manifest.json', './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
self.addEventListener('push', (e) => {
  const { title, options } = notificationFromPush(e.data ? e.data.text() : '');
  e.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => {
    for (const c of cs) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
