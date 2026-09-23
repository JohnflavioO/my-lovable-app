/* eslint-disable no-undef */
// Service Worker do Firebase Messaging (escopo clássico — não use ESM aqui).
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyA7Xg9BQ4kzg6QqGnlxynbp92nSs2jtGeI",
  authDomain: "push-mci-crm.firebaseapp.com",
  projectId: "push-mci-crm",
  storageBucket: "push-mci-crm.firebasestorage.app",
  messagingSenderId: "741697309199",
  appId: "1:741697309199:web:aaf8751a1b31749eaa717a",
  measurementId: "G-39Q3MK7TX4"
});

const messaging = firebase.messaging();

function isLovablePreviewUrl(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname;
    return host.startsWith('id-preview--')
      || host.startsWith('preview--')
      || host.includes('-preview--')
      || host.endsWith('.lovableproject.com')
      || host.endsWith('.lovableproject-dev.com')
      || host.endsWith('.beta.lovable.dev');
  } catch (_) {
    return false;
  }
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (windowClients.some((client) => isLovablePreviewUrl(client.url))) {
        await self.registration.unregister();
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'MCI CRM';
  const options = {
    body: payload.notification?.body || '',
    icon: '/favicon.png',
    badge: '/favicon.png',
    data: payload.data || {},
    tag: payload.data?.tag || undefined,
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const c of wins) {
        if (c.url.includes(urlToOpen) && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});
