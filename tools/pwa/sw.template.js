// tools/pwa/sw.template.js —— 由 vite.config.js 在构建时注入版本与预缓存清单，产物为 dist/sw.js。
// 策略：导航请求网络优先（保证更新），其余同源 GET 缓存优先（离线可用）。
const VERSION = '__MM_VERSION__';
const PRECACHE = __MM_PRECACHE__;
const CACHE = 'musicmaster-' + VERSION;
const INDEX = new URL('index.html', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE.map((path) => new URL(path, self.registration.scope).href));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('musicmaster-') && key !== CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        // 缓存写入失败不能影响本次导航。
        try {
          const cache = await caches.open(CACHE);
          await cache.put(INDEX, fresh.clone());
        } catch (err) { /* 忽略缓存错误 */ }
        return fresh;
      } catch (err) {
        return (await caches.match(INDEX)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      try { await cache.put(request, response.clone()); } catch (err) { /* 忽略缓存错误 */ }
    }
    return response;
  })());
});
