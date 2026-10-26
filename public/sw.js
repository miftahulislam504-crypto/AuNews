/* AuNews সার্ভিস ওয়ার্কার: পেজ নেটওয়ার্ক-ফার্স্ট (অফলাইনে আগে দেখা পেজ), স্ট্যাটিক ফাইল ক্যাশ-ফার্স্ট। */
const VERSION = "v1";
const PAGES = `aunews-pages-${VERSION}`;
const STATIC = `aunews-static-${VERSION}`;
const MAX_PAGES = 30;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== PAGES && k !== STATIC).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

const OFFLINE_HTML =
  '<!doctype html><html lang="bn"><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1"><title>অফলাইন</title>' +
  '<body style="font-family:system-ui,sans-serif;text-align:center;padding:56px 16px">' +
  "<h1>ইন্টারনেট নেই</h1><p>সংযোগ ফিরলে আবার চেষ্টা করুন। আগে দেখা পেজ অফলাইনেও খুলবে।</p></body></html>";

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function networkFirstPage(req) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    if (res.ok) {
      cache.put(req, res.clone()).then(() => trim(cache, MAX_PAGES)).catch(() => {});
    }
    return res;
  } catch {
    const hit = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true })) || (await cache.match("/"));
    return hit || new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}

async function networkFirstData(req) {
  const cache = await caches.open(STATIC);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw new Error("offline");
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirstPage(req));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req));
  } else if (url.pathname === "/api/search-index") {
    event.respondWith(networkFirstData(req));
  }
});
