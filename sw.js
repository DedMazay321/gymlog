// Сеть в приоритете, кэш — запасной вариант для работы без интернета.
// При установке кэшируются только файлы самого приложения (быстро и надёжно),
// а фото упражнений докачиваются в фоне по одному по сигналу страницы: сбой одного файла ничего не ломает.
const CACHE = 'gymlog-v1';
const isImg = p => p.startsWith('img/');

const manifest = () => fetch('version.json', { cache: 'no-store' }).then(r => r.json());

self.addEventListener('install', e => {
  e.waitUntil(manifest()
    .then(v => caches.open(CACHE).then(c => c.addAll(['./', 'version.json', ...Object.keys(v.files).filter(p => !isImg(p))])))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Фоновая докачка фото: по 4 файла одновременно, уже скачанные пропускаются.
let prefetching = null;
async function prefetchImages() {
  const v = await manifest(), c = await caches.open(CACHE);
  const have = new Set((await c.keys()).map(r => new URL(r.url).pathname.split('/').pop()));
  const need = Object.keys(v.files).filter(p => isImg(p) && !have.has(p.split('/').pop()));
  let i = 0;
  const worker = async () => {
    while (i < need.length) {
      const p = need[i++];
      try { const r = await fetch(p); if (r.ok) await c.put(p, r); } catch (err) { /* нет сети — докачаем в следующий раз */ }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return need.length;
}
self.addEventListener('message', e => {
  if (e.data === 'prefetch') {
    prefetching = prefetching || prefetchImages().finally(() => { prefetching = null; });
    e.waitUntil(prefetching);
  }
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    // файлы приложения всегда сверяем с сервером (быстрый запрос «не изменился ли»), иначе браузер мог
    // подставить из своего кэша старые стили к новым скриптам; фото упражнений не меняются — им хватает обычного кэша
    fetch(e.request, e.request.url.includes('/img/') ? {} : { cache: 'no-cache' }).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
