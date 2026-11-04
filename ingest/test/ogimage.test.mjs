import test from "node:test";
import assert from "node:assert/strict";
import { extractOgImages, fetchOgImages } from "../lib/ogImage.mjs";
import { pickPhoto } from "../lib/card.mjs";

const page = (head) => `<html><head>${head}</head><body></body></html>`;

test("extractOgImages: og:image আগে; attribute ক্রম যাই হোক; আপেক্ষিক লিংক পূর্ণ; http→https; ডুপ্লিকেট নেই", () => {
  const html = page(`
    <meta content="/img/a.jpg" property="og:image">
    <meta name="twitter:image" content="http://cdn.test/t.jpg">
    <meta property='og:image' content='/img/a.jpg'>
    <link rel="image_src" href="https://cdn.test/l.jpg">`);
  assert.deepEqual(extractOgImages(html, "https://news.test/p/1"), ["https://news.test/img/a.jpg", "https://cdn.test/t.jpg", "https://cdn.test/l.jpg"]);
});

test("extractOgImages: লোগো/প্লেসহোল্ডার বাদ; JSON-LD এর image নেওয়া হয়; খালি HTML এ খালি তালিকা", () => {
  const html = page(`
    <meta property="og:image" content="https://news.test/static/logo.png">
    <meta property="og:image" content="https://news.test/default-og.jpg">
    <script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","image":["https://news.test/ld/1.jpg?a=1&b=2"]}]}</script>`);
  assert.deepEqual(extractOgImages(html, "https://news.test/"), ["https://news.test/ld/1.jpg?a=1&b=2"]);
  assert.deepEqual(extractOgImages("", "https://news.test/"), []);
});

test("fetchOgImages: গুগল-নিউজ/প্রাইভেট হোস্ট/নন-এইচটিএমএল/ব্যর্থ ফেচ → খালি, exception নয়", async () => {
  let hits = 0;
  const f = async () => { hits++; return new Response("x", { headers: { "content-type": "image/png" } }); };
  assert.deepEqual(await fetchOgImages("https://news.google.com/rss/articles/abc", { fetchImpl: f }), []);
  assert.deepEqual(await fetchOgImages("http://127.0.0.1/x", { fetchImpl: f }), []);
  assert.deepEqual(await fetchOgImages("not a url", { fetchImpl: f }), []);
  assert.equal(hits, 0);
  assert.deepEqual(await fetchOgImages("https://a.test/1", { fetchImpl: f }), []);
  assert.deepEqual(await fetchOgImages("https://a.test/1", { fetchImpl: async () => { throw new Error("net"); } }), []);
});

// ছদ্ম sharp: ছবির "বাইট" = "WxH" লেখা; metadata সেখান থেকে
const fakeSharp = (raw) => ({ metadata: async () => { const [w, h] = raw.toString().split("x").map(Number); return { width: w, height: h }; } });
const mkFetch = (map) => async (url) => {
  const hit = map[url];
  if (hit === undefined) return new Response("", { status: 404 });
  if (hit.html) return new Response(hit.html, { headers: { "content-type": "text/html" } });
  return new Response(hit.img, { headers: { "content-type": "image/jpeg" } });
};

test("pickPhoto: RSS ছবি ভালো হলে পেজ ফেচ হয় না", async () => {
  let pageFetched = false;
  const base = mkFetch({ "https://i.test/a.jpg": { img: "1200x800" } });
  const f = async (u, o) => { if (u === "https://p.test/1") pageFetched = true; return base(u, o); };
  const raw = await pickPhoto(fakeSharp, { imageUrls: ["https://i.test/a.jpg"], pageUrls: ["https://p.test/1"], fetchImpl: f });
  assert.equal(raw.toString(), "1200x800");
  assert.equal(pageFetched, false);
});

test("pickPhoto: RSS এ ছবি নেই বা ছোট → পেজের og:image থেকে বড়টি", async () => {
  const f = mkFetch({
    "https://i.test/thumb.jpg": { img: "150x100" }, // খুব ছোট: বাদ
    "https://p.test/1": { html: page('<meta property="og:image" content="https://i.test/big.jpg">') },
    "https://i.test/big.jpg": { img: "1000x667" },
  });
  const raw = await pickPhoto(fakeSharp, { imageUrls: [null, "https://i.test/thumb.jpg"], pageUrls: ["https://p.test/1"], fetchImpl: f });
  assert.equal(raw.toString(), "1000x667");
});

test("pickPhoto: লোগো-স্ট্রিপ (অতি চওড়া) বাদ; কিছু না মিললে null; মাঝারি ছবি শেষ ভরসা", async () => {
  const f = mkFetch({
    "https://i.test/strip.jpg": { img: "1200x200" },
    "https://i.test/mid.jpg": { img: "500x330" },
  });
  assert.equal(await pickPhoto(fakeSharp, { imageUrls: ["https://i.test/strip.jpg"], fetchImpl: f }), null);
  const raw = await pickPhoto(fakeSharp, { imageUrls: ["https://i.test/strip.jpg", "https://i.test/mid.jpg"], fetchImpl: f });
  assert.equal(raw.toString(), "500x330");
  assert.equal(await pickPhoto(fakeSharp, { imageUrls: [], pageUrls: [], fetchImpl: f }), null);
});
