import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runIngest, toArticle } from "../lib/pipeline.mjs";
import { createFsStore } from "../lib/fsStore.mjs";
import { parseSeen } from "../lib/merge.mjs";

// ---- ইন-মেমরি store (fsStore এর মতো ইন্টারফেস) ----
function makeStore() {
  const s = { meta: {}, snaps: new Map() };
  return {
    s,
    loadMeta: async () => structuredClone(s.meta),
    saveMeta: async (m) => { s.meta = structuredClone(m); },
    loadSnapshots: async (ids) => new Map(ids.map((id) => [id, structuredClone(s.snaps.get(id)?.items ?? [])])),
    saveSnapshots: async (map) => { for (const [id, d] of map) s.snaps.set(id, structuredClone(d)); },
    wipe: async () => { const n = s.snaps.size; s.snaps.clear(); return n; },
  };
}

const CATS = ["national", "international", "politics", "economy", "sports", "technology", "entertainment", "health", "science", "engineering"];
const NOW = Date.parse("2026-10-25T12:00:00Z");
const H = 3600000;
const settings = (over = {}) => ({
  retention: { days: 7, mode: "rolling", ...(over.retention || {}) },
  ingest: { maxItemsPerFeedPerRun: 30, summaryMaxChars: 280, windowDays: 3, ...(over.ingest || {}) },
  snapshot: { perCategory: 80, all: 150, summaryChars: 160 },
  cluster: { threshold: 0.45, minShared: 2, maxHoursApart: 48 },
});
const src = (id, category = "national", extra = {}) => ({ id, name: id.toUpperCase(), scope: "bd", lang: "bn", category, url: `https://${id}.test/rss`, ...extra });
const item = (n, hoursAgo, extra = {}) => ({
  title: `খবর নম্বর ${n}`, link: `https://x.test/news/${n}?utm_source=a`, isoDate: new Date(NOW - hoursAgo * H).toISOString(),
  contentSnippet: `সারাংশ ${n}`, ...extra,
});
const feedsFrom = (map) => async (url) => {
  const v = map[url];
  if (v instanceof Error) throw v;
  return v || [];
};
const run = (store, sources, feeds, s = settings(), now = NOW, translator = null) =>
  runIngest({ store, fetchFeed: feedsFrom(feeds), sources, categoryIds: CATS, settings: s, translator, now });
const allItems = (store) => store.s.snaps.get("all")?.items ?? [];

test("toArticle: ঠিক ফিল্ড, নোডেট/নোলিংক বাদ, ভবিষ্যৎ তারিখ ক্ল্যাম্প", () => {
  const r = toArticle(item(1, 2), src("a"), NOW, 280);
  assert.ok(r.ok);
  assert.equal(r.article.link, "https://x.test/news/1");
  assert.equal(r.article.summary, "সারাংশ 1");
  assert.equal(toArticle({ title: "t", link: "https://a.b/c" }, src("a"), NOW, 280).reason, "nodate");
  assert.equal(toArticle({ title: "t", isoDate: new Date(NOW).toISOString() }, src("a"), NOW, 280).reason, "nolink");
  assert.equal(toArticle(item(2, -5), src("a"), NOW, 280).article.publishedAt, NOW);
});

test("প্রথম রান: স্ন্যাপশট + meta; দ্বিতীয় রানে ডুপ্লিকেট নয়, কোনো লেখাও নয়", async () => {
  const store = makeStore();
  const feeds = { "https://a.test/rss": [item(1, 1), item(2, 2)], "https://b.test/rss": [item(3, 3, { title: "ক্রিকেট ম্যাচে বিপিএল জয়" })] };
  const s1 = await run(store, [src("a"), src("b")], feeds);
  assert.equal(s1.added, 3);
  assert.equal(allItems(store).length, 3);
  assert.ok(store.s.snaps.has("national"));
  assert.ok(store.s.snaps.has("sports")); // ক্লাসিফাই হয়েছে
  assert.equal(allItems(store)[0].id.length, 20);
  assert.equal(parseSeen(store.s.meta.seen).size, 3);

  const before = JSON.stringify([...store.s.snaps]) + JSON.stringify(store.s.meta);
  const s2 = await run(store, [src("a"), src("b")], feeds, settings(), NOW + 30 * 60000);
  assert.equal(s2.added, 0);
  assert.equal(s2.dup, 3);
  assert.equal(s2.snapshotsWritten, 0);
  assert.equal(JSON.stringify([...store.s.snaps]) + JSON.stringify(store.s.meta), before); // কিছুই বদলায়নি
});

