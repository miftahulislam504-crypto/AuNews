// এআই ব্রিফের জন্য সোর্স পেজ থেকে খবরের লেখা (শুধু ইনপুট হিসেবে, প্রকাশের জন্য নয়) বের করে।
// ক্রম: ১) JSON-LD এর articleBody  ২) <article>/<main> এর <p>। না পেলে null।
import { decodeEntities } from "./text.mjs";

const BOILER =
  /^(advertisement|বিজ্ঞাপন|আরও পড়ুন|আরো পড়ুন|read more|related|follow us|share this|subscribe|sign up|all rights reserved|copyright|©|ফলো করুন|শেয়ার করুন|click here)/i;

const clean = (html) =>
  decodeEntities(String(html).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/[\s\u00a0\u200b]+/g, " ")
    .trim();

function fromJsonLd(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let best = "";
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const type = Array.isArray(node["@type"]) ? node["@type"].join(",") : String(node["@type"] ?? "");
    if (/article|posting|report/i.test(type) && typeof node.articleBody === "string" && node.articleBody.length > best.length) {
      best = node.articleBody;
    }
    if (node["@graph"]) visit(node["@graph"]);
  };
  let m;
  while ((m = re.exec(html))) {
    try {
      visit(JSON.parse(m[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "").trim()));
    } catch {
      /* ভাঙা JSON বাদ */
    }
  }
  return best ? clean(best) : "";
}

function fromParagraphs(html) {
  const h = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|iframe|form|nav|header|footer|aside|button|select|template)\b[\s\S]*?<\/\1>/gi, " ");
  const regions = [...h.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map((m) => m[0]);
  const main = h.match(/<main\b[\s\S]*?<\/main>/i);
  if (main) regions.push(main[0]);
  regions.push(h);
  let best = "";
  for (const r of regions) {
    const seen = new Set();
    const parts = [];
    for (const m of r.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
      const t = clean(m[1]);
      if (t.length < 40 || BOILER.test(t) || seen.has(t)) continue;
      seen.add(t);
      parts.push(t);
    }
    const text = parts.join("\n");
    if (parts.length >= 2 && text.length >= 300 && text.length > best.length) {
      best = text;
      if (r !== h) break; // <article>/<main> এ ভালো লেখা পেলে পুরো পেজ খুঁজি না
    }
  }
  return best;
}

export function extractText(html) {
  const ld = fromJsonLd(html);
  const dom = fromParagraphs(html);
  const pick = ld.length >= 300 && ld.length >= dom.length * 0.7 ? ld : dom;
  return pick.length >= 300 ? pick : "";
}

function isPrivateHost(host) {
  const h = host.toLowerCase();
  return (
    h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") ||
    /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === "::1" || h.startsWith("[")
  );
}

function decodeBody(buf, contentType) {
  let label = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  if (!label) {
    const head = new TextDecoder("latin1").decode(buf.slice(0, 2048));
    label = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  try {
    return new TextDecoder(label || "utf-8").decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

// ব্যর্থ হলে (ব্লক, টাইমআউট, পেওয়াল, গুগল-নিউজ রিডাইরেক্ট) খালি স্ট্রিং; কখনো exception ছোঁড়ে না
export async function fetchArticleText(url, { fetchImpl = fetch, timeoutMs = 8000, maxChars = 1500 } = {}) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return "";
  }
  if ((u.protocol !== "http:" && u.protocol !== "https:") || isPrivateHost(u.hostname)) return "";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(u.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AuNewsDigestBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "bn,en;q=0.8",
      },
    });
    if (!res.ok) return "";
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|xml/i.test(type)) return "";
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 3_000_000) return "";
    const text = extractText(decodeBody(buf, type));
    return text.length > maxChars ? text.slice(0, maxChars) : text;
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}
