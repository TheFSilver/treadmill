// push-format.js — pure: turn a raw push payload into a {title, options} notification.
// Shared by the service worker (push handler) so the logic stays testable in Node.

export function notificationFromPush(raw) {
  let d = {};
  try {
    if (raw && typeof raw === 'object') d = raw;
    else if (typeof raw === 'string' && raw) d = JSON.parse(raw);
  } catch { d = { body: String(raw || '') }; }
  return {
    title: d.title || 'Resonance',
    options: {
      body: d.body || '',
      icon: './icon.svg',
      badge: './icon.svg',
      tag: d.tag || 'resonance',
      data: d.data || {},
      vibrate: d.vibrate || [120, 60, 120],
    },
  };
}
