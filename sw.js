const CACHE_NAME = "slp-cache-v2.3.2"; // バージョンを上げて更新を促す
const ASSETS = [
  "./",
  "./index.html",
  "./css/base-theme.css",
  "./css/board-layout.css",
  "./css/ghosts.css",
  "./css/gimmick-effects.css",
  "./css/ui-components.css",
  "./js/state.js",
  "./js/media/rotation.js",
  "./js/game/board.js",
  "./js/game/session.js",
  "./js/game/gimmicks.js",
  "./js/ui/board.js",
  "./js/ui/ghosts.js",
  "./js/history/store.js",
  "./js/history/ui.js",
  "./js/history/import-export.js",
  "./js/replay/moves.js",
  "./js/replay/replay.js",
  "./js/replay/playback.js",
  "./js/media/media.js",
  "./js/solver/search.js",
  "./js/solver/greedy.js",
  "./js/solver/controller.js",
  "./js/input/drag.js",
  "./js/input/events.js",
  "./js/main.js",
  "./manifest.json",
  "./favicon.ico",
  "./icon-192.png",
  "./icon-512.png"
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
          if (key.startsWith("slp-cache-") && key !== CACHE_NAME) return caches.delete(key);
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
