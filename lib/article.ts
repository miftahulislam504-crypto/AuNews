// খবরের মূল পেজ থেকে পড়ার মতো লেখা বের করে (কোনো বাইরের লাইব্রেরি ছাড়া)।
// ক্রম: ১) JSON-LD এর articleBody  ২) <article>/<main> এর <p> ও সাবহেডিং। না পেলে null।
export type Block = { t: "p" | "h"; text: string };
export type Article = { blocks: Block[]; chars: number };

const ENT: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", copy: "©",
};

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

function clean(html: string): string {
  return decode(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/[\s\u00a0\u200b]+/g, " ")
    .trim();
}

// বিজ্ঞাপন/শেয়ার/কপিরাইট ধরনের লাইন
const BOILER =
  /^(advertisement|বিজ্ঞাপন|আরও পড়ুন|আরো পড়ুন|read more|related|follow us|share this|subscribe|sign up|all rights reserved|copyright|©|ফলো করুন|শেয়ার করুন|click here)/i;
// এই হেডিং এলে এর পরের অংশ আর খবরের লেখা নয় (সম্পর্কিত খবর, মন্তব্য ইত্যাদি)
const STOP = /(আরও পড়ুন|আরো পড়ুন|সম্পর্কিত|এ বিভাগের|জনপ্রিয়|related|more (from|stories|news)|you (may|might) also|recommended|trending|latest news|comments?|মন্তব্য)/i;

const MAX_BLOCKS = 80;
const MAX_CHARS = 30000;

function finish(blocks: Block[]): Article {
  const out: Block[] = [];
  let chars = 0;
  for (const b of blocks) {
    if (out.length >= MAX_BLOCKS || chars >= MAX_CHARS) break;
    out.push(b);
    chars += b.text.length;
  }
  while (out.length && out[out.length - 1].t === "h") out.pop(); // শেষে ঝুলে থাকা হেডিং বাদ
  return { blocks: out, chars: out.reduce((n, b) => n + b.text.length, 0) };
}

function paragraphsOf(body: string): Block[] {
  const text = decode(
    body
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
  );
  let parts = text.split(/\n+/).map((s) => s.replace(/[\s\u00a0\u200b]+/g, " ").trim()).filter(Boolean);
  // নতুন লাইন ছাড়া এক লম্বা টুকরো হলে বাক্য ধরে ভাগ করি
  if (parts.length === 1 && parts[0].length > 700) {
    const sentences = parts[0].split(/(?<=[।.!?])\s+/);
    parts = [];
    let cur = "";
    for (const s of sentences) {
      if (cur && cur.length + s.length > 420) {
        parts.push(cur);
        cur = s;
      } else cur = cur ? `${cur} ${s}` : s;
    }
    if (cur) parts.push(cur);
  }
  return parts.filter((p) => !BOILER.test(p)).map((text) => ({ t: "p" as const, text }));
}

function fromJsonLd(html: string): Article | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let best = "";
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const type = Array.isArray(o["@type"]) ? o["@type"].join(",") : String(o["@type"] ?? "");
    if (/article|posting|report/i.test(type) && typeof o.articleBody === "string" && o.articleBody.length > best.length) {
      best = o.articleBody;
    }
    if (o["@graph"]) visit(o["@graph"]);
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      visit(JSON.parse(m[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "").trim()));
    } catch {
      /* ভাঙা JSON বাদ */
    }
  }
  if (best.length < 300) return null;
  const a = finish(paragraphsOf(best));
  return a.blocks.length >= 1 && a.chars >= 300 ? a : null;
}

function blocksFromRegion(region: string): Block[] {
  const blocks: Block[] = [];
  const seen = new Set<string>();
  const re = /<(p|h[2-4])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(region))) {
    const text = clean(m[2]);
    if (!text || seen.has(text)) continue;
    if (m[1].toLowerCase() === "p") {
      if (text.length < 30 || BOILER.test(text)) continue;
      seen.add(text);
      blocks.push({ t: "p", text });
    } else {
      if (STOP.test(text) && blocks.length >= 2) break;
      if (text.length < 4 || text.length > 140) continue;
      seen.add(text);
      blocks.push({ t: "h", text });
    }
  }
  return blocks;
}

function fromHtml(html: string): Article | null {
  const h = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|iframe|form|nav|header|footer|aside|button|select|template)\b[\s\S]*?<\/\1>/gi, " ");
  const regions: string[] = [];
  for (const m of h.matchAll(/<article\b[\s\S]*?<\/article>/gi)) regions.push(m[0]);
  const main = h.match(/<main\b[\s\S]*?<\/main>/i);
  if (main) regions.push(main[0]);
  regions.push(h);

  let best: Article | null = null;
  for (const r of regions) {
    const a = finish(blocksFromRegion(r));
    if (a.chars >= 400 && a.blocks.filter((b) => b.t === "p").length >= 2) {
      if (!best || a.chars > best.chars) best = a;
      // <article>/<main> এ ভালো লেখা পেলে পুরো পেজ খুঁজি না
      if (r !== h) break;
    }
  }
  return best;
}

export function extractArticle(html: string): Article | null {
  const ld = fromJsonLd(html);
  const dom = fromHtml(html);
  if (ld && (!dom || ld.chars >= dom.chars * 0.7)) return ld;
  return dom;
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") ||
    /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === "::1" || h.startsWith("[")
  );
}

function decodeBody(buf: ArrayBuffer, contentType: string): string {
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

// সোর্স সাইট থেকে খবর এনে লেখা বের করে। ব্যর্থ হলে (ব্লক, টাইমআউট, পেওয়াল) null।
export async function fetchArticle(url: string): Promise<Article | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if ((u.protocol !== "http:" && u.protocol !== "https:") || isPrivateHost(u.hostname)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AuNewsReader/1.0)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "bn,en;q=0.8",
      },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|xml/i.test(type)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 3_000_000) return null;
    return extractArticle(decodeBody(buf, type));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
