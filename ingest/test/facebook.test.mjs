import test from "node:test";
import assert from "node:assert/strict";
import { formatDigestCaption, formatNewsCaption, createFacebookClient, runFacebook, FbError } from "../lib/facebook.mjs";
import { escMarkup, textInput } from "../lib/card.mjs";

const H = 3600000;
const NOW = Date.parse("2026-11-04T06:10:00Z"); // স্লট: ০৬:০০ UTC
const SITE = "https://aunews.vercel.app";

const digest = (id, ageH = 1, extra = {}) => ({
  id, clusterId: `c-${id}`, headline: `শিরোনাম ${id}`, lead: "ভূমিকা এখানে।",
  points: [{ t: "প্রথম তথ্য", s: [1] }, { t: "দ্বিতীয় তথ্য", s: [1] }, { t: "তৃতীয় তথ্য", s: [2] }, { t: "চতুর্থ", s: [2] }],
  conflict: "", sourceCount: 3, image: "https://img.test/a.jpg", createdAt: NOW - ageH * H, ...extra,
});
const news = (id, clusterId, sourceId, extra = {}) => ({
  id, clusterId, sourceId, sourceName: `সোর্স ${sourceId}`, lang: "bn", title: `খবর ${id}`, summary: "সারসংক্ষেপ",
  link: `https://n.test/${id}`, image: "https://img.test/n.jpg", publishedAt: NOW - 1 * H, ...extra,
});

function mkStore({ digests = [], items = [], fb = {} } = {}) {
  const s = { fb };
  return {
    s,
    loadDigests: async () => ({ items: digests }),
    loadSnapshots: async () => new Map([["all", items]]),
    loadFacebook: async () => structuredClone(s.fb),
    saveFacebook: async (d) => { s.fb = structuredClone(d); },
  };
}
const fakeClient = (fail = []) => {
  const posts = [];
  return { posts, postPhoto: async (p) => { if (fail.length) throw fail.shift(); posts.push(p); return `pg_${posts.length}`; } };
};
const render = async ({ headline }) => Buffer.from(`img:${headline}`);
const run = (o) => runFacebook({ settings: {}, siteUrl: SITE, now: NOW, render, ...o });

test("formatDigestCaption: ভূমিকা, সর্বোচ্চ ৩ পয়েন্ট, সোর্স সংখ্যা, লিংক, হ্যাশট্যাগ; শিরোনাম পুনরাবৃত্তি নয়", () => {
  const c = formatDigestCaption(digest("abc", 1, { conflict: "সংখ্যায় অমিল" }), SITE);
  assert.ok(c.startsWith("ভূমিকা এখানে।"));
  assert.ok(c.includes("• তৃতীয় তথ্য") && !c.includes("চতুর্থ"));
  assert.ok(c.includes("⚠️ সূত্রে অমিল: সংখ্যায় অমিল"));
  assert.ok(c.includes("৩টি সোর্স") && c.includes(`${SITE}/p/abc`) && c.endsWith("#AuNews"));
  assert.ok(!c.includes("শিরোনাম abc"));
  assert.ok(formatDigestCaption(digest("x", 1, { lead: "ক".repeat(5000) }), SITE).length < 2500);
});

test("formatNewsCaption: সূত্র ও মূল লিংক থাকে; সারাংশ না থাকলেও চলে", () => {
  const c = formatNewsCaption({ summary: "", sourceName: "প্রথম আলো", link: "https://a.test/1" }, SITE);
  assert.ok(c.includes("সূত্র: প্রথম আলো") && c.includes("https://a.test/1") && c.includes(SITE));
  assert.ok(!c.startsWith("\n"));
});

