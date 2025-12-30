const CACHE_NAME = "slp-cache-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./js/main.js",
  "./js/core.js",
  "./js/ui-render.js",
  "./js/interaction.js",
  "./js/media-system.js",
  "./manifest.json"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});
