import test from "node:test";
import assert from "node:assert/strict";
import { dhaka, buildEdition, runDaily, toBn, DAILY_DEFAULTS } from "../lib/daily.mjs";

const H = 3600000;
// ২০২৬-১১-০৩ ০৭:৩০ ঢাকা = ০১:৩০ UTC
const NOW = Date.parse("2026-11-03T01:30:00Z");
const cfg = { ...DAILY_DEFAULTS };

const mk = (id, sourceId, hoursAgo, clusterId, extra = {}) => ({
  id, title: `খবর ${id}`, link: `https://${sourceId}.test/${id}`, sourceId, sourceName: sourceId.toUpperCase(),
  lang: "bn", scope: "bd", category: "national", publishedAt: NOW - hoursAgo * H, clusterId, ...extra,
});
const cluster = (cid, n, extra = {}) => Array.from({ length: n }, (_, i) => mk(`${cid}-${i}`, `s${i}`, 1 + i, cid, extra));

test("dhaka: তারিখ/ঘণ্টা/বাংলা লেবেল (UTC+৬)", () => {
  const d = dhaka(Date.parse("2026-11-03T20:30:00Z")); // ঢাকায় ৪ নভেম্বর ০২:৩০
  assert.equal(d.date, "2026-11-04");
  assert.equal(d.hour, 2);
  assert.equal(d.label, "৪ নভেম্বর ২০২৬");
  assert.equal(toBn(1205), "১২০৫");
});

test("buildEdition: বেশি সোর্স আগে; ২ এর কম সোর্স/পুরনো/ক্লাস্টারহীন বাদ; বাংলা শিরোনামহীন বাদ", () => {
  const items = [
    ...cluster("a", 5), ...cluster("b", 3), ...cluster("c", 2),
    mk("lone", "x", 1, undefined),
    ...cluster("one", 1),
    ...cluster("old", 4).map((m) => ({ ...m, publishedAt: NOW - 40 * H })),
    ...cluster("en", 6, { title: "English only headline" }),
  ];
  const st = buildEdition({ items, digests: [], cfg, now: NOW });
  assert.deepEqual(st.map((s) => s.clusterId), ["a", "b", "c"]);
  assert.deepEqual(st.map((s) => s.rank), [1, 2, 3]);
  assert.equal(st[0].sourceCount, 5);
  assert.equal(st[0].digestId, null);
  assert.ok(st[0].link.startsWith("https://"));
});

test("buildEdition: ব্রিফ থাকলে তার শিরোনাম/ভূমিকা ও digestId; সদস্য-মিলেও ধরে; ইংরেজি ক্লাস্টারও ব্রিফ থাকলে আসে", () => {
  const items = [...cluster("a", 3), ...cluster("en", 4, { title: "English only headline" })];
  const digests = [
    { id: "d1", clusterId: "zzz", memberIds: ["a-1"], headline: "ব্রিফের শিরোনাম", lead: "ব্রিফের ভূমিকা" },
    { id: "d2", clusterId: "en", memberIds: [], headline: "ইংরেজি খবরের বাংলা ব্রিফ", lead: "ভূমিকা" },
  ];
  const st = buildEdition({ items, digests, cfg, now: NOW });
  assert.equal(st.length, 2);
  const en = st.find((s) => s.clusterId === "en");
  assert.equal(en.digestId, "d2");
  const a = st.find((s) => s.clusterId === "a");
  assert.equal(a.digestId, "d1");
  assert.equal(a.headline, "ব্রিফের শিরোনাম");
  assert.equal(a.link, null);
});

test("buildEdition: বিশ্ব-খবর সীমা ও মোট সীমা; titleBn অগ্রাধিকার", () => {
  const items = [];
  for (let i = 0; i < 6; i++) items.push(...cluster(`w${i}`, 6 - (i % 2), { scope: "intl" }));
  for (let i = 0; i < 9; i++) items.push(...cluster(`b${i}`, 2, { scope: "bd" }));
  items.push(...cluster("t", 7).map((m) => ({ ...m, titleBn: "অনূদিত শিরোনাম" })));
  const st = buildEdition({ items, digests: [], cfg, now: NOW });
  assert.equal(st.length, 10);
  assert.ok(st.filter((s) => s.scope !== "bd").length <= 4);
  assert.equal(st[0].headline, "অনূদিত শিরোনাম");
});

