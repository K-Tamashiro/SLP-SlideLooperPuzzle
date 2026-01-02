const CACHE_NAME = "slp-cache-v1.0.2"; // バージョンを上げて更新を促す
const ASSETS = [
  "./",
  "./index.html",
  "./css/base-theme.css",
  "./css/board-layout.css",
  "./css/gimmick-effects.css",
  "./css/ui-components.css",
  "./js/main.js",
  "./js/core.js",
  "./js/ui-render.js",
  "./js/interaction.js",
  "./js/media-system.js",
  "./js/RotationManager.js",
  "./manifest.json"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // 新しいSWを即座に有効化
});

// 古いキャッシュを削除するアクティベート処理を追加
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});