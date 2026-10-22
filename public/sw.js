const CACHE_NAME = "tabizucho-offline-v1";

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const core = ["/", "/site.webmanifest", "/favicon.png", "/favicon-48.png"];
  await Promise.allSettled(core.map(path => cache.add(path)));

  try {
    const response = await fetch("/", { cache: "reload" });
    if (response.ok) {
      const html = await response.clone().text();
      await cache.put("/", response);
      const assets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"'?#]+)["']/g)].map(match => match[1]);
      await Promise.allSettled([...new Set(assets)].map(path => cache.add(path)));
    }
  } catch {}
}

self.addEventListener("install", event => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then(async response => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match("/");
        return Response.error();
      })
  );
});