test("নতুন খবর এলে স্ন্যাপশটে মার্জ হয়, সর্ট ঠিক", async () => {
  const store = makeStore();
  const feeds = { "https://a.test/rss": [item(1, 5)] };
  await run(store, [src("a")], feeds);
  feeds["https://a.test/rss"] = [item(9, 1), item(1, 5)];
  const s = await run(store, [src("a")], feeds, settings(), NOW + 60000);
  assert.equal(s.added, 1);
  assert.deepEqual(allItems(store).map((i) => i.title), ["খবর নম্বর 9", "খবর নম্বর 1"]);
});

test("৩ দিনের (windowDays) পুরনো ও তারিখহীন আইটেম বাদ", async () => {
  const store = makeStore();
  const feeds = { "https://a.test/rss": [item(1, 1), item(2, 24 * 4), { title: "no date", link: "https://x.test/nd" }] };
  const s = await run(store, [src("a")], feeds);
  assert.equal(s.added, 1);
  assert.equal(s.old, 1);
  assert.equal(s.noDate, 1);
});

test("বিকল্প URL: প্রথমটি ফেল হলে alts থেকে আসে; সব ফেল হলে feedsFailed", async () => {
  const store = makeStore();
  const feeds = { "https://a.test/rss": new Error("HTTP 404"), "https://a.test/alt": [item(1, 1)], "https://b.test/rss": new Error("timeout") };
  const s = await run(store, [src("a", "national", { alts: ["https://a.test/alt"] }), src("b")], feeds);
  assert.equal(s.feedsOk, 1);
  assert.equal(s.feedsFailed.length, 1);
  assert.match(s.feedsFailed[0], /^b: timeout/);
  assert.equal(s.added, 1);
});

test("rolling রিটেনশন: ৭ দিনের পুরনো খবর নতুন খবর ছাড়াও পরের রানে সব স্ন্যাপশট থেকে বাদ যায়", async () => {
  const store = makeStore();
  const old = { id: "old1", title: "পুরনো", summary: "", link: "https://o/1", sourceId: "a", sourceName: "A", lang: "bn", scope: "bd", category: "sports", image: null, publishedAt: NOW - 8 * 24 * H };
  const keep = { ...old, id: "keep1", title: "রাখা", publishedAt: NOW - 6 * 24 * H };
  store.s.snaps.set("all", { items: [keep, old], updatedAt: 1 });
  store.s.snaps.set("sports", { items: [keep, old], updatedAt: 1 });
  store.s.snaps.set("health", { items: [old], updatedAt: 1 });
  const s = await run(store, [src("a")], { "https://a.test/rss": [] }); // কোনো নতুন খবর নেই
  assert.equal(s.added, 0);
  assert.deepEqual(allItems(store).map((i) => i.id), ["keep1"]);
  assert.deepEqual(store.s.snaps.get("sports").items.map((i) => i.id), ["keep1"]);
  assert.deepEqual(store.s.snaps.get("health").items, []);
  assert.ok(s.expired >= 1);
});

test("weekly_wipe: প্রথম রানে স্বাভাবিক ইনজেস্ট; ৭ দিন পর সব মোছে; শুধু wipe-এর পরের খবর ঢোকে", async () => {
  const store = makeStore();
  const cfg = settings({ retention: { mode: "weekly_wipe" } });
  const start = NOW - 8 * 24 * H;
  const at = (n, t) => ({ title: `খবর ${n}`, link: `https://x.test/w/${n}`, isoDate: new Date(t).toISOString(), contentSnippet: "s" });

  const s0 = await run(store, [src("a")], { "https://a.test/rss": [at(1, start - H)] }, cfg, start);
  assert.equal(s0.added, 1);
  assert.equal(store.s.meta.wipeAt, start);

  const feeds = { "https://a.test/rss": [at(1, start - H), at(2, NOW - 2 * H)] };
  const s1 = await run(store, [src("a")], feeds, cfg, NOW);
  assert.equal(s1.wiped, true);
  assert.ok(s1.deleted >= 1);
  assert.equal(s1.added, 0);
  assert.equal(allItems(store).length, 0);
  assert.equal(store.s.meta.floorAt, NOW);

  feeds["https://a.test/rss"].unshift(at(3, NOW + 30 * 60000));
  const s2 = await run(store, [src("a")], feeds, cfg, NOW + H);
  assert.equal(s2.wiped, false);
  assert.equal(s2.added, 1);
  assert.deepEqual(allItems(store).map((i) => i.title), ["খবর 3"]);
});

test("সব ফিড ফেল হলেও ক্র্যাশ করে না", async () => {
  const store = makeStore();
  const s = await run(store, [src("a")], { "https://a.test/rss": new Error("down") });
  assert.equal(s.feedsOk, 0);
  assert.equal(s.added, 0);
});

