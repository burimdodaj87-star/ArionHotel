'use strict';

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_error) {
    payload = { body: event.data ? event.data.text() : 'Hoteltransfer ist fällig.' };
  }

  const parking = String(payload.parking || 'P5').toUpperCase();
  const title = payload.title || `${parking}: Hoteltransfer in 20 Minuten`;
  const options = {
    body: payload.body || 'Ein Hoteltransfer ist fällig.',
    icon: new URL('app-icon-192.png', self.registration.scope).href,
    badge: new URL('app-icon-192.png', self.registration.scope).href,
    tag: payload.tag || `hotel-transfer-${payload.transferId || Date.now()}`,
    renotify: true,
    requireInteraction: true,
    vibrate: [250, 100, 250, 100, 400],
    data: {
      url: payload.url || (parking === 'P6' ? 'dashboard.html' : 'p5.html'),
      parking,
      transferId: payload.transferId || null,
    },
    actions: [
      { action: 'open', title: 'Hoteltransfers öffnen' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || 'p5.html', self.registration.scope).href;

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return clients.openWindow ? clients.openWindow(target) : undefined;
  })());
});