test("runFacebook: সবচেয়ে নতুন ব্রিফ আগে, রানে একটিই; একই স্লটে আবার নয়; পরের স্লটে পরেরটি", async () => {
  const store = mkStore({ digests: [digest("old", 5), digest("new", 1), digest("mid", 3)] });
  const c = fakeClient();
  const s1 = await run({ store, client: c });
  assert.equal(s1.sent, 1);
  assert.equal(c.posts.length, 1);
  assert.equal(c.posts[0].image.toString(), "img:শিরোনাম new");
  assert.equal(c.posts[0].altText, "শিরোনাম new");
  const s2 = await run({ store, client: c, now: NOW + 30 * 60000 }); // একই ঘণ্টা (০৬:৪০)
  assert.equal(s2.skipped, "not_due");
  const s3 = await run({ store, client: c, now: NOW + 60 * 60000 }); // ০৭:১০
  assert.equal(s3.sent, 1);
  assert.equal(c.posts[1].image.toString(), "img:শিরোনাম mid");
});

test("runFacebook: দেরি হলেও সময় সরে না — প্রতি ঘণ্টায় একটি", async () => {
  const store = mkStore({ digests: [digest("a", 1), digest("b", 2), digest("c", 3)] });
  const c = fakeClient();
  await run({ store, client: c, now: Date.parse("2026-11-04T06:09:00Z") });
  await run({ store, client: c, now: Date.parse("2026-11-04T06:39:00Z") }); // একই স্লট
  await run({ store, client: c, now: Date.parse("2026-11-04T07:01:00Z") });
  await run({ store, client: c, now: Date.parse("2026-11-04T07:31:00Z") }); // একই স্লট
  await run({ store, client: c, now: Date.parse("2026-11-04T08:00:00Z") });
  assert.equal(c.posts.length, 3);
});

test("runFacebook: পুরনো ব্রিফ বাদ; ফলব্যাক বন্ধ থাকলে no_candidate", async () => {
  const store = mkStore({ digests: [digest("old", 13)], items: [news("n1", "k1", "s1"), news("n2", "k1", "s2")] });
  const c = fakeClient();
  const s = await run({ store, client: c, settings: { facebook: { fallbackToNews: false } } });
  assert.equal(s.sent, 0);
  assert.equal(s.skipped, "no_candidate");
});

test("runFacebook: নতুন ব্রিফ না থাকলে বহু-সোর্সের সাধারণ খবর; ব্রিফে যাওয়া ঘটনা আবার নয়", async () => {
  const items = [
    news("n1", "k1", "s1"), news("n2", "k1", "s2"), news("n3", "k1", "s3"),
    news("m1", "k2", "s1"), news("m2", "k2", "s2"),
    news("solo", "k3", "s1"), // একটি সোর্স: বাদ
    news("noimg", "k4", "s1", { image: null }), news("noimg2", "k4", "s2", { image: null }), // ছবি নেই: বাদ
    news("covered1", "c-d1", "s1"), news("covered2", "c-d1", "s2"),
  ];
  const store = mkStore({ digests: [digest("d1", 2)], items });
  const c = fakeClient();
  await run({ store, client: c });
  assert.equal(c.posts[0].image.toString(), "img:শিরোনাম d1"); // ব্রিফ আগে
  await run({ store, client: c, now: NOW + H });
  assert.ok(c.posts[1].caption.includes("https://n.test/")); // সাধারণ খবর; বেশি সোর্সের k1
  assert.ok(c.posts[1].caption.includes("সূত্র: সোর্স"));
  await run({ store, client: c, now: NOW + 2 * H });
  await run({ store, client: c, now: NOW + 3 * H });
  const heads = c.posts.map((p) => p.image.toString());
  assert.equal(heads.length, 3); // d1, k1, k2 — covered/solo/noimg নয়
  assert.ok(!heads.some((h) => /covered|solo|noimg/.test(h)));
});

test("runFacebook: ইংরেজি খবরে বাংলা অনুবাদ না থাকলে বাদ, থাকলে অনুবাদ ব্যবহার", async () => {
  const items = [
    news("e1", "k1", "s1", { lang: "en", title: "English only" }), news("e2", "k1", "s2", { lang: "en", title: "English only 2" }),
    news("t1", "k2", "s1", { lang: "en", title: "Eng", titleBn: "অনূদিত শিরোনাম" }), news("t2", "k2", "s2", { lang: "en", title: "Eng2" }),
  ];
  const store = mkStore({ items });
  const c = fakeClient();
  await run({ store, client: c });
  assert.equal(c.posts[0].image.toString(), "img:অনূদিত শিরোনাম");
});