test("একই ঘটনার খবর ভিন্ন সোর্স থেকে এলে একই clusterId পায়", async () => {
  const store = makeStore();
  const at = (title, link, h) => ({ title, link, isoDate: new Date(NOW - h * H).toISOString(), contentSnippet: "s" });
  const feeds = {
    "https://a.test/rss": [at("বিপিএলে সিলেটকে ৬ উইকেটে হারিয়ে ফাইনালে ঢাকা", "https://a.test/1", 3), at("ঢাকায় মেট্রোরেলের নতুন সূচি ঘোষণা", "https://a.test/2", 2)],
    "https://b.test/rss": [at("সিলেটকে হারিয়ে বিপিএলের ফাইনালে উঠল ঢাকা", "https://b.test/1", 2)],
    "https://c.test/rss": [at("ফাইনালে ঢাকা, বিপিএলে সিলেটকে হারাল ৬ উইকেটে", "https://c.test/1", 1)],
  };
  await run(store, [src("a"), src("b"), src("c")], feeds);
  const items = allItems(store);
  const grouped = items.filter((i) => i.clusterId);
  assert.equal(grouped.length, 3);
  assert.equal(new Set(grouped.map((i) => i.clusterId)).size, 1);
  assert.equal(items.find((i) => i.title.includes("মেট্রোরেল")).clusterId, undefined);
  const oldest = [...grouped].sort((x, y) => x.publishedAt - y.publishedAt)[0];
  assert.equal(grouped[0].clusterId, oldest.id);
});

// ---------- AI অনুবাদ ইন্টিগ্রেশন (Groq) ----------
const aiSettings = (over = {}) => ({
  ...settings(),
  ai: { enabled: true, batchSize: 10, maxRequestsPerRun: 4, dailyRequestBudget: 300, dailyTokenBudget: 170000, ...over },
});
const enSrc = (id) => src(id, "international", { lang: "en", scope: "intl" });
const enItem = (n, h) => ({ title: `English headline ${n}`, link: `https://e.test/${n}`, isoDate: new Date(NOW - h * H).toISOString(), contentSnippet: `Snippet ${n}` });
const bnTranslator = (calls, tokens = 800) => async (batch) => {
  calls.push(batch.map((a) => a.title));
  return { items: new Map(batch.map((a, i) => [i, { t: `বাংলা: ${a.title}`, s: "" }])), tokens };
};

test("AI: শুধু ইংরেজি আইটেম অনুবাদ হয়; স্ন্যাপশটে titleBn থাকে; টোকেন গোনা হয়", async () => {
  const store = makeStore();
  const calls = [];
  const feeds = { "https://a.test/rss": [item(1, 1)], "https://en.test/rss": [enItem(1, 2), enItem(2, 3)] };
  const s = await run(store, [src("a"), enSrc("en")], feeds, aiSettings(), NOW, bnTranslator(calls));
  assert.equal(s.ai.requests, 1);
  assert.equal(s.ai.translated, 2);
  assert.equal(s.ai.tokens, 800);
  assert.ok(calls[0].every((t) => t.startsWith("English")));
  const items = allItems(store);
  assert.ok(items.filter((i) => i.lang === "en").every((i) => i.titleBn?.startsWith("বাংলা:")));
  assert.equal(items.find((i) => i.lang === "bn").titleBn, undefined);
  assert.equal(store.s.meta.aiCalls, 1);
  assert.equal(store.s.meta.aiTokens, 800);
});

test("AI: ট্রান্সলেটর না থাকলে/বন্ধ থাকলে কল হয় না, ইনজেস্ট স্বাভাবিক", async () => {
  const s = await run(makeStore(), [enSrc("en")], { "https://en.test/rss": [enItem(1, 1)] }, aiSettings());
  assert.equal(s.added, 1);
  assert.equal(s.ai.requests, 0);
  const calls = [];
  await run(makeStore(), [enSrc("en")], { "https://en.test/rss": [enItem(1, 1)] }, aiSettings({ enabled: false }), NOW, bnTranslator(calls));
  assert.equal(calls.length, 0);
});

test("AI: rate_limit এ retry-after অনুযায়ী বিরতি; খবর ইংরেজিতেই সেভ; বিরতির পর আবার চলে", async () => {
  const store = makeStore();
  let n = 0;
  const limited = async () => { n++; const e = new Error("HTTP 429"); e.kind = "rate_limit"; e.retryAfterMs = 2 * 3600000; throw e; };
  const feeds = { "https://en.test/rss": [enItem(1, 1)] };
  const s1 = await run(store, [enSrc("en")], feeds, aiSettings(), NOW, limited);
  assert.equal(s1.added, 1);
  assert.equal(s1.ai.errors.length, 1);
  assert.equal(allItems(store)[0].titleBn, undefined);
  assert.equal(store.s.meta.aiPausedUntil, NOW + 2 * 3600000);

  feeds["https://en.test/rss"] = [enItem(2, 0.5), enItem(1, 1)];
  const s2 = await run(store, [enSrc("en")], feeds, aiSettings(), NOW + 3600000, limited);
  assert.equal(s2.ai.skipped, "paused");
  assert.equal(n, 1);

  const calls = [];
  feeds["https://en.test/rss"] = [enItem(3, 0.1), enItem(2, 0.5), enItem(1, 1)];
  const s3 = await run(store, [enSrc("en")], feeds, aiSettings(), NOW + 2 * 3600000 + 60000, bnTranslator(calls));
  assert.equal(s3.ai.translated, 1);
  assert.equal(store.s.meta.aiPausedUntil, 0);
});

