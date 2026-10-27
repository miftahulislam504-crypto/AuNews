import { createHash } from "node:crypto";

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  hellip: "…", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};

// rss-parser (xml2js) অ্যাট্রিবিউটসহ ট্যাগকে স্ট্রিং নয়, অবজেক্ট ({ _: "টেক্সট", $: {...} }) হিসেবে দেয়;
// এমনকি prototype-হীন অবজেক্টও হতে পারে, যেখানে String(obj) সরাসরি TypeError ছোঁড়ে।
// তাই যেকোনো ফিড-ভ্যালুকে নিরাপদে স্ট্রিং বানাতে এটি ব্যবহার করুন।
const TEXT_KEYS = ["_", "#text", "__text", "__cdata", "$t"];

export function toText(v, depth = 0) {
  if (v == null) return "";
  const t = typeof v;
  if (t === "string") return v;
  if (t === "number" || t === "boolean" || t === "bigint") return String(v);
  if (t !== "object" || depth > 4) return "";
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = toText(x, depth + 1);
      if (s) return s;
    }
    return "";
  }
  for (const k of TEXT_KEYS) {
    if (k in v) {
      const s = toText(v[k], depth + 1);
      if (s) return s;
    }
  }
  return "";
}

export function decodeEntities(s) {
  return toText(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function stripHtml(html) {
  const raw = toText(html);
  if (!raw) return "";
  let s = raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  s = decodeEntities(s);
  // কিছু ফিডে HTML দুইবার এনকোড করা থাকে
  if (/<[a-z][^>]*>/i.test(s)) s = s.replace(/<[^>]*>/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

const segmenter = new Intl.Segmenter("bn", { granularity: "grapheme" });

// বাংলা যুক্তাক্ষর না ভেঙে ছাঁটাই করে
export function truncate(text, max) {
  if (!text) return "";
  if (text.length <= max) return text;
  const head = text.length > max * 3 ? text.slice(0, max * 3) : text;
  const gs = Array.from(segmenter.segment(head), (s) => s.segment);
  if (gs.length <= max && head === text) return text;
  let cut = gs.slice(0, max).join("");
  const sp = cut.lastIndexOf(" ");
  if (sp > cut.length * 0.6) cut = cut.slice(0, sp);
  return cut.replace(/[\s,;:.\-–—]+$/, "") + "…";
}

const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|igshid$|cmpid$)/i;

// { link: দেখানোর লিংক, key: ডুপ্লিকেট চেনার ক্যানোনিক্যাল কী }
export function normalizeUrl(raw) {
  let text = toText(raw).trim();
  if (!text) text = toText((Array.isArray(raw) ? raw[0] : raw)?.$?.href).trim(); // <link href="..."/> ধরন
  if (!text) return null;
  let u;
  try { u = new URL(text); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  const link = u.toString();
  const key = u.hostname.toLowerCase().replace(/^www\./, "") + u.pathname.replace(/\/+$/, "") + u.search;
  return { link, key };
}

export function makeId(key) {
  return createHash("sha1").update(key).digest("hex").slice(0, 20);
}

const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;
const first = (v) => (Array.isArray(v) ? v[0] : v);

export function extractImage(item, baseLink) {
  const cands = [];
  const enc = first(item.enclosure);
  if (enc?.url && (String(enc.type || "").startsWith("image") || (!enc.type && IMG_EXT.test(enc.url)))) cands.push(enc.url);
  const mc = first(item.mediaContent)?.$;
  if (mc?.url && (mc.medium === "image" || String(mc.type || "").startsWith("image") || (!mc.medium && !mc.type && IMG_EXT.test(mc.url)))) cands.push(mc.url);
  const mt = first(item.mediaThumbnail)?.$;
  if (mt?.url) cands.push(mt.url);
  const html = toText(item.contentEncoded) || toText(item.content) || toText(item.summary);
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m && !m[1].startsWith("data:")) cands.push(decodeEntities(m[1]));
  for (const c of cands) {
    try {
      const u = new URL(c, baseLink);
      if (u.protocol === "http:") u.protocol = "https:";
      if (u.protocol !== "https:") continue;
      const s = u.toString();
      if (s.length <= 1000) return s;
    } catch { /* পরের প্রার্থী */ }
  }
  return null;
}
