// Behavior: subscribing fetches the VAPID key, subscribes with userVisibleOnly + the key as
// bytes, and POSTs the subscription to the Worker. No apiBase → no-op (push disabled).
import assert from 'node:assert';
import { subscribeToPush, urlBase64ToUint8Array } from './push-client.js';

let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };

// urlBase64ToUint8Array decodes a base64url VAPID key to bytes.
{
  const u = urlBase64ToUint8Array('AQAB');
  assert.ok(u instanceof Uint8Array && u.length === 3);
  ok('urlBase64ToUint8Array decodes to bytes');
}

// Full subscribe flow with injected registration + fetch.
{
  const calls = [];
  const fakeSub = { endpoint: 'https://push/abc', keys: { p256dh: 'x', auth: 'y' } };
  let subscribeOpts = null;
  const registration = {
    pushManager: {
      getSubscription: async () => null,
      subscribe: async (opts) => { subscribeOpts = opts; return fakeSub; },
    },
  };
  const fetch = async (url, init) => { calls.push({ url, init }); return { text: async () => 'BVAPIDKEY_test_value', json: async () => ({}) }; };

  const sub = await subscribeToPush(registration, { apiBase: 'https://api', fetch });
  assert.equal(sub, fakeSub);
  assert.ok(calls[0].url.endsWith('/vapidPublicKey'), 'fetches the VAPID key first');
  assert.ok(subscribeOpts.userVisibleOnly === true && subscribeOpts.applicationServerKey instanceof Uint8Array);
  const post = calls.find((c) => c.url.endsWith('/subscribe'));
  assert.ok(post && JSON.parse(post.init.body).endpoint === 'https://push/abc', 'POSTs the subscription');
  ok('subscribe: fetch key → subscribe(userVisibleOnly,key bytes) → POST /subscribe');
}

// No apiBase → push disabled, returns null without touching the push manager.
{
  let touched = false;
  const registration = { pushManager: { getSubscription: async () => { touched = true; } } };
  const sub = await subscribeToPush(registration, { apiBase: '' });
  assert.equal(sub, null); assert.equal(touched, false);
  ok('no apiBase → push disabled cleanly');
}

console.log(`push-client: ${n} checks passed`);
