import test from "node:test";
import assert from "node:assert/strict";
import {
  bigNumbers, copiedFrom, pickCandidates, validateDigest, runDigest, createGroqDigester, DIGEST_DEFAULTS,
} from "../lib/digest.mjs";
import { AiError } from "../lib/translate.mjs";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const H = 3600000;
const cfg = { ...DIGEST_DEFAULTS };

const TEXT_A =
  "মিরপুরের একটি বহুতল ভবনে সোমবার সকালে আগুন লেগে ১২ জন আহত হয়েছেন। ফায়ার সার্ভিসের ৫টি ইউনিট প্রায় ৪৫ মিনিট চেষ্টা করে আগুন নিয়ন্ত্রণে আনে। " +
  "প্রাথমিকভাবে বৈদ্যুতিক শর্ট সার্কিটকে আগুনের সম্ভাব্য কারণ বলে মনে করছেন কর্মকর্তারা, তবে তদন্ত শেষ হয়নি। আহতদের কাছের হাসপাতালে ভর্তি করা হয়েছে।";
const TEXT_B =
  "রাজধানীর মিরপুরে ভবনে অগ্নিকাণ্ডে অন্তত ১২ জন আহত হয়েছেন বলে জানিয়েছে ফায়ার সার্ভিস। সকাল ৯টার দিকে আগুনের সূত্রপাত হয় বলে স্থানীয়রা জানান। " +
  "আগুন নেভাতে ৫টি ইউনিট কাজ করেছে। ভবনটিতে বেশ কয়েকটি দোকান ও অফিস ছিল, ক্ষয়ক্ষতির পরিমাণ এখনো নিরূপণ করা যায়নি।";
const TEXT_C =
  "মিরপুরে বহুতল ভবনের আগুনে আহতের সংখ্যা ১২ জন, জানিয়েছেন ফায়ার সার্ভিসের কর্মকর্তারা। দমকল বাহিনীর ৫টি ইউনিট ঘটনাস্থলে গিয়ে কাজ করে। " +
  "কর্তৃপক্ষ বলছে, আগুনের উৎস খুঁজে বের করতে একটি তদন্ত কমিটি গঠন করা হবে এবং ভবনের নিরাপত্তা ব্যবস্থাও খতিয়ে দেখা হবে।";
const TEXTS = { "https://a.test/1": TEXT_A, "https://b.test/1": TEXT_B, "https://c.test/1": TEXT_C };

const mk = (id, sourceId, hoursAgo, extra = {}) => ({
  id, title: `মিরপুরে ভবনে আগুন ${id}`, summary: "", link: `https://${sourceId}.test/1`, sourceId, sourceName: sourceId.toUpperCase(),
  lang: "bn", scope: "bd", category: "national", image: null, publishedAt: NOW - hoursAgo * H, clusterId: "c1", ...extra,
});
const members = () => [mk("m1", "a", 1), mk("m2", "b", 2), mk("m3", "c", 3, { image: "https://img.test/x.jpg" })];

const fetchText = async (url) => TEXTS[url] ?? "";

const GOOD = {
  skip: false,
  headline: "মিরপুরের বহুতল ভবনে আগুন, আহত ১২",
  lead: "রাজধানীর মিরপুরে একটি বহুতল ভবনে লাগা আগুনে বারো নয়, ১২ জনের আহত হওয়ার খবর দিয়েছে একাধিক সূত্র।",
  points: [
    { t: "আগুন নেভাতে ফায়ার সার্ভিসের পাঁচটি ইউনিট কাজ করে; ৫টি ইউনিটের কথা তিনটি সূত্রেই আছে।", s: [1, 2, 3] },
    { t: "প্রাথমিক ধারণা, বিদ্যুতের শর্ট সার্কিট থেকে আগুন লেগে থাকতে পারে; তদন্ত চলছে।", s: [1] },
    { t: "ক্ষতির পরিমাণ এখনো জানা যায়নি; ভবনে দোকান ও অফিস ছিল।", s: [2] },
  ],
  background: "",
  conflict: "",
};

function makeStore(snapItems = members()) {
  const s = { digests: {}, snap: snapItems };
  return {
    s,
    loadSnapshots: async () => new Map([["all", structuredClone(s.snap)]]),
    loadDigests: async () => structuredClone(s.digests),
    saveDigests: async (d) => { s.digests = structuredClone(d); },
  };
}
const settings = (over = {}) => ({ retention: { days: 7 }, digest: { ...over } });

test("bigNumbers: বাংলা অঙ্ক ইংরেজিতে, কমা বাদ, এক অঙ্ক বাদ", () => {
  assert.deepEqual([...bigNumbers("১২ জন, ৫টি, ১,২০০ টাকা এবং 2026 সাল")].sort(), ["12", "1200", "2026"].sort());
});

