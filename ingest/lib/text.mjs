import { createHash } from "node:crypto";

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  hellip: "…", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function stripHtml(html) {
  if (!html) return "";
  let s = String(html)
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
  if (!raw) return null;
  let u;
  try { u = new URL(String(raw).trim()); } catch { return null; }
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
  const html = item.contentEncoded || item.content || item.summary || "";
  const m = typeof html === "string" ? html.match(/<img[^>]+src=["']([^"']+)["']/i) : null;
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
