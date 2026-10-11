// Сеть в приоритете, кэш — запасной вариант для работы без интернета.
const CACHE = 'gymlog-v1';

self.addEventListener('install', e => {
  // список файлов берём из version.json, чтобы без сети были доступны и фото упражнений
  e.waitUntil(fetch('version.json', { cache: 'no-store' }).then(r => r.json())
    .then(v => caches.open(CACHE).then(c => c.addAll(['./', 'version.json', ...Object.keys(v.files)])))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
