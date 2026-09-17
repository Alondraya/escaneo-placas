const CACHE_NAME = "placas-app-v2";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./js/storage.js",
  "./js/scanner.js",
  "./js/app.js",
  "./js/dashboard.js",
  "./js/pwa.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon.png",
];

const CDN_ASSETS = [
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js",
  "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(APP_SHELL);
      await Promise.all(
        CDN_ASSETS.map((url) =>
          cache.add(new Request(url, { mode: "cors" })).catch(() => null)
        )
      );
      self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Nunca cachear la API: siempre datos frescos del servidor
  if (url.pathname.startsWith("/api/")) return;

  const isSameOrigin = url.origin === self.location.origin;
  const isCdn = CDN_ASSETS.some((c) => req.url.startsWith(c));

  if (isSameOrigin) {
    const esNavegacion = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

    if (esNavegacion) {
      // Network-first para el HTML (siempre la versión más reciente)
      event.respondWith(
        fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            return res;
          })
          .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
      );
      return;
    }

    // Cache-first para el resto de recursos propios (css, js, iconos)
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            return res;
          })
          .catch(() => caches.match("./index.html"));
      })
    );
  } else if (isCdn) {
    // Cache-first para CDN (chart.js / tesseract.js)
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        });
      })
    );
  }
});
