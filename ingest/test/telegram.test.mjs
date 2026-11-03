import test from "node:test";
import assert from "node:assert/strict";
import { formatDigest, formatDaily, createTelegramClient, runTelegram, TgError } from "../lib/telegram.mjs";

const H = 3600000;
const NOW = Date.parse("2026-11-03T02:00:00Z"); // ঢাকায় ০৮:০০
const SITE = "https://aunews.vercel.app";

const digest = (id, ageH = 1, extra = {}) => ({
  id, clusterId: `c-${id}`, headline: `শিরোনাম ${id} & <টেস্ট>`, lead: "ভূমিকা এখানে।",
  points: [{ t: "প্রথম তথ্য", s: [1] }, { t: "দ্বিতীয় তথ্য", s: [1] }, { t: "তৃতীয় তথ্য", s: [2] }, { t: "চতুর্থ", s: [2] }],
  conflict: "", sourceCount: 3, createdAt: NOW - ageH * H, ...extra,
});
const edition = (digestIds = []) => ({
  date: "2026-11-03", label: "৩ নভেম্বর ২০২৬",
  stories: [
    { rank: 1, headline: "বড় খবর এক", sourceCount: 5, digestId: digestIds[0] ?? null, link: digestIds[0] ? null : "https://a.test/1?x=1&y=2", sourceName: "প্রথম আলো" },
    { rank: 2, headline: "বড় খবর দুই", sourceCount: 3, digestId: null, link: "https://b.test/2", sourceName: "ইত্তেফাক" },
  ],
});

function mkStore({ digests = [], editions = [], tg = {} } = {}) {
  const s = { tg };
  return {
    s,
    loadDigests: async () => ({ items: digests }),
    loadDaily: async () => ({ items: editions }),
    loadTelegram: async () => structuredClone(s.tg),
    saveTelegram: async (d) => { s.tg = structuredClone(d); },
  };
}
const fakeClient = () => {
  const sent = [];
  return { sent, send: async (html) => { sent.push(html); return sent.length; } };
};
const noSleep = async () => {};
const run = (o) => runTelegram({ settings: {}, siteUrl: SITE, now: NOW, sleep: noSleep, ...o });

test("formatDigest: HTML escape, লিংক, সর্বোচ্চ ৩ পয়েন্ট, সীমার মধ্যে", () => {
  const m = formatDigest(digest("abc"), SITE);
  assert.ok(m.includes("শিরোনাম abc &amp; &lt;টেস্ট&gt;"));
  assert.ok(m.includes(`<a href="${SITE}/p/abc">`));
  assert.ok(m.includes("• তৃতীয় তথ্য") && !m.includes("চতুর্থ"));
  assert.ok(m.includes("৩টি সোর্স"));
  const long = formatDigest(digest("x", 1, { lead: "ক".repeat(5000), conflict: "খ".repeat(2000) }), SITE);
  assert.ok(long.length <= 4096);
  assert.ok(formatDigest(digest("y", 1, { conflict: "সংখ্যায় অমিল" }), SITE).includes("সূত্রে অমিল"));
});

test("formatDaily: ক্রম, ব্রিফের লিংক বনাম মূল লিংক (& escape), তারিখের পাতার লিংক", () => {
  const m = formatDaily(edition(["d1"]), SITE);
  assert.ok(m.includes("আজকের ২টি বড় খবর"));
  assert.ok(m.includes(`<a href="${SITE}/p/d1">বড় খবর এক</a> 🤖`));
  assert.ok(m.includes('<a href="https://b.test/2">বড় খবর দুই</a>'));
  assert.ok(m.includes(`${SITE}/daily/2026-11-03`));
  const m2 = formatDaily(edition([]), SITE);
  assert.ok(m2.includes("https://a.test/1?x=1&amp;y=2"));
});

test("runTelegram: প্রথমে রাউন্ডআপ, তার ব্রিফ আলাদা পোস্ট নয়, বাকি নতুন ব্রিফ পোস্ট; ২য় রানে ডুপ্লিকেট নয়", async () => {
  const store = mkStore({ digests: [digest("d1"), digest("d2", 2), digest("old", 10)], editions: [edition(["d1"])] });
  const c = fakeClient();
  const s1 = await run({ store, client: c });
  assert.equal(s1.sent, 2);
  assert.equal(s1.daily, 1);
  assert.ok(c.sent[0].includes("আজকের ২টি বড় খবর"));
  assert.ok(c.sent[1].includes("শিরোনাম d2"));
  assert.ok(!c.sent.some((m) => m.includes("শিরোনাম old"))); // ৬ ঘণ্টার পুরনো
  const s2 = await run({ store, client: c, now: NOW + H });
  assert.equal(s2.sent, 0);
  assert.equal(c.sent.length, 2);
});

