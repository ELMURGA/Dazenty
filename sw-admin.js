// Service worker del panel (/admin): solo recibe las notificaciones push y abre
// el panel al pulsarlas. No cachea nada: el panel siempre se carga de la red.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Dazenty OS', {
    body: data.body || '',
    icon: '/img/app/icon-192.png',
    badge: '/img/app/icon-192.png',
    data: { url: data.url || '/admin' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/admin', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if (client.url.includes('/admin') && 'focus' in client) {
        if ('navigate' in client) client.navigate(url);
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