test("copiedFrom: হুবহু টুকরো ধরে, নিজের ভাষা ধরে না", () => {
  const blob = TEXT_A;
  assert.equal(copiedFrom(TEXT_A.slice(10, 90), blob), true);
  assert.equal(copiedFrom("আগুনের খবরে বহু মানুষ আতঙ্কিত হয়ে পড়ে, তবে প্রশাসন পরিস্থিতি নিয়ন্ত্রণে বলে জানিয়েছে।", blob), false);
});

test("pickCandidates: সোর্স কম/পুরনো/আগে-করা/কুলডাউনে থাকা বাদ; বেশি সোর্স আগে", () => {
  const base = { items: members(), digests: [], tried: {}, cfg, now: NOW };
  assert.equal(pickCandidates(base).length, 1);
  assert.equal(pickCandidates({ ...base, items: members().slice(0, 2) }).length, 0); // ২ সোর্স < ৩
  assert.equal(pickCandidates({ ...base, items: members().map((m) => ({ ...m, publishedAt: NOW - 40 * H })) }).length, 0);
  assert.equal(pickCandidates({ ...base, digests: [{ clusterId: "zzz", memberIds: ["m2"] }] }).length, 0); // সদস্য ইতিমধ্যে কভার্ড
  assert.equal(pickCandidates({ ...base, tried: { c1: NOW - 1 * H } }).length, 0);
  assert.equal(pickCandidates({ ...base, tried: { c1: NOW - 4 * H } }).length, 1); // ৩ ঘণ্টা পর আবার
  const two = [...members(), ...[1, 2, 3, 4].map((i) => mk(`n${i}`, `s${i}`, 1, { clusterId: "c2" }))];
  assert.equal(pickCandidates({ ...base, items: two })[0].clusterId, "c2");
});

const sources = () =>
  members().map((m, i) => ({ n: i + 1, item: m, text: [TEXT_A, TEXT_B, TEXT_C][i] }));

test("validateDigest: ভালো ব্রিফ গ্রহণ", () => {
  const v = validateDigest(GOOD, sources());
  assert.ok(v.ok, v.reason);
  assert.equal(v.digest.points.length, 3);
});

test("validateDigest: সোর্সে নেই এমন সংখ্যা শিরোনামে থাকলে বাতিল; পয়েন্টে থাকলে শুধু সেই পয়েন্ট বাদ", () => {
  assert.equal(validateDigest({ ...GOOD, headline: "মিরপুরে আগুনে ৩৭ জন আহত" }, sources()).reason, "bad_headline");
  const bad = { ...GOOD, points: [...GOOD.points, { t: "ক্ষতির পরিমাণ প্রায় ৯৯ লাখ টাকা ধরা হচ্ছে।", s: [1] }] };
  const v = validateDigest(bad, sources());
  assert.ok(v.ok);
  assert.equal(v.digest.points.length, 3);
});

test("validateDigest: অচেনা সোর্স নম্বর/সোর্সহীন পয়েন্ট বাদ; বাকি ২টির কম হলে বাতিল", () => {
  const raw = { ...GOOD, points: [{ t: GOOD.points[0].t, s: [9] }, { t: GOOD.points[1].t, s: [] }, GOOD.points[2]] };
  assert.equal(validateDigest(raw, sources()).reason, "few_points");
});

test("validateDigest: হুবহু অনুলিপি, ইংরেজি-শুধু, skip=true সব বাতিল", () => {
  const copy = { ...GOOD, lead: TEXT_B.slice(0, 120) };
  assert.equal(validateDigest(copy, sources()).reason, "bad_lead");
  assert.equal(validateDigest({ ...GOOD, headline: "Fire in Mirpur building" }, sources()).reason, "bad_headline");
  assert.equal(validateDigest({ skip: true }, sources()).reason, "model_skip");
  assert.equal(validateDigest(null, sources()).reason, "not_object");
});

test("runDigest: ব্রিফ বানায়, সেভ করে; দ্বিতীয় রানে একই ঘটনার ডুপ্লিকেট করে না", async () => {
  const store = makeStore();
  let calls = 0;
  const writer = async () => { calls++; return { data: GOOD, tokens: 4000 }; };
  const s1 = await runDigest({ store, settings: settings(), writer, fetchText, now: NOW, model: "test-model" });
  assert.equal(s1.created, 1);
  assert.equal(calls, 1);
  const d = store.s.digests.items[0];
  assert.equal(d.clusterId, "c1");
  assert.deepEqual(d.memberIds.sort(), ["m1", "m2", "m3"]);
  assert.equal(d.image, "https://img.test/x.jpg");
  assert.equal(d.sources.length, 3);
  assert.equal(d.model, "test-model");
  assert.equal(store.s.digests.usage.count, 1);

  const s2 = await runDigest({ store, settings: settings(), writer, fetchText, now: NOW + H });
  assert.equal(s2.created, 0);
  assert.equal(calls, 1);
});