test("runTelegram: রান প্রতি সর্বোচ্চ ব্রিফ; পুরনোটা আগে", async () => {
  const store = mkStore({ digests: [digest("n1", 1), digest("n2", 2), digest("n3", 3), digest("n4", 4), digest("n5", 5)] });
  const c = fakeClient();
  const s = await run({ store, client: c });
  assert.equal(s.sent, 3);
  assert.ok(c.sent[0].includes("n5") && c.sent[2].includes("n3"));
  const s2 = await run({ store, client: c, now: NOW + 1000 });
  assert.equal(s2.sent, 2);
});

test("runTelegram: rate_limit এ থামে ও বিরতি; config ত্রুটিতে ৬ ঘণ্টা বিরতি; বিরতিতে কিছু পাঠায় না", async () => {
  const store = mkStore({ digests: [digest("d1")] });
  const c1 = { send: async () => { throw new TgError("rate_limit", "Too Many Requests", 40000); } };
  const s = await run({ store, client: c1 });
  assert.equal(s.sent, 0);
  assert.equal(store.s.tg.pausedUntil, NOW + 40000);
  assert.equal((await run({ store, client: fakeClient(), now: NOW + 1000 })).skipped, "paused");

  const store2 = mkStore({ digests: [digest("d1")] });
  await run({ store: store2, client: { send: async () => { throw new TgError("config", "chat not found"); } } });
  assert.equal(store2.s.tg.pausedUntil, NOW + 6 * H);
});

test("runTelegram: bad_request এ tries বাড়ে, maxTries পর আর চেষ্টা নয়; ব্যর্থ পোস্ট posted হয় না", async () => {
  const store = mkStore({ digests: [digest("bad")] });
  const c = { n: 0, send: async function () { this.n++; throw new TgError("bad_request", "can't parse entities"); } };
  for (let i = 0; i < 5; i++) await run({ store, client: c, now: NOW + i * 1000 });
  assert.equal(c.n, 3);
  assert.equal(store.s.tg.posted.bad, undefined);
});

test("runTelegram: dryRun কিছু পাঠায় না, অবস্থা সেভ করে না, প্রিভিউ দেয়", async () => {
  const store = mkStore({ digests: [digest("d1")], editions: [edition()] });
  const c = fakeClient();
  const s = await run({ store, client: c, dryRun: true });
  assert.equal(c.sent.length, 0);
  assert.equal(s.preview.length, 2);
  assert.deepEqual(store.s.tg, {});
});

test("runTelegram: দৈনিক সীমা ও বন্ধ থাকা", async () => {
  const store = mkStore({ digests: [digest("d1")], tg: { usage: { day: "2026-11-03", count: 25 } } });
  const s = await run({ store, client: fakeClient() });
  assert.equal(s.skipped, "daily_limit");
  assert.equal((await run({ store, client: fakeClient(), settings: { telegram: { enabled: false } } })).skipped, "disabled");
});

const okJson = (r) => ({ ok: true, status: 200, json: async () => r });
const errJson = (status, body) => ({ ok: false, status, json: async () => body });

test("createTelegramClient: অনুরোধের গঠন; ত্রুটি-শ্রেণি; টোকেন ত্রুটিতে ফাঁস হয় না", async () => {
  let req;
  const c = createTelegramClient({ token: "SECRET:TOKEN", chatId: "@ch", fetchImpl: async (u, o) => { req = { u, b: JSON.parse(o.body) }; return okJson({ ok: true, result: { message_id: 7 } }); } });
  assert.equal(await c.send("<b>hi</b>"), 7);
  assert.equal(req.u, "https://api.telegram.org/botSECRET:TOKEN/sendMessage");
  assert.deepEqual(req.b, { chat_id: "@ch", text: "<b>hi</b>", parse_mode: "HTML", link_preview_options: { is_disabled: true } });

  const mk = (res) => createTelegramClient({ token: "SECRET:TOKEN", chatId: "@ch", fetchImpl: async () => res });
  await assert.rejects(() => mk(errJson(429, { description: "Too Many Requests", parameters: { retry_after: 12 } })).send("x"), (e) => e.kind === "rate_limit" && e.retryAfterMs === 12000);
  await assert.rejects(() => mk(errJson(401, { description: "Unauthorized" })).send("x"), (e) => e.kind === "config");
  await assert.rejects(() => mk(errJson(400, { description: "Bad Request: chat not found" })).send("x"), (e) => e.kind === "config");
  await assert.rejects(() => mk(errJson(400, { description: "Bad Request: can't parse entities" })).send("x"), (e) => e.kind === "bad_request");
  await assert.rejects(() => mk(errJson(502, {})).send("x"), (e) => e.kind === "transient");
  const boom = createTelegramClient({ token: "SECRET:TOKEN", chatId: "@ch", fetchImpl: async () => { throw new TypeError("fetch failed https://api.telegram.org/botSECRET:TOKEN/sendMessage"); } });
  await assert.rejects(() => boom.send("x"), (e) => e.kind === "transient" && !e.message.includes("SECRET"));
});
