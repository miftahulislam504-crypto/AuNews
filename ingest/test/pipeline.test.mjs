import test from "node:test";
import assert from "node:assert/strict";
import { runIngest, toArticle } from "../lib/pipeline.mjs";
import { parseSeen } from "../lib/merge.mjs";

// ---- ইন-মেমরি Firestore (শুধু ব্যবহৃত API) ----
class TS {
  constructor(ms) { this.ms = ms; }
  static fromMillis(ms) { return new TS(ms); }
  toMillis() { return this.ms; }
}
function makeDb() {
  const store = new Map();
  const mkSnap = (col, id) => {
    const key = `${col}/${id}`;
    const ref = { col, id, key };
    return { ref, id, exists: store.has(key), data: () => store.get(key) };
  };
  const refOf = (col, id) => ({
    col, id, key: `${col}/${id}`,
    get: async () => mkSnap(col, id),
    set: async (d) => { store.set(`${col}/${id}`, d); },
  });
  const query = (col, pred, lim) => ({
    where: (field, op, val) => query(col, (d) => d[field].toMillis() < val.toMillis(), lim),
    limit: (n) => query(col, pred, n),
    get: async () => {
      const docs = [...store.keys()].filter((k) => k.startsWith(col + "/")).map((k) => mkSnap(col, k.slice(col.length + 1)))
        .filter((s) => !pred || pred(s.data())).slice(0, lim ?? Infinity);
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  });
  return {
    store,
    collection: (col) => ({ doc: (id) => refOf(col, id), ...query(col, null, null) }),
    getAll: async (...refs) => refs.map((r) => mkSnap(r.col, r.id)),
    bulkWriter: () => ({
      set: (ref, d) => { store.set(ref.key, d); return Promise.resolve(); },
      delete: (ref) => { store.delete(ref.key); return Promise.resolve(); },
      close: async () => {},
    }),
  };
}

const NOW = Date.parse("2026-10-25T12:00:00Z");
const H = 3600000;
const settings = (over = {}) => ({
  retention: { days: 7, mode: "rolling", ...(over.retention || {}) },
  ingest: { maxItemsPerFeedPerRun: 30, summaryMaxChars: 280, windowDays: 3, dailyWriteBudget: 15000, ...(over.ingest || {}) },
  snapshot: { perCategory: 80, all: 150, summaryChars: 160 },
  cluster: { threshold: 0.45, minShared: 2, maxHoursApart: 48 },
  firestore: { collection: "articles" },
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
const run = (db, sources, feeds, s = settings(), now = NOW) =>
  runIngest({ db, Timestamp: TS, fetchFeed: feedsFrom(feeds), sources, settings: s, now });
const articles = (db) => [...db.store.keys()].filter((k) => k.startsWith("articles/"));

test("toArticle: ঠিক ফিল্ড, নোডেট/নোলিংক বাদ, ভবিষ্যৎ তারিখ ক্ল্যাম্প", () => {
  const r = toArticle(item(1, 2), src("a"), NOW, 280);
  assert.ok(r.ok);
  assert.equal(r.article.link, "https://x.test/news/1");
  assert.equal(r.article.summary, "সারাংশ 1");
  assert.equal(toArticle({ title: "t", link: "https://a.b/c" }, src("a"), NOW, 280).reason, "nodate");
  assert.equal(toArticle({ title: "t", isoDate: new Date(NOW).toISOString() }, src("a"), NOW, 280).reason, "nolink");
  const fut = toArticle(item(2, -5), src("a"), NOW, 280);
  assert.equal(fut.article.publishedAt, NOW);
});

test("প্রথম রান: আর্টিকেল + স্ন্যাপশট + meta; দ্বিতীয় রানে ডুপ্লিকেট নয়", async () => {
  const db = makeDb();
  const feeds = { "https://a.test/rss": [item(1, 1), item(2, 2)], "https://b.test/rss": [item(3, 3, { title: "ক্রিকেট ম্যাচে বিপিএল জয়" })] };
  const s1 = await run(db, [src("a"), src("b")], feeds);
  assert.equal(s1.added, 3);
  assert.equal(articles(db).length, 3);
  assert.ok(db.store.has("feeds/all"));
  assert.ok(db.store.has("feeds/national"));
  assert.ok(db.store.has("feeds/sports")); // ক্লাসিফাই হয়েছে
  assert.equal(db.store.get("feeds/all").items.length, 3);
  assert.equal(db.store.get("feeds/all").items[0].id.length, 20);
  assert.equal(parseSeen(db.store.get("meta/ingest").seen).size, 3);

  const s2 = await run(db, [src("a"), src("b")], feeds, settings(), NOW + 30 * 60000);
  assert.equal(s2.added, 0);
  assert.equal(s2.dup, 3);
  assert.equal(articles(db).length, 3);
});

test("নতুন খবর এলে স্ন্যাপশটে মার্জ হয়, সর্ট ঠিক", async () => {
  const db = makeDb();
  const feeds = { "https://a.test/rss": [item(1, 5)] };
  await run(db, [src("a")], feeds);
  feeds["https://a.test/rss"] = [item(9, 1), item(1, 5)];
  const s = await run(db, [src("a")], feeds, settings(), NOW + 60000);
  assert.equal(s.added, 1);
  const ids = db.store.get("feeds/all").items.map((i) => i.title);
  assert.deepEqual(ids, ["খবর নম্বর 9", "খবর নম্বর 1"]);
});

test("৩ দিনের (windowDays) পুরনো ও তারিখহীন আইটেম বাদ", async () => {
  const db = makeDb();
  const feeds = { "https://a.test/rss": [item(1, 1), item(2, 24 * 4), { title: "no date", link: "https://x.test/nd" }] };
  const s = await run(db, [src("a")], feeds);
  assert.equal(s.added, 1);
  assert.equal(s.old, 1);
  assert.equal(s.noDate, 1);
});

test("বিকল্প URL: প্রথমটি ফেল হলে alts থেকে আসে; সব ফেল হলে feedsFailed", async () => {
  const db = makeDb();
  const feeds = { "https://a.test/rss": new Error("HTTP 404"), "https://a.test/alt": [item(1, 1)], "https://b.test/rss": new Error("timeout") };
  const s = await run(db, [src("a", "national", { alts: ["https://a.test/alt"] }), src("b")], feeds);
  assert.equal(s.feedsOk, 1);
  assert.equal(s.feedsFailed.length, 1);
  assert.match(s.feedsFailed[0], /^b: timeout/);
  assert.equal(s.added, 1);
});

test("দৈনিক রাইট বাজেট: সীমার বেশি হলে নতুনগুলো আগে, বাকি বাদ", async () => {
  const db = makeDb();
  const many = Array.from({ length: 10 }, (_, i) => item(i, i + 1));
  const s = await run(db, [src("a")], { "https://a.test/rss": many }, settings({ ingest: { dailyWriteBudget: 36 } }));
  assert.equal(s.added, 6); // 36 - 0 - 30
  assert.equal(s.budgetSkipped, 4);
  const titles = db.store.get("feeds/all").items.map((i) => i.title);
  assert.equal(titles[0], "খবর নম্বর 0"); // সবচেয়ে নতুন টিকে আছে
});

test("rolling রিটেনশন: ৭ দিনের পুরনো আর্টিকেল মুছে যায়", async () => {
  const db = makeDb();
  db.store.set("articles/old1", { publishedAt: TS.fromMillis(NOW - 8 * 24 * H) });
  db.store.set("articles/old2", { publishedAt: TS.fromMillis(NOW - 7.5 * 24 * H) });
  db.store.set("articles/keep", { publishedAt: TS.fromMillis(NOW - 6 * 24 * H) });
  const s = await run(db, [src("a")], { "https://a.test/rss": [item(1, 1)] });
  assert.equal(s.deleted, 2);
  assert.ok(db.store.has("articles/keep"));
  assert.ok(!db.store.has("articles/old1"));
});

test("weekly_wipe: প্রথম রানে স্বাভাবিক ইনজেস্ট; ৭ দিন পর সব মোছে; শুধু wipe-এর পরের খবর ঢোকে", async () => {
  const db = makeDb();
  const cfg = settings({ retention: { mode: "weekly_wipe" } });
  const start = NOW - 8 * 24 * H;
  const at = (n, t) => ({ title: `খবর ${n}`, link: `https://x.test/w/${n}`, isoDate: new Date(t).toISOString(), contentSnippet: "s" });

  // প্রথম রান: wipeAt সেট হয়, কিন্তু আইটেম ঢোকে
  const s0 = await run(db, [src("a")], { "https://a.test/rss": [at(1, start - H)] }, cfg, start);
  assert.equal(s0.added, 1);
  assert.equal(db.store.get("meta/ingest").wipeAt, start);

  // ৮ দিন পর: wipe হয়, পুরনো খবর ফেরত আসে না
  const feeds = { "https://a.test/rss": [at(1, start - H), at(2, NOW - 2 * H)] };
  const s1 = await run(db, [src("a")], feeds, cfg, NOW);
  assert.equal(s1.wiped, true);
  assert.equal(s1.deleted, 1);
  assert.equal(s1.added, 0);
  assert.equal(articles(db).length, 0);
  assert.equal(db.store.get("meta/ingest").floorAt, NOW);

  // পরের রান: wipe-এর পরে প্রকাশিত খবরই শুধু ঢোকে
  feeds["https://a.test/rss"].unshift(at(3, NOW + 30 * 60000));
  const s2 = await run(db, [src("a")], feeds, cfg, NOW + H);
  assert.equal(s2.wiped, false);
  assert.equal(s2.added, 1);
  assert.deepEqual(db.store.get("feeds/all").items.map((i) => i.title), ["খবর 3"]);
});

test("সব ফিড ফেল হলেও ক্র্যাশ করে না", async () => {
  const db = makeDb();
  const s = await run(db, [src("a")], { "https://a.test/rss": new Error("down") });
  assert.equal(s.feedsOk, 0);
  assert.equal(s.added, 0);
});

test("একই ঘটনার খবর ভিন্ন সোর্স থেকে এলে স্ন্যাপশটে একই clusterId পায়", async () => {
  const db = makeDb();
  const at = (title, link, h) => ({ title, link, isoDate: new Date(NOW - h * H).toISOString(), contentSnippet: "s" });
  const feeds = {
    "https://a.test/rss": [at("বিপিএলে সিলেটকে ৬ উইকেটে হারিয়ে ফাইনালে ঢাকা", "https://a.test/1", 3), at("ঢাকায় মেট্রোরেলের নতুন সূচি ঘোষণা", "https://a.test/2", 2)],
    "https://b.test/rss": [at("সিলেটকে হারিয়ে বিপিএলের ফাইনালে উঠল ঢাকা", "https://b.test/1", 2)],
    "https://c.test/rss": [at("ফাইনালে ঢাকা, বিপিএলে সিলেটকে হারাল ৬ উইকেটে", "https://c.test/1", 1)],
  };
  await run(db, [src("a"), src("b"), src("c")], feeds);
  const items = db.store.get("feeds/all").items;
  const grouped = items.filter((i) => i.clusterId);
  assert.equal(grouped.length, 3);
  assert.equal(new Set(grouped.map((i) => i.clusterId)).size, 1);
  assert.equal(new Set(grouped.map((i) => i.sourceId)).size, 3);
  const single = items.find((i) => i.title.includes("মেট্রোরেল"));
  assert.equal(single.clusterId, undefined);
  // ক্লাস্টারের id = সবচেয়ে পুরনো সদস্যের id
  const oldest = grouped.sort((x, y) => x.publishedAt - y.publishedAt)[0];
  assert.equal(grouped[0].clusterId, oldest.id);
});

// ---------- AI অনুবাদ ইন্টিগ্রেশন (Groq) ----------
const aiSettings = (over = {}) => ({
  ...settings(),
  ai: { enabled: true, batchSize: 10, maxRequestsPerRun: 4, dailyRequestBudget: 300, dailyTokenBudget: 170000, ...over },
});
const runAi = (db, sources, feeds, translator, s = aiSettings(), now = NOW) =>
  runIngest({ db, Timestamp: TS, fetchFeed: feedsFrom(feeds), sources, settings: s, translator, now });
const enSrc = (id) => src(id, "international", { lang: "en", scope: "intl" });
const enItem = (n, h) => ({ title: `English headline ${n}`, link: `https://e.test/${n}`, isoDate: new Date(NOW - h * H).toISOString(), contentSnippet: `Snippet ${n}` });
const bnTranslator = (calls, tokens = 800) => async (batch) => {
  calls.push(batch.map((a) => a.title));
  return { items: new Map(batch.map((a, i) => [i, { t: `বাংলা: ${a.title}`, s: "" }])), tokens };
};

test("AI: শুধু ইংরেজি আইটেম অনুবাদ হয়; articles ও স্ন্যাপশটে titleBn থাকে; টোকেন গোনা হয়", async () => {
  const db = makeDb();
  const calls = [];
  const feeds = { "https://a.test/rss": [item(1, 1)], "https://en.test/rss": [enItem(1, 2), enItem(2, 3)] };
  const s = await runAi(db, [src("a"), enSrc("en")], feeds, bnTranslator(calls));
  assert.equal(s.ai.requests, 1);
  assert.equal(s.ai.translated, 2);
  assert.equal(s.ai.tokens, 800);
  assert.ok(calls[0].every((t) => t.startsWith("English")));
  const docs = articles(db).map((k) => db.store.get(k));
  const enDocs = docs.filter((d) => d.lang === "en");
  assert.equal(enDocs.length, 2);
  assert.ok(enDocs.every((d) => d.titleBn.startsWith("বাংলা:") && d.summaryBn === undefined));
  assert.equal(docs.find((d) => d.lang === "bn").titleBn, undefined);
  assert.ok(db.store.get("feeds/all").items.filter((i) => i.lang === "en").every((i) => i.titleBn));
  const meta = db.store.get("meta/ingest");
  assert.equal(meta.aiCalls, 1);
  assert.equal(meta.aiTokens, 800);
});

test("AI: ট্রান্সলেটর না থাকলে/বন্ধ থাকলে কল হয় না, ইনজেস্ট স্বাভাবিক", async () => {
  const db = makeDb();
  const s = await runAi(db, [enSrc("en")], { "https://en.test/rss": [enItem(1, 1)] }, null);
  assert.equal(s.added, 1);
  assert.equal(s.ai.requests, 0);
  const calls = [];
  await runAi(makeDb(), [enSrc("en")], { "https://en.test/rss": [enItem(1, 1)] }, bnTranslator(calls), aiSettings({ enabled: false }));
  assert.equal(calls.length, 0);
});

test("AI: rate_limit এ retry-after অনুযায়ী বিরতি; খবর ইংরেজিতেই সেভ; বিরতির পর আবার চলে", async () => {
  const db = makeDb();
  let n = 0;
  const limited = async () => { n++; const e = new Error("HTTP 429"); e.kind = "rate_limit"; e.retryAfterMs = 2 * 3600000; throw e; };
  const feeds = { "https://en.test/rss": [enItem(1, 1)] };
  const s1 = await runAi(db, [enSrc("en")], feeds, limited);
  assert.equal(s1.added, 1);
  assert.equal(s1.ai.errors.length, 1);
  assert.equal(db.store.get(articles(db)[0]).titleBn, undefined);
  assert.equal(db.store.get("meta/ingest").aiPausedUntil, NOW + 2 * 3600000);

  feeds["https://en.test/rss"] = [enItem(2, 0.5), enItem(1, 1)];
  const s2 = await runAi(db, [enSrc("en")], feeds, limited, aiSettings(), NOW + 3600000);
  assert.equal(s2.ai.skipped, "paused");
  assert.equal(n, 1);

  const calls = [];
  feeds["https://en.test/rss"] = [enItem(3, 0.1), enItem(2, 0.5), enItem(1, 1)];
  const s3 = await runAi(db, [enSrc("en")], feeds, bnTranslator(calls), aiSettings(), NOW + 2 * 3600000 + 60000);
  assert.equal(s3.ai.translated, 1);
  assert.equal(db.store.get("meta/ingest").aiPausedUntil, 0);
});

test("AI: retry-after না থাকলে ১ ঘণ্টা বিরতি; config ত্রুটিতে ৬ ঘণ্টা", async () => {
  const mkErr = (kind) => async () => { const e = new Error(kind); e.kind = kind; throw e; };
  const db = makeDb();
  await runAi(db, [enSrc("en")], { "https://en.test/rss": [enItem(1, 1)] }, mkErr("rate_limit"));
  assert.equal(db.store.get("meta/ingest").aiPausedUntil, NOW + 3600000);
  const db2 = makeDb();
  await runAi(db2, [enSrc("en")], { "https://en.test/rss": [enItem(1, 1)] }, mkErr("config"));
  assert.equal(db2.store.get("meta/ingest").aiPausedUntil, NOW + 6 * 3600000);
});

test("AI: দৈনিক টোকেন বাজেট শেষ হলে স্কিপ; পরের দিন আবার শুরু", async () => {
  const db = makeDb();
  const calls = [];
  const feeds = { "https://en.test/rss": [enItem(1, 1), enItem(2, 2)] };
  const cfg = aiSettings({ dailyTokenBudget: 1000, batchSize: 1, maxRequestsPerRun: 5 });
  const s = await runAi(db, [enSrc("en")], feeds, bnTranslator(calls, 800), cfg);
  assert.equal(s.ai.requests, 2); // ৮০০ < ১০০০, তারপর ১৬০০ ≥ ১০০০
  assert.equal(db.store.get("meta/ingest").aiTokens, 1600);

  feeds["https://en.test/rss"].unshift(enItem(3, 0.2));
  const s2 = await runAi(db, [enSrc("en")], feeds, bnTranslator(calls, 800), cfg, NOW + 60000);
  assert.equal(s2.ai.skipped, "daily_budget");

  feeds["https://en.test/rss"].unshift(enItem(4, 0.1));
  const s3 = await runAi(db, [enSrc("en")], feeds, bnTranslator(calls, 800), cfg, NOW + 24 * 3600000);
  assert.ok(s3.ai.requests > 0);
});
