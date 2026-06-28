// push-client.js — PWA side of Web Push: fetch the VAPID public key, subscribe via the
// PushManager, and register the subscription with the Worker. registration + fetch are
// injectable so it's behavior-tested without a browser.

export function urlBase64ToUint8Array(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b);
  const u = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i);
  return u;
}

export async function subscribeToPush(registration, { apiBase, fetch = globalThis.fetch } = {}) {
  if (!registration || !registration.pushManager || !apiBase) return null;
  const existing = await registration.pushManager.getSubscription();
  const vapidPublic = await (await fetch(apiBase + '/vapidPublicKey')).text();
  const sub = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublic),
  });
  await fetch(apiBase + '/subscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub),
  });
  return sub;
}