test("runFacebook: ড্রাই-রান কিছু পাঠায় না, সেভ করে না, স্লট-সীমা মানে না", async () => {
  const store = mkStore({ digests: [digest("a", 1)], fb: { lastSlot: Math.floor(NOW / 3600000) } });
  const c = fakeClient();
  const s = await run({ store, client: c, dryRun: true });
  assert.equal(c.posts.length, 0);
  assert.equal(s.preview.length, 1);
  assert.equal(s.preview[0].headline, "শিরোনাম a");
  assert.ok(Buffer.isBuffer(s.preview[0].image) && s.preview[0].caption.includes("ভূমিকা"));
  assert.equal(store.s.fb.posted, undefined);
});

test("runFacebook: rate_limit ও config ত্রুটিতে বিরতি; transient এ বিরতি নেই কিন্তু একই স্লটে আবার চেষ্টা", async () => {
  const mk = () => mkStore({ digests: [digest("a", 1), digest("b", 2)] });

  let store = mk();
  let c = fakeClient([new FbError("rate_limit", "#4 limit", 30 * 60000)]);
  let s = await run({ store, client: c });
  assert.equal(s.sent, 0);
  assert.ok(store.s.fb.pausedUntil > NOW);
  assert.equal((await run({ store, client: c, now: NOW + 60000 })).skipped, "paused");

  store = mk();
  c = fakeClient([new FbError("config", "#190 token")]);
  s = await run({ store, client: c });
  assert.ok(store.s.fb.pausedUntil >= NOW + 6 * H);
  assert.match(s.errors[0], /config/);

  store = mk();
  c = fakeClient([new FbError("transient", "network")]);
  s = await run({ store, client: c });
  assert.equal(s.sent, 0);
  assert.equal(store.s.fb.pausedUntil, 0);
  assert.equal(store.s.fb.lastSlot ?? null, null); // স্লট খরচ হয়নি
  const s2 = await run({ store, client: c, now: NOW + 30 * 60000 });
  assert.equal(s2.sent, 1);
});

test("runFacebook: bad_request হলে পরের খবরে যায়; বারবার ব্যর্থ খবর ছেড়ে দেয়", async () => {
  const store = mkStore({ digests: [digest("bad", 1), digest("good", 2)] });
  const c = fakeClient([new FbError("bad_request", "#100 bad image")]);
  const s = await run({ store, client: c });
  assert.equal(s.sent, 1);
  assert.equal(c.posts[0].image.toString(), "img:শিরোনাম good");
  assert.equal(store.s.fb.tries["d:" + "bad"], 1);

  const st2 = mkStore({ digests: [digest("bad", 1)], fb: { tries: { "d:bad": 3 } } });
  const s3 = await run({ store: st2, client: fakeClient() });
  assert.equal(s3.skipped, "no_candidate");
});

test("runFacebook: কার্ড তৈরি ব্যর্থ হলে পোস্ট হয় না, ত্রুটি রিপোর্ট হয়", async () => {
  const store = mkStore({ digests: [digest("a", 1)] });
  const c = fakeClient();
  const s = await run({ store, client: c, render: async () => { throw new Error("sharp missing"); } });
  assert.equal(c.posts.length, 0);
  assert.match(s.errors[0], /render: কার্ড তৈরি ব্যর্থ: sharp missing/);
});

test("runFacebook: দিনের সীমা ও disabled", async () => {
  const day = new Date(NOW).toISOString().slice(0, 10);
  const store = mkStore({ digests: [digest("a", 1)], fb: { usage: { day, count: 30 } } });
  assert.equal((await run({ store, client: fakeClient() })).skipped, "daily_limit");
  assert.equal((await run({ store, client: fakeClient(), settings: { facebook: { enabled: false } } })).skipped, "disabled");
});

