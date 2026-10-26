import test from "node:test";
import assert from "node:assert/strict";
import { stripHtml, truncate, normalizeUrl, makeId, extractImage, decodeEntities } from "../lib/text.mjs";
import { classify } from "../lib/classify.mjs";
import { parseSeen, serializeSeen, pruneSeen, mergeSnapshot } from "../lib/merge.mjs";

test("stripHtml: ট্যাগ, এন্টিটি, CDATA, ডাবল-এনকোড", () => {
  assert.equal(stripHtml("<p>Hello &amp; <b>world</b></p>"), "Hello & world");
  assert.equal(stripHtml("<![CDATA[<p>খবর</p>]]>"), "খবর");
  assert.equal(stripHtml("&lt;p&gt;double&lt;/p&gt;"), "double");
  assert.equal(stripHtml("a &#39;b&#39; &#x41;"), "a 'b' A");
  assert.equal(stripHtml(null), "");
  assert.equal(decodeEntities("&unknown;"), "&unknown;");
});

test("truncate: ছোট টেক্সট অপরিবর্তিত, বড় টেক্সট … সহ ছাঁটা", () => {
  assert.equal(truncate("ছোট", 10), "ছোট");
  const long = "এটি একটি বেশ লম্বা বাক্য যা ছাঁটাই করতে হবে কারণ সীমা ছোট ".repeat(10);
  const out = truncate(long, 50);
  assert.ok(out.endsWith("…"));
  assert.ok(Array.from(new Intl.Segmenter("bn", { granularity: "grapheme" }).segment(out)).length <= 51);
});

test("normalizeUrl: ট্র্যাকিং বাদ, হ্যাশ বাদ, www/স্ল্যাশ একই কী", () => {
  const a = normalizeUrl("https://www.Example.com/news/1/?utm_source=x&id=5#top");
  const b = normalizeUrl("http://example.com/news/1?id=5");
  assert.equal(a.link, "https://www.example.com/news/1/?id=5");
  assert.equal(a.key, b.key);
  assert.equal(makeId(a.key), makeId(b.key));
  assert.equal(makeId(a.key).length, 20);
  assert.equal(normalizeUrl("javascript:alert(1)"), null);
  assert.equal(normalizeUrl(""), null);
});

test("extractImage: enclosure, media:content, img ট্যাগ, http→https, ভিডিও বাদ", () => {
  assert.equal(extractImage({ enclosure: { url: "http://x.com/a.jpg", type: "image/jpeg" } }, "https://x.com/n"), "https://x.com/a.jpg");
  assert.equal(extractImage({ mediaContent: { $: { url: "https://x.com/v.mp4", medium: "video" } } }, "https://x.com/n"), null);
  assert.equal(extractImage({ mediaContent: [{ $: { url: "https://x.com/m.png", medium: "image" } }] }, "https://x.com/n"), "https://x.com/m.png");
  assert.equal(extractImage({ contentEncoded: '<p><img src="/img/p.webp" width="300"></p>' }, "https://x.com/n/1"), "https://x.com/img/p.webp");
  assert.equal(extractImage({ content: '<img src="data:image/gif;base64,AAAA">' }, "https://x.com/n"), null);
  assert.equal(extractImage({}, "https://x.com/n"), null);
});

test("classify: মিক্সড ফিড কিওয়ার্ডে, নির্দিষ্ট ফিড অপরিবর্তিত", () => {
  assert.equal(classify("national", "বিপিএলে সাকিবের দলের দুর্দান্ত জয়", "ম্যাচে ১০ উইকেটে জিতেছে"), "sports");
  assert.equal(classify("national", "Bangladesh cricket team wins the tournament", ""), "sports");
  assert.equal(classify("national", "শেয়ারবাজারে বড় পতন", "ডলারের দাম বেড়েছে"), "economy");
  assert.equal(classify("national", "সড়কে ঝরল প্রাণ", "ঢাকা-চট্টগ্রাম মহাসড়কে দুর্ঘটনা"), "national");
  assert.equal(classify("international", "Google unveils new AI model", ""), "technology");
  assert.equal(classify("technology", "বিপিএল ক্রিকেট ম্যাচ", ""), "technology");
  assert.equal(classify("national", "আওয়ামী লীগের বৈঠক", ""), "politics");
  assert.equal(classify("national", "Awami League leaders meet", ""), "politics"); // 'league' দেখে sports ধরা উচিত নয়
});

test("classify: যুদ্ধ/হামলার খবর 'hospital' দেখে স্বাস্থ্যে যায় না, কিন্তু সাধারণ স্বাস্থ্য খবর যায়", () => {
  assert.equal(classify("international", "Israel strikes Gaza hospital, dozens killed", "The hospital was hit"), "international");
  assert.equal(classify("national", "হাসপাতালে হামলা, নিহত ৫", "হাসপাতালের চিকিৎসক"), "national");
  assert.equal(classify("international", "New hospital opens with 500 beds", "doctors and patients"), "health");
  assert.equal(classify("national", "ঢাকায় নতুন হাসপাতাল উদ্বোধন", "চিকিৎসক ও রোগী"), "health");
});

test("seen: সিরিয়ালাইজ/প্যার্স/প্রুন/ক্যাপ", () => {
  const m = new Map([["aaa", 1_700_000_000_000], ["bbb", 1_700_000_600_000], ["ccc", 1_600_000_000_000]]);
  const back = parseSeen(serializeSeen(m));
  assert.equal(back.size, 3);
  assert.equal(back.get("aaa"), Math.floor(1_700_000_000_000 / 60000) * 60000);
  assert.equal(pruneSeen(back, 1_650_000_000_000), 1);
  assert.ok(!back.has("ccc"));
  assert.equal(parseSeen(serializeSeen(m, 2)).size, 2);
  assert.equal(parseSeen("").size, 0);
  assert.equal(parseSeen(undefined).size, 0);
});

test("mergeSnapshot: ডিডুপ, সর্ট, ক্যাপ, পুরনো বাদ, changed ফ্ল্যাগ", () => {
  const mk = (id, t) => ({ id, publishedAt: t });
  const ex = [mk("a", 300), mk("b", 200), mk("c", 100)];
  let r = mergeSnapshot(ex, [mk("a", 300)], { cap: 10, cutoffMs: 0 });
  assert.equal(r.changed, false);
  r = mergeSnapshot(ex, [mk("d", 400)], { cap: 3, cutoffMs: 0 });
  assert.deepEqual(r.items.map((i) => i.id), ["d", "a", "b"]);
  assert.equal(r.changed, true);
  r = mergeSnapshot(ex, [], { cap: 10, cutoffMs: 150 });
  assert.deepEqual(r.items.map((i) => i.id), ["a", "b"]);
  assert.equal(r.changed, true);
  r = mergeSnapshot([], [mk("x", 5)], { cap: 5, cutoffMs: 0 });
  assert.equal(r.changed, true);
});
