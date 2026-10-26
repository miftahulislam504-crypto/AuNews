// একই ঘটনার খবর (ভিন্ন সোর্স) চিনে একই clusterId দেয়।
// পদ্ধতি: শিরোনামের শব্দ → হালকা stemming → IDF ওজনে cosine মিল। বাংলা-ইংরেজি আলাদাভাবে (ভাষা মিললে তুলনা)।
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

export function normalizeText(s) {
  return String(s)
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

const BN_SUFFIXES = [
  "গুলোতে", "গুলোর", "গুলো", "গুলির", "গুলি", "দেরকে", "দের", "েরা", "ের", "কে", "রা", "টির", "টি", "টা", "তে", "য়", "র", "ে",
]
  .map(normalizeText)
  .sort((a, b) => b.length - a.length);

const STOP = new Set(
  [
    // বাংলা
    "এবং", "ও", "এই", "ওই", "সেই", "একটি", "একটা", "করে", "করেছে", "করেছেন", "করেন", "করা", "হবে", "হয়েছে", "হয়", "হলো", "থেকে",
    "জন্য", "নিয়ে", "দিয়ে", "পর", "আর", "না", "কী", "কি", "তার", "তাঁর", "তাদের", "এক", "আজ", "গতকাল", "বলে", "বলেছেন", "জানিয়েছেন",
    "জানা", "যায়", "গেছে", "দিল", "দিলেন", "হচ্ছে", "আছে", "ছিল", "সঙ্গে", "সাথে", "মধ্যে", "পরে", "আগে", "ফের", "আবার",
    // English
    "the", "a", "an", "of", "in", "on", "at", "to", "for", "and", "or", "is", "are", "was", "were", "be", "by", "with", "as", "from",
    "after", "over", "says", "say", "said", "new", "will", "has", "have", "had", "its", "it", "this", "that", "amid", "into", "up",
    "out", "more", "than", "not", "but", "who", "how", "what", "why", "his", "her", "their", "least", "about", "near",
  ].map(normalizeText)
);

const SPLIT = /[^\p{L}\p{M}\p{N}]+/u;
const HAS_BN = /[\u0980-\u09FF]/;

function stemBn(t) {
  for (let pass = 0; pass < 2; pass++) {
    let changed = false;
    for (const suf of BN_SUFFIXES) {
      if (t.length - suf.length >= 3 && t.endsWith(suf)) {
        t = t.slice(0, -suf.length);
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return t;
}

function stemEn(t) {
  return t.length > 4 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t;
}

export function tokens(title) {
  const out = new Set();
  for (const raw of normalizeText(title).split(SPLIT)) {
    if (!raw || STOP.has(raw)) continue;
    const t = HAS_BN.test(raw) ? stemBn(raw) : stemEn(raw);
    if (t.length < 2 || STOP.has(t)) continue;
    out.add(t);
  }
  return out;
}

function cosine(a, b, minShared) {
  const [small, big] = a.m.size <= b.m.size ? [a, b] : [b, a];
  let shared = 0;
  let dot = 0;
  for (const [t, w] of small.m) {
    if (big.m.has(t)) {
      shared++;
      dot += w * w;
    }
  }
  if (shared < minShared || !a.norm || !b.norm) return 0;
  return dot / (a.norm * b.norm);
}

// items: { id, title, lang, sourceId, publishedAt, ... }[] → একই তালিকা, গ্রুপ থাকলে clusterId সহ
export function annotateClusters(items, opts = {}) {
  const { threshold = 0.45, minShared = 2, maxHoursApart = 48 } = opts;
  const n = items.length;
  const toks = items.map((i) => tokens(i.title));
  const df = new Map();
  for (const s of toks) for (const t of s) df.set(t, (df.get(t) || 0) + 1);
  const idf = (t) => Math.log((n + 1) / ((df.get(t) || 0) + 1)) + 1;
  const vec = toks.map((s) => {
    const m = new Map();
    let sq = 0;
    for (const t of s) {
      const w = idf(t);
      m.set(t, w);
      sq += w * w;
    }
    return { m, norm: Math.sqrt(sq) };
  });

  const order = [...items.keys()].sort((a, b) => items[a].publishedAt - items[b].publishedAt);
  const maxMs = maxHoursApart * 3600000;
  const clusterOf = new Array(n).fill(-1);
  const clusters = [];
  for (const i of order) {
    let best = -1;
    let bestSim = 0;
    for (let c = 0; c < clusters.length; c++) {
      for (const j of clusters[c]) {
        if (items[i].lang !== items[j].lang) continue;
        if (Math.abs(items[i].publishedAt - items[j].publishedAt) > maxMs) continue;
        const sim = cosine(vec[i], vec[j], minShared);
        if (sim > bestSim) {
          bestSim = sim;
          best = c;
        }
      }
    }
    if (best >= 0 && bestSim >= threshold) {
      clusters[best].push(i);
      clusterOf[i] = best;
    } else {
      clusters.push([i]);
      clusterOf[i] = clusters.length - 1;
    }
  }

  return items.map((it, i) => {
    const members = clusters[clusterOf[i]];
    const { clusterId: _old, ...rest } = it;
    return members.length < 2 ? rest : { ...rest, clusterId: items[members[0]].id };
  });
}
