// PAROU.PT - Service Worker Push Notifications & Notification Interaction Handler
/* eslint-disable no-undef */

// Handle incoming Web Push notifications (background / lock screen / system tray)
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'PAROU.PT', body: event.data.text() };
    }
  }

  const title = data.title || 'PAROU.PT - Alerta em Tempo Real';
  const options = {
    body: data.body || 'Nova alteração ou corte relevante na circulação em Portugal.',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    vibrate: [200, 100, 200],
    tag: data.reportId ? `report-${data.reportId}` : 'parou-alert',
    renotify: true,
    data: {
      url: data.url || (data.reportId ? `/?reportId=${data.reportId}` : '/'),
      reportId: data.reportId || null,
      timestamp: Date.now(),
    },
    actions: [
      { action: 'view', title: 'Ver Ocorrência' },
      { action: 'close', title: 'Ignorar' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus already open PAROU.PT client window and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client && targetUrl !== '/') {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // If no window is open, open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