test("AI: retry-after না থাকলে ১ ঘণ্টা; config ত্রুটিতে ৬ ঘণ্টা বিরতি", async () => {
  const mkErr = (kind) => async () => { const e = new Error(kind); e.kind = kind; throw e; };
  const a = makeStore();
  await run(a, [enSrc("en")], { "https://en.test/rss": [enItem(1, 1)] }, aiSettings(), NOW, mkErr("rate_limit"));
  assert.equal(a.s.meta.aiPausedUntil, NOW + 3600000);
  const b = makeStore();
  await run(b, [enSrc("en")], { "https://en.test/rss": [enItem(1, 1)] }, aiSettings(), NOW, mkErr("config"));
  assert.equal(b.s.meta.aiPausedUntil, NOW + 6 * 3600000);
});

test("AI: দৈনিক টোকেন বাজেট শেষ হলে স্কিপ; পরের দিন আবার শুরু", async () => {
  const store = makeStore();
  const calls = [];
  const feeds = { "https://en.test/rss": [enItem(1, 1), enItem(2, 2)] };
  const cfg = aiSettings({ dailyTokenBudget: 1000, batchSize: 1, maxRequestsPerRun: 5 });
  const s = await run(store, [enSrc("en")], feeds, cfg, NOW, bnTranslator(calls, 800));
  assert.equal(s.ai.requests, 2);
  assert.equal(store.s.meta.aiTokens, 1600);
  feeds["https://en.test/rss"].unshift(enItem(3, 0.2));
  const s2 = await run(store, [enSrc("en")], feeds, cfg, NOW + 60000, bnTranslator(calls, 800));
  assert.equal(s2.ai.skipped, "daily_budget");
  feeds["https://en.test/rss"].unshift(enItem(4, 0.1));
  const s3 = await run(store, [enSrc("en")], feeds, cfg, NOW + 24 * 3600000, bnTranslator(calls, 800));
  assert.ok(s3.ai.requests > 0);
});

// ---------- fsStore (আসল ফাইল) ----------
test("fsStore: লেখা/পড়া, নেই বা নষ্ট ফাইল সহ্য করে, wipe", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "aunews-"));
  try {
    const st = createFsStore(path.join(dir, "data"));
    assert.deepEqual(await st.loadMeta(), {});
    assert.deepEqual([...(await st.loadSnapshots(["all"]))], [["all", []]]);
    await st.saveMeta({ seen: "a:1", wipeAt: 5 });
    await st.saveSnapshots(new Map([["all", { items: [{ id: "x", title: "বাংলা শিরোনাম" }], updatedAt: 9 }]]));
    assert.equal((await st.loadMeta()).wipeAt, 5);
    assert.equal((await st.loadSnapshots(["all"])).get("all")[0].title, "বাংলা শিরোনাম");
    assert.match(await readFile(path.join(dir, "data/feeds/all.json"), "utf8"), /বাংলা শিরোনাম/); // UTF-8 অক্ষত
    await writeFile(path.join(dir, "data/feeds/sports.json"), "{broken");
    assert.deepEqual((await st.loadSnapshots(["sports"])).get("sports"), []);
    assert.equal(await st.wipe(), 2);
    assert.equal((await st.loadSnapshots(["all"])).get("all").length, 0);
    assert.equal(await createFsStore(path.join(dir, "nope")).wipe(), 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("এন্ড-টু-এন্ড fsStore দিয়ে: দুই রান, ডুপ্লিকেট নেই, ফাইল আছে", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "aunews-"));
  try {
    const store = createFsStore(dir);
    const feeds = { "https://a.test/rss": [item(1, 1), item(2, 2)] };
    const s1 = await runIngest({ store, fetchFeed: feedsFrom(feeds), sources: [src("a")], categoryIds: CATS, settings: settings(), now: NOW });
    assert.equal(s1.added, 2);
    const s2 = await runIngest({ store, fetchFeed: feedsFrom(feeds), sources: [src("a")], categoryIds: CATS, settings: settings(), now: NOW + 60000 });
    assert.equal(s2.added, 0);
    const all = JSON.parse(await readFile(path.join(dir, "feeds/all.json"), "utf8"));
    assert.equal(all.items.length, 2);
    assert.equal(all.updatedAt, NOW);
    assert.ok((await readFile(path.join(dir, "meta.json"), "utf8")).includes("seen"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