test("createFacebookClient: multipart ফিল্ড, টোকেন URL এ নয়, সফলে post_id", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return { ok: true, status: 200, json: async () => ({ id: "111", post_id: "999_111" }) };
  };
  const cl = createFacebookClient({ pageId: "999", token: "SECRET", fetchImpl });
  const id = await cl.postPhoto({ image: Buffer.from("x"), caption: "ক্যাপশন", altText: "অল্ট" });
  assert.equal(id, "999_111");
  assert.equal(seen.url, "https://graph.facebook.com/v25.0/999/photos");
  assert.ok(!seen.url.includes("SECRET"));
  assert.equal(seen.init.body.get("caption"), "ক্যাপশন");
  assert.equal(seen.init.body.get("published"), "true");
  assert.equal(seen.init.body.get("access_token"), "SECRET");
  assert.equal(seen.init.body.get("alt_text_custom"), "অল্ট");
  assert.ok(seen.init.body.get("source") instanceof Blob);
});

test("createFacebookClient: ত্রুটির শ্রেণিবিন্যাস ও বার্তায় টোকেন নেই", async () => {
  const kindOf = async (status, error) => {
    const cl = createFacebookClient({ pageId: "1", token: "SECRET", fetchImpl: async () => ({ ok: false, status, json: async () => ({ error }) }) });
    try { await cl.postPhoto({ image: Buffer.from("x"), caption: "c" }); } catch (e) { return e; }
  };
  assert.equal((await kindOf(400, { code: 190, message: "Error validating access token" })).kind, "config");
  assert.equal((await kindOf(403, { code: 200, message: "Permissions error" })).kind, "config");
  assert.equal((await kindOf(400, { code: 368, message: "blocked" })).kind, "config");
  assert.equal((await kindOf(400, { code: 100, message: "Unsupported post request. Object with ID '1' does not exist" })).kind, "config");
  assert.equal((await kindOf(400, { code: 4, message: "Application request limit reached" })).kind, "rate_limit");
  assert.equal((await kindOf(400, { code: 613, message: "calls too fast" })).kind, "rate_limit");
  assert.equal((await kindOf(500, { code: 2, message: "Service temporarily unavailable" })).kind, "transient");
  assert.equal((await kindOf(400, { code: 100, message: "Invalid parameter" })).kind, "bad_request");
  const e = await kindOf(400, { code: 190, message: "bad SECRET?" });
  assert.ok(!String(e.message).includes("access_token="));
  const net = createFacebookClient({ pageId: "1", token: "SECRET", fetchImpl: async () => { throw new TypeError("fetch failed https://x?access_token=SECRET"); } });
  await assert.rejects(() => net.postPhoto({ image: Buffer.from("x"), caption: "c" }), (er) => er.kind === "transient" && !er.message.includes("SECRET"));
});

test("card: escMarkup pango মার্কআপের বিশেষ ক্যারেক্টার escape করে", () => {
  assert.equal(escMarkup(`A & B <i> "q" 'w'`), "A &amp; B &lt;i&gt; &quot;q&quot; &#39;w&#39;");
});

test("card: sharp এর text.width কখনো ০ যায় না (০ দিলে sharp ত্রুটি দেয়); ধনাত্মক হলে যায়", () => {
  const free = textInput("AuNews", { size: 40, width: 0 }).text;
  assert.equal("width" in free, false);
  assert.equal("height" in free, false); // height ও dpi একসাথে দিলে sharp ত্রুটি দেয়
  assert.equal(textInput("ক", { size: 40 }).text.width, undefined);
  assert.equal(textInput("ক", { size: 40, width: 920 }).text.width, 920);
  const t = textInput("A & <B>", { size: 50, width: 900 }).text;
  assert.ok(t.text.includes("A &amp; &lt;B&gt;") && t.text.includes('size="51200"') && t.rgba === true && t.dpi === 72);
});