test("runDigest: লেখা আনা না গেলে এআই কল হয় না, কুলডাউনে রাখে", async () => {
  const store = makeStore();
  let calls = 0;
  const writer = async () => { calls++; return { data: GOOD, tokens: 1 }; };
  const s = await runDigest({ store, settings: settings(), writer, fetchText: async () => "", now: NOW });
  assert.equal(s.thin, 1);
  assert.equal(calls, 0);
  assert.ok(store.s.digests.tried.c1);
});

test("runDigest: যাচাইয়ে ফেল হলে প্রকাশ হয় না", async () => {
  const store = makeStore();
  const writer = async () => ({ data: { ...GOOD, headline: "মিরপুরে আগুনে ৩৭ জন আহত" }, tokens: 3000 });
  const s = await runDigest({ store, settings: settings(), writer, fetchText, now: NOW });
  assert.equal(s.created, 0);
  assert.equal(s.invalid, 1);
  assert.deepEqual(s.invalidReasons, ["bad_headline"]);
  assert.equal(store.s.digests.items.length, 0);
});

test("runDigest: rate_limit এ থামে ও বিরতি রাখে; বিরতিতে পরের রান কিছু করে না", async () => {
  const store = makeStore();
  let calls = 0;
  const writer = async () => { calls++; throw new AiError("rate_limit", "HTTP 429", 120000); };
  const s = await runDigest({ store, settings: settings(), writer, fetchText, now: NOW });
  assert.equal(s.created, 0);
  assert.equal(store.s.digests.pausedUntil, NOW + 120000);
  const s2 = await runDigest({ store, settings: settings(), writer, fetchText, now: NOW + 60000 });
  assert.equal(s2.skipped, "paused");
  assert.equal(calls, 1);
});

test("runDigest: দৈনিক সীমা পূর্ণ হলে কল নেই; বন্ধ থাকলে কিছু নেই", async () => {
  const store = makeStore();
  store.s.digests = { items: [], usage: { day: "2026-11-03", requests: 20, tokens: 1000, count: 20 } };
  let calls = 0;
  const writer = async () => { calls++; return { data: GOOD, tokens: 1 }; };
  assert.equal((await runDigest({ store, settings: settings(), writer, fetchText, now: NOW })).skipped, "daily_budget");
  assert.equal((await runDigest({ store, settings: settings({ enabled: false }), writer, fetchText, now: NOW })).skipped, "disabled");
  assert.equal(calls, 0);
});

test("runDigest: পুরনো ব্রিফ retention পেরোলে বাদ যায়", async () => {
  const store = makeStore([]);
  store.s.digests = { items: [{ id: "old", clusterId: "x", memberIds: [], publishedAt: NOW - 9 * 24 * H }, { id: "new", clusterId: "y", memberIds: [], publishedAt: NOW - H }] };
  await runDigest({ store, settings: settings(), writer: async () => ({ data: GOOD, tokens: 1 }), fetchText, now: NOW });
  assert.deepEqual(store.s.digests.items.map((d) => d.id), ["new"]);
});

// ---- Groq কলার ----
const okRes = (content, tokens = 5000) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: tokens } }), headers: new Map() });
const errRes = (status, error = {}, headers = new Map()) => ({ ok: false, status, json: async () => ({ error }), headers });

test("createGroqDigester: সফল উত্তর পার্স করে; ```json ঘেরা হলেও", async () => {
  const w = createGroqDigester({ apiKey: "k", model: "openai/gpt-oss-20b", fetchImpl: async () => okRes("```json\n" + JSON.stringify(GOOD) + "\n```"), sleepImpl: async () => {} });
  const r = await w(sources());
  assert.equal(r.tokens, 5000);
  assert.equal(r.data.headline, GOOD.headline);
});

test("createGroqDigester: reasoning প্যারামিটার না নিলে ছাড়া চেষ্টা; 429 → rate_limit; ভাঙা JSON → bad_output", async () => {
  const bodies = [];
  let n = 0;
  const w1 = createGroqDigester({
    apiKey: "k", model: "openai/gpt-oss-20b", sleepImpl: async () => {},
    fetchImpl: async (_u, o) => { bodies.push(JSON.parse(o.body)); return n++ === 0 ? errRes(400, { message: "reasoning_effort not supported" }) : okRes(JSON.stringify(GOOD)); },
  });
  await w1(sources());
  assert.ok("reasoning_effort" in bodies[0]);
  assert.ok(!("reasoning_effort" in bodies[1]));

  const w2 = createGroqDigester({ apiKey: "k", model: "m", sleepImpl: async () => {}, fetchImpl: async () => errRes(429, {}, new Map([["retry-after", "30"]])) });
  await assert.rejects(() => w2(sources()), (e) => e.kind === "rate_limit" && e.retryAfterMs === 30000);

  const w3 = createGroqDigester({ apiKey: "k", model: "m", sleepImpl: async () => {}, fetchImpl: async () => okRes("not json") });
  await assert.rejects(() => w3(sources()), (e) => e.kind === "bad_output");
});
