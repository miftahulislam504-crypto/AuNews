import test from "node:test";
import assert from "node:assert/strict";
import { parseVideoFeed, resolveChannelId, runVideos } from "../lib/youtube.mjs";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const HOUR = 3600000;
const iso = (ms) => new Date(ms).toISOString();

const feedXml = (name, cid, entries) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=${cid}"/>
 <id>yt:channel:${cid.slice(2)}</id>
 <yt:channelId>${cid.slice(2)}</yt:channelId>
 <title>${name}</title>
 <author><name>${name}</name><uri>https://www.youtube.com/channel/${cid}</uri></author>
 ${entries
   .map(
     (e) => `<entry>
  <id>yt:video:${e.id}</id>
  <yt:videoId>${e.id}</yt:videoId>
  <title>${e.title}</title>
  <link rel="alternate" href="https://www.youtube.com/${e.short ? "shorts/" : "watch?v="}${e.id}"/>
  <author><name>${name}</name></author>
  <published>${iso(e.at)}</published>
 </entry>`
   )
   .join("\n")}
</feed>`;

const CID_A = "UC" + "a".repeat(22);
const CID_B = "UC" + "b".repeat(22);

function memStore(init = {}) {
  let videos = init;
  return { loadVideos: async () => videos, saveVideos: async (d) => { videos = d; }, get: () => videos };
}

test("parseVideoFeed: শিরোনাম, সময়, শর্টস ও এন্টিটি", () => {
  const xml = feedXml("যমুনা টিভি", CID_A, [
    { id: "AAAAAAAAAAA", title: "রাজধানীতে &amp; আশপাশে &#39;বৃষ্টি&#39;", at: NOW - HOUR },
    { id: "BBBBBBBBBBB", title: "short", at: NOW - 2 * HOUR, short: true },
  ]);
  const f = parseVideoFeed(xml);
  assert.equal(f.feedName, "যমুনা টিভি");
  assert.equal(f.entries.length, 2);
  assert.equal(f.entries[0].title, "রাজধানীতে & আশপাশে 'বৃষ্টি'");
  assert.equal(f.entries[0].publishedAt, NOW - HOUR);
  assert.equal(f.entries[1].isShort, true);
});

test("resolveChannelId: canonical লিংক থেকে ID; ভুল handle এ null", async () => {
  const html = `<html><head><link rel="canonical" href="https://www.youtube.com/channel/${CID_A}"></head><body>"externalId":"${CID_B}"</body></html>`;
  assert.equal(await resolveChannelId("@Jamuna", async () => html), CID_A);
  assert.equal(await resolveChannelId("@Jamuna", async () => "<html></html>"), null);
  assert.equal(await resolveChannelId("bad handle!", async () => html), null);
});

test("runVideos: নাম না মিললে পরের handle; ২৪ ঘণ্টার পুরনো ও শর্টস বাদ; ID ক্যাশ হয়", async () => {
  const store = memStore();
  const pages = {
    "https://www.youtube.com/@wrong": `<link rel="canonical" href="https://www.youtube.com/channel/${CID_B}">`,
    "https://www.youtube.com/@right": `<link rel="canonical" href="https://www.youtube.com/channel/${CID_A}">`,
    [`https://www.youtube.com/feeds/videos.xml?channel_id=${CID_B}`]: feedXml("Random Gaming", CID_B, [{ id: "ZZZZZZZZZZZ", title: "game", at: NOW - HOUR }]),
    [`https://www.youtube.com/feeds/videos.xml?channel_id=${CID_A}`]: feedXml("Jamuna Television", CID_A, [
      { id: "AAAAAAAAAAA", title: "নতুন", at: NOW - HOUR },
      { id: "CCCCCCCCCCC", title: "পুরনো", at: NOW - 30 * HOUR },
      { id: "DDDDDDDDDDD", title: "শর্টস", at: NOW - HOUR, short: true },
    ]),
  };
  const calls = [];
  const fetchText = async (u) => { calls.push(u); if (!(u in pages)) throw new Error("HTTP 404"); return pages[u]; };
  const config = { channels: [{ id: "jamuna", name: "যমুনা টিভি", handles: ["@wrong", "@right"], match: "jamuna" }] };
  const st = await runVideos({ store, settings: { retention: { days: 1 } }, config, fetchText, now: NOW });
  assert.equal(st.channelsOk, 1);
  assert.deepEqual(st.failed, []);
  assert.deepEqual(store.get().items.map((v) => v.id), ["AAAAAAAAAAA"]);
  assert.equal(store.get().items[0].channelName, "যমুনা টিভি");
  assert.equal(store.get().resolved.jamuna.channelId, CID_A);

  // দ্বিতীয় রানে handle আর খোঁজা হয় না (ক্যাশ)
  calls.length = 0;
  await runVideos({ store, settings: { retention: { days: 1 } }, config, fetchText, now: NOW + HOUR });
  assert.ok(!calls.some((u) => u.includes("/@")));
});

test("runVideos: সব handle ভুল হলে ফেল তালিকায় আসে, ভিডিও ঢোকে না", async () => {
  const store = memStore();
  const st = await runVideos({
    store, settings: { retention: { days: 1 } },
    config: { channels: [{ id: "x", name: "X", handles: ["@nothing"], match: "x" }] },
    fetchText: async () => { throw new Error("HTTP 404"); }, now: NOW,
  });
  assert.equal(st.channelsOk, 0);
  assert.equal(st.failed.length, 1);
  assert.deepEqual(store.get(), {});
});

test("runVideos: ২৪ ঘণ্টা পেরোনো আগের ভিডিও মুছে যায়", async () => {
  const store = memStore({ items: [{ id: "OLDOLDOLD11", title: "old", channelId: CID_A, channelKey: "j", channelName: "J", publishedAt: NOW - 26 * HOUR }], resolved: { j: { channelId: CID_A } } });
  const fetchText = async () => feedXml("Jamuna", CID_A, [{ id: "AAAAAAAAAAA", title: "new", at: NOW - HOUR }]);
  await runVideos({ store, settings: { retention: { days: 1 } }, config: { channels: [{ id: "j", name: "J", channelId: CID_A }] }, fetchText, now: NOW });
  assert.deepEqual(store.get().items.map((v) => v.id), ["AAAAAAAAAAA"]);
});
