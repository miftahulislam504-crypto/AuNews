import test from "node:test";
import assert from "node:assert/strict";
import { annotateClusters, tokens } from "../lib/cluster.mjs";

const H = 3600000;
const T0 = Date.parse("2026-10-25T00:00:00Z");
let k = 0;
const mk = (title, sourceId, lang = "bn", h = 0) => ({ id: "i" + k++, title, sourceId, lang, publishedAt: T0 + h * H });
const groupsOf = (out) => {
  const g = {};
  out.forEach((o, i) => { if (o.clusterId) (g[o.clusterId] ??= []).push(i); });
  return Object.values(g);
};

test("tokens: বাংলা suffix একই মূলে আসে, স্টপওয়ার্ড ও বাংলা অঙ্ক", () => {
  const a = tokens("ঢাকার সরকারের সিদ্ধান্ত ২০২৬");
  const b = tokens("ঢাকায় সরকার সিদ্ধান্ত 2026");
  for (const t of b) assert.ok(a.has(t), `${t} মেলেনি`);
  assert.ok(!tokens("এবং এই করে").size);
  assert.ok(tokens("The strikes on Gaza").has("strike"));
});

test("একই ঘটনার বাংলা শিরোনাম একসাথে, অসম্পর্কিত আলাদা", () => {
  const items = [
    mk("বিপিএলে সিলেটকে ৬ উইকেটে হারিয়ে ফাইনালে ঢাকা", "a", "bn", 1),
    mk("সিলেটকে হারিয়ে বিপিএলের ফাইনালে উঠল ঢাকা", "b", "bn", 2),
    mk("ফাইনালে ঢাকা, বিপিএলে সিলেটকে হারাল ৬ উইকেটে", "c", "bn", 3),
    mk("মিরপুরের কারখানায় আগুনে পাঁচজনের মৃত্যু", "b", "bn", 5),
    mk("মিরপুরে কারখানায় ভয়াবহ আগুন, ৫ জনের মৃত্যু", "c", "bn", 6),
    mk("ঢাকায় বৃষ্টির সম্ভাবনা, তাপমাত্রা কমবে", "a", "bn", 7),
    mk("ঢাকায় মেট্রোরেলের নতুন সূচি ঘোষণা", "b", "bn", 8),
    mk("ঢাকা বিশ্ববিদ্যালয়ে ভর্তি পরীক্ষা শুরু", "c", "bn", 9),
    mk("সরকারের নতুন বাজেটে শিক্ষায় বরাদ্দ বাড়ল", "a", "bn", 10),
    mk("সরকার পেট্রলের দাম লিটারে ২ টাকা বাড়াল", "b", "bn", 11),
  ];
  assert.deepEqual(groupsOf(annotateClusters(items)), [[0, 1, 2], [3, 4]]);
});

test("ইংরেজি শিরোনাম; 'Bangladesh'/'India' এক শব্দে ভুল গ্রুপ হয় না", () => {
  const items = [
    mk("Israel strikes Gaza hospital, dozens killed", "x", "en", 1),
    mk("Dozens killed in Israeli strike on Gaza hospital", "y", "en", 2),
    mk("Israeli strike hits Gaza hospital, at least 30 dead", "z", "en", 3),
    mk("Bangladesh beat India in women's cricket series", "x", "en", 4),
    mk("Bangladesh inflation eases in September", "y", "en", 5),
    mk("India central bank holds interest rates", "z", "en", 6),
    mk("Google unveils new AI model for search", "x", "en", 7),
    mk("Google launches AI model upgrade for search", "y", "en", 8),
  ];
  assert.deepEqual(groupsOf(annotateClusters(items)), [[0, 1, 2], [6, 7]]);
});

test("৪৮ ঘণ্টার বেশি ফারাকে এবং ভিন্ন ভাষায় গ্রুপ হয় না", () => {
  const far = [mk("Israel strikes Gaza hospital, dozens killed", "x", "en", 0), mk("Dozens killed in Israeli strike on Gaza hospital", "y", "en", 72)];
  assert.deepEqual(groupsOf(annotateClusters(far)), []);
  const langs = [mk("Gaza hospital strike", "x", "en", 1), mk("Gaza hospital strike", "y", "bn", 1)];
  assert.deepEqual(groupsOf(annotateClusters(langs)), []);
});

test("clusterId = সবচেয়ে পুরনো সদস্য; আবার চালালে একই; পুরনো ফিল্ড মোছে", () => {
  const items = [
    mk("Dozens killed in Israeli strike on Gaza hospital", "y", "en", 2),
    mk("Israel strikes Gaza hospital, dozens killed", "x", "en", 1),
    { ...mk("Google unveils new AI model for search", "x", "en", 5), clusterId: "stale" },
  ];
  const out = annotateClusters(items);
  assert.equal(out[0].clusterId, items[1].id);
  assert.equal(out[1].clusterId, items[1].id);
  assert.equal("clusterId" in out[2], false);
  assert.deepEqual(annotateClusters(out).map((o) => o.clusterId), out.map((o) => o.clusterId));
});

test("খালি ও একক তালিকা", () => {
  assert.deepEqual(annotateClusters([]), []);
  assert.equal(annotateClusters([mk("একা খবর এখানে", "a", "bn", 0)])[0].clusterId, undefined);
});
