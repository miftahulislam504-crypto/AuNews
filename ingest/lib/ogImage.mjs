// খবরের পেজ থেকে মূল ছবির ঠিকানা (og:image) বের করে — RSS এ ছবি না থাকলে ফেসবুক কার্ডের জন্য।
// ক্রম: og:image:secure_url → og:image → twitter:image → <link rel="image_src"> → JSON-LD image।
// ব্যর্থ হলে (ব্লক, টাইমআউট, গুগল-নিউজ রিডাইরেক্ট) খালি তালিকা; কখনো exception ছোঁড়ে না।
import { decodeEntities } from "./text.mjs";
import { isPrivateHost } from "./articleText.mjs";

// লোগো/প্লেসহোল্ডার ধরনের ছবি খবরের ছবি নয়
const NOT_A_PHOTO = /(^|[\/_.-])(logo|favicon|placeholder|no[-_]?image|noimage|default[-_]?(og|image|thumb|share)|avatar|sprite|brand)([\/_.-]|$)/i;

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? "").trim() : "";
};

function abs(u, base) {
  try {
    const x = new URL(u, base);
    if (x.protocol === "http:") x.protocol = "https:";
    if (x.protocol !== "https:") return null;
    const s = x.toString();
    return s.length <= 1000 && !NOT_A_PHOTO.test(x.pathname) ? s : null;
  } catch {
    return null;
  }
}

function fromJsonLd(html, out) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const visit = (n) => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || typeof n !== "object") return;
    const img = n.image ?? n.thumbnailUrl;
    for (const v of Array.isArray(img) ? img : [img]) {
      if (typeof v === "string") out.push(v);
      else if (v && typeof v === "object" && typeof v.url === "string") out.push(v.url);
    }
    if (n["@graph"]) visit(n["@graph"]);
  };
  let m;
  while ((m = re.exec(html))) {
    try {
      visit(JSON.parse(m[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "").trim()));
    } catch {
      /* ভাঙা JSON বাদ */
    }
  }
}

// html → সম্ভাব্য ছবির ঠিকানার তালিকা (অগ্রাধিকার ক্রমে, ডুপ্লিকেট ছাড়া)
export function extractOgImages(html, baseUrl) {
  const head = String(html ?? "");
  const byKey = new Map();
  const add = (key, v) => {
    if (!v) return;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(v);
  };
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, "property") || attr(tag, "name")).toLowerCase();
    if (["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"].includes(key)) add(key, attr(tag, "content"));
  }
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    if (/image_src/i.test(attr(tag, "rel"))) add("image_src", attr(tag, "href"));
  }
  const ld = [];
  fromJsonLd(head, ld);
  const order = ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src", "image_src"];
  const raw = [...order.flatMap((k) => byKey.get(k) ?? []), ...ld];
  const out = [];
  for (const r of raw) {
    const u = abs(r, baseUrl);
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

export async function fetchOgImages(pageUrl, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  let u;
  try {
    u = new URL(pageUrl);
  } catch {
    return [];
  }
  if ((u.protocol !== "http:" && u.protocol !== "https:") || isPrivateHost(u.hostname)) return [];
  if (/(^|\.)news\.google\.com$/i.test(u.hostname)) return []; // রিডাইরেক্ট পেজ: এর og:image গুগলের নিজের
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(u.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AuNewsBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "bn,en;q=0.8",
      },
    });
    if (!res.ok) return [];
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|xml/i.test(type)) return [];
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 3_000_000) return [];
    // মেটা ট্যাগ <head> এ থাকে; শুরুর অংশ (JSON-LD সহ) যথেষ্ট
    const html = new TextDecoder("utf-8").decode(buf.slice(0, 600_000));
    return extractOgImages(html, res.url || u.toString());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
