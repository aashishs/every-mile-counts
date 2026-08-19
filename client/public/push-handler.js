self.addEventListener('push', (event) => {
  let payload = { title: 'Every Mile Counts', body: '', data: {} };
  try {
    payload = { ...payload, ...(event.data?.json() || {}) };
  } catch {
    payload.body = event.data?.text() || '';
  }
  const data = payload.data || {};
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Every Mile Counts', {
      body: payload.body || '',
      icon: '/logo.png',
      badge: '/logo.png',
      data,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/notifications';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