const mkStore = (snap, extra = {}) => {
  const s = { daily: extra.daily ?? {}, snap, digests: extra.digests ?? {} };
  return {
    s,
    loadSnapshots: async () => new Map([["all", structuredClone(snap)]]),
    loadDigests: async () => structuredClone(s.digests),
    loadDaily: async () => structuredClone(s.daily),
    saveDaily: async (d) => { s.daily = structuredClone(d); },
  };
};
const items3 = () => [...cluster("a", 4), ...cluster("b", 3), ...cluster("c", 2)];

test("runDaily: সকাল ৭টার পর একবার তৈরি; একই দিনে আবার নয়; পরদিন নতুন", async () => {
  const store = mkStore(items3());
  const r1 = await runDaily({ store, settings: { daily: { keep: 7 } }, now: NOW });
  assert.equal(r1.created, true);
  assert.equal(store.s.daily.items[0].date, "2026-11-03");
  assert.equal(store.s.daily.items[0].label, "৩ নভেম্বর ২০২৬");
  assert.equal(store.s.daily.items[0].stories.length, 3);
  const r2 = await runDaily({ store, settings: {}, now: NOW + H });
  assert.equal(r2.skipped, "done");
  // পরদিন: খবরও নতুন (২৪ ঘণ্টা পরের) ধরে নিই
  const next = mkStore(items3().map((m) => ({ ...m, publishedAt: m.publishedAt + 24 * H })), { daily: store.s.daily });
  const r3 = await runDaily({ store: next, settings: { daily: { keep: 7 } }, now: NOW + 24 * H });
  assert.equal(r3.created, true);
  assert.equal(next.s.daily.items.length, 2);
});

test("runDaily: ৭টার আগে নয়; খবর কম হলে নয়; বন্ধ থাকলে নয়; সর্বোচ্চ keep টি সংস্করণ", async () => {
  const early = Date.parse("2026-11-02T22:00:00Z"); // ঢাকায় ০৪:০০
  assert.equal((await runDaily({ store: mkStore(items3()), settings: {}, now: early })).skipped, "early");
  assert.equal((await runDaily({ store: mkStore(cluster("a", 4)), settings: {}, now: NOW })).skipped, "thin");
  assert.equal((await runDaily({ store: mkStore(items3()), settings: { daily: { enabled: false } }, now: NOW })).skipped, "disabled");
  const old = Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${10 + i}`, stories: [] }));
  const store = mkStore(items3(), { daily: { items: old } });
  await runDaily({ store, settings: { daily: { keep: 7 } }, now: NOW });
  assert.equal(store.s.daily.items.length, 7);
  assert.equal(store.s.daily.items[0].date, "2026-11-03");
});

test("runDaily: ডিফল্টে শুধু সর্বশেষ ১টি সংস্করণ থাকে (২৪ ঘণ্টা রিটেনশন)", async () => {
  const old = [{ date: "2026-11-02", stories: [] }];
  const store = mkStore(items3(), { daily: { items: old } });
  await runDaily({ store, settings: {}, now: NOW });
  assert.equal(store.s.daily.items.length, 1);
  assert.equal(store.s.daily.items[0].date, "2026-11-03");
});

test("buildEdition: ব্রিফ-ভিত্তিক গল্পে মূল সোর্সের লিংক জমা থাকে (ব্রিফ মুছলে ফলব্যাক)", () => {
  const items = cluster("a", 3);
  const digests = [{ id: "d".repeat(20), clusterId: "a", headline: "ব্রিফ শিরোনাম", lead: "ভূমিকা", memberIds: [] }];
  const st = buildEdition({ items, digests, cfg: { ...DAILY_DEFAULTS, minSources: 2 }, now: NOW });
  assert.equal(st[0].digestId, "d".repeat(20));
  assert.equal(st[0].link, null);
  assert.ok(st[0].altLink.startsWith("https://"));
  assert.ok(st[0].altSource);
});
