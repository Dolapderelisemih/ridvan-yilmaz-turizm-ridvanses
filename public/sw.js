const CACHE_NAME = 'ridvanses-pwa-v19';
const ASSETS_TO_CACHE = [
  '/',
  '/dinle',
  '/rota',
  '/ani-kitabi',
  '/css/style.css',
  '/js/umrah-steps-map.js',
  '/pcm-capture-worklet.js',
  '/manifest.json',
  '/icons/icon-512.png',
  '/icons/icon-192.png',
  '/icons/apple-touch-icon.png',
  '/icons/app-logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/ws') ||
    url.pathname.startsWith('/rehber') ||
    url.pathname.startsWith('/hoca') ||
    url.pathname.startsWith('/panel') ||
    url.pathname.startsWith('/acente') ||
    url.pathname.startsWith('/login')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SHOW_NOTIFICATION' && self.registration.showNotification) {
    self.registration.showNotification(data.title || 'Rıdvan Yılmaz Turizm Duyurusu', {
      body: data.body || '',
      icon: '/icons/icon-512.png',
      badge: '/icons/icon-192.png',
      vibrate: [200, 100, 200],
      tag: data.tag || 'ridvanses-notify'
    });
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return self.clients.openWindow('/dinle');
    })
  );
});
