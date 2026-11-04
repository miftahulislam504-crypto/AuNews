// ফেসবুক পেজে স্বয়ংক্রিয় ছবি-পোস্ট: নিউজ-কার্ড (ছবির ওপর শিরোনাম) + ক্যাপশনে মূল লেখা।
// Graph API: POST /{page-id}/photos (multipart)। Page Access Token লাগে; অনুমতি: pages_manage_posts, pages_read_engagement।
// সময়: প্রতি ৬০ মিনিটে একটি পোস্ট। ওয়ার্কফ্লো প্রতি ৩০ মিনিটে চলে; এখানে "ঘণ্টার স্লট" ধরে এক স্লটে একটিই যায়
// (দেরি হলেও সময় সরে সরে যায় না; কোনো রান ব্যর্থ হলে একই স্লটের পরের রানে আবার চেষ্টা হয়)।
import { toBn, dhaka } from "./daily.mjs";

const MIN = 60000;
const HOUR = 3600000;
const DAY = 24 * HOUR;
const HAS_BN = /[\u0980-\u09FF]/;

export const FB_DEFAULTS = {
  enabled: true,
  intervalMinutes: 60, // দুটি পোস্টের ব্যবধান (স্লটের দৈর্ঘ্য)
  maxAgeHours: 12, // এর চেয়ে পুরনো খবর পোস্ট হয় না
  dailyMax: 30, // দিনে সর্বোচ্চ পোস্ট (নিরাপত্তা সীমা)
  maxTries: 3, // একই খবরে এতবার ব্যর্থ হলে ছেড়ে দিই
  maxAttempts: 2, // এক রানে সর্বোচ্চ কয়টি খবর চেষ্টা
  fallbackToNews: true, // নতুন এআই ব্রিফ না থাকলে একাধিক সোর্সে আসা সাধারণ খবর থেকে
  newsMinSources: 2,
  requirePhoto: true, // খবরের আসল ছবি না মিললে পোস্ট নয় (ব্র্যান্ড-ব্যাকগ্রাউন্ডের কার্ড নয়); false দিলে আগের মতো ফলব্যাক কার্ড যায়
  hashtags: ["#AuNews"],
  apiVersion: "v25.0",
};

export class FbError extends Error {
  constructor(kind, message, retryAfterMs = null) {
    super(message);
    this.kind = kind; // rate_limit | config | bad_request | transient | render
    this.retryAfterMs = retryAfterMs;
  }
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

// ---------- ক্যাপশন (প্লেইন টেক্সট; ফেসবুকে HTML চলে না) ----------
export function formatDigestCaption(d, siteUrl, hashtags = FB_DEFAULTS.hashtags) {
  const url = `${siteUrl}/p/${d.id}`;
  const parts = [clip(oneLine(d.lead), 600)];
  const pts = (d.points ?? []).slice(0, 3).map((p) => `• ${clip(oneLine(p.t), 220)}`);
  if (pts.length) parts.push(pts.join("\n"));
  if (d.conflict) parts.push(`⚠️ সূত্রে অমিল: ${clip(oneLine(d.conflict), 300)}`);
  parts.push(`📰 ${toBn(d.sourceCount)}টি সোর্স থেকে সংকলিত\n🔗 সোর্সসহ পুরো ব্রিফ: ${url}`);
  if (hashtags.length) parts.push(hashtags.join(" "));
  return parts.filter(Boolean).join("\n\n");
}

export function formatNewsCaption(n, siteUrl, hashtags = FB_DEFAULTS.hashtags) {
  const parts = [];
  if (n.summary) parts.push(clip(oneLine(n.summary), 400));
  const src = n.sourceName ? `📰 সূত্র: ${n.sourceName}\n` : "";
  parts.push(`${src}🔗 পুরো খবর: ${n.link}`);
  parts.push(`🌐 আরও খবর: ${siteUrl}`);
  if (hashtags.length) parts.push(hashtags.join(" "));
  return parts.filter(Boolean).join("\n\n");
}

// ---------- Graph API ক্লায়েন্ট ----------
function classifyError(status, json) {
  const e = json?.error ?? {};
  const code = Number(e.code);
  const sub = Number(e.error_subcode);
  const msg = String(e.message ?? `HTTP ${status}`).slice(0, 220);
  const tag = Number.isFinite(code) ? `#${code}${Number.isFinite(sub) ? `/${sub}` : ""} ${msg}` : msg;
  // টোকেন অচল/মেয়াদোত্তীর্ণ, অনুমতি নেই, পেজ আইডি ভুল, পোস্ট সাময়িক বন্ধ
  if (code === 190 || code === 10 || (code >= 200 && code <= 299) || code === 368 || code === 459 || code === 464) return new FbError("config", tag);
  if (code === 100 && /does not exist|missing permissions|Unsupported (post|get) request|Invalid OAuth/i.test(msg)) return new FbError("config", tag);
  if ([4, 17, 32, 613].includes(code) || (code >= 80000 && code <= 80014) || status === 429) return new FbError("rate_limit", tag, 30 * MIN);
  if (e.is_transient || code === 1 || code === 2 || code === 341 || status >= 500) return new FbError("transient", tag);
  if (status === 401 || status === 403) return new FbError("config", tag);
  return new FbError("bad_request", tag);
}

export function createFacebookClient({ pageId, token, apiVersion = FB_DEFAULTS.apiVersion, fetchImpl = fetch, timeoutMs = 60000 }) {
  return {
    // image: Buffer (JPEG/PNG)। ফেরত: post id
    async postPhoto({ image, caption, altText }) {
      const form = new FormData();
      form.append("source", new Blob([image], { type: "image/jpeg" }), "card.jpg");
      form.append("caption", caption);
      form.append("published", "true");
      if (altText) form.append("alt_text_custom", clip(oneLine(altText), 900));
      form.append("access_token", token); // URL এ নয়, বডিতে; ফলে লগে টোকেন আসে না
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res;
      try {
        res = await fetchImpl(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(pageId)}/photos`, {
          method: "POST",
          body: form,
          signal: ctrl.signal,
        });
      } catch (e) {
        throw new FbError("transient", `network: ${e?.name || "error"}`);
      } finally {
        clearTimeout(timer);
      }
      let json = null;
      try {
        json = await res.json();
      } catch {
        /* বডি নেই */
      }
      if (res.ok && json && (json.post_id || json.id)) return json.post_id ?? json.id;
      throw classifyError(res.status, json);
    },
  };
}

// ---------- প্রার্থী বাছাই ----------
const bnTitle = (it) => (it.lang === "bn" ? it.title : it.titleBn || "");
const bnSummary = (it) => (it.lang === "bn" ? it.summary || "" : it.summaryBn || "");

function digestCandidates({ digests, posted, tries, cfg, now }) {
  return digests
    .filter((d) => d.headline && d.createdAt >= now - cfg.maxAgeHours * HOUR)
    .filter((d) => !posted[`d:${d.id}`] && !(d.clusterId && posted[`c:${d.clusterId}`]) && (tries[`d:${d.id}`] || 0) < cfg.maxTries)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((d) => ({
      kind: "digest",
      key: `d:${d.id}`,
      marks: [`d:${d.id}`, ...(d.clusterId ? [`c:${d.clusterId}`] : [])],
      headline: d.headline,
      imageUrl: d.image || null,
      pageUrls: (d.sources ?? []).map((x) => x.link).filter(Boolean), // RSS এ ছবি না থাকলে এসব পেজের og:image
      caption: (siteUrl, tags) => formatDigestCaption(d, siteUrl, tags),
    }));
}

// একাধিক সোর্সে আসা ঘটনা (ক্লাস্টার), বাংলা শিরোনাম ও ছবি আছে এমন; বেশি সোর্স আগে, তারপর নতুন
function newsCandidates({ items, posted, tries, cfg, now }) {
  const byCluster = new Map();
  for (const it of items) {
    if (!it.clusterId || it.publishedAt < now - cfg.maxAgeHours * HOUR) continue;
    const b = byCluster.get(it.clusterId);
    if (b) b.push(it);
    else byCluster.set(it.clusterId, [it]);
  }
  const out = [];
  for (const [clusterId, members] of byCluster) {
    const sourceCount = new Set(members.map((m) => m.sourceId)).size;
    if (sourceCount < cfg.newsMinSources) continue;
    const key = `c:${clusterId}`;
    if (posted[key] || (tries[key] || 0) >= cfg.maxTries) continue;
    const sorted = [...members].sort((a, b) => b.publishedAt - a.publishedAt);
    // বাংলা শিরোনাম লাগবে; ছবিসহ আইটেম আগে (ছবি না থাকলে সোর্স-পেজের og:image খোঁজা হবে)
    const rep = sorted.find((m) => m.image && HAS_BN.test(bnTitle(m))) ?? sorted.find((m) => HAS_BN.test(bnTitle(m)));
    if (!rep) continue;
    out.push({
      sourceCount,
      latest: rep.publishedAt,
      cand: {
        kind: "news",
        key,
        marks: [key],
        headline: bnTitle(rep),
        imageUrl: rep.image || null,
        imageUrls: sorted.map((m) => m.image).filter(Boolean),
        pageUrls: [rep.link, ...sorted.map((m) => m.link)].filter(Boolean),
        caption: (siteUrl, tags) => formatNewsCaption({ summary: bnSummary(rep), sourceName: rep.sourceName, link: rep.link }, siteUrl, tags),
      },
    });
  }
  return out.sort((a, b) => b.sourceCount - a.sourceCount || b.latest - a.latest).map((x) => x.cand);
}

// store: loadDigests / loadSnapshots / loadFacebook / saveFacebook
// render({ headline, imageUrl, dateLabel }) → Buffer (JPEG)
export async function runFacebook({ store, client, render, settings, siteUrl, now = Date.now(), dryRun = false }) {
  const cfg = { ...FB_DEFAULTS, ...(settings.facebook ?? {}) };
  const stats = { sent: 0, errors: [], skipped: null, preview: [], source: null };
  if (!cfg.enabled) return { ...stats, skipped: "disabled" };

  const state = (await store.loadFacebook()) ?? {};
  let pausedUntil = state.pausedUntil || 0;
  if (!dryRun && now < pausedUntil) return { ...stats, skipped: "paused" };

  const slotMs = Math.max(1, cfg.intervalMinutes) * MIN;
  const slot = Math.floor(now / slotMs);
  if (!dryRun && state.lastSlot === slot) return { ...stats, skipped: "not_due" };

  const today = new Date(now).toISOString().slice(0, 10);
  const usage = state.usage?.day === today ? { ...state.usage } : { day: today, count: 0 };
  if (!dryRun && usage.count >= cfg.dailyMax) return { ...stats, skipped: "daily_limit" };

  const posted = {};
  for (const [k, t] of Object.entries(state.posted ?? {})) if (now - t < 3 * DAY) posted[k] = t;
  const tries = {};
  for (const [k, n] of Object.entries(state.tries ?? {})) if (posted[k] === undefined) tries[k] = n;

  const digests = ((await store.loadDigests()) ?? {}).items ?? [];
  let queue = digestCandidates({ digests, posted, tries, cfg, now });
  if (cfg.fallbackToNews) {
    const snap = (await store.loadSnapshots(["all"])).get("all") ?? [];
    queue = queue.concat(newsCandidates({ items: snap, posted, tries, cfg, now }));
  }
  if (!queue.length) {
    if (!dryRun) await store.saveFacebook({ ...state, posted, tries, usage, pausedUntil: pausedUntil > now ? pausedUntil : 0, updatedAt: now });
    return { ...stats, skipped: "no_candidate" };
  }

  const dateLabel = dhaka(now).label;
  const tags = Array.isArray(cfg.hashtags) ? cfg.hashtags : [];
  let attempts = 0;
  let done = false;
  let lastPostAt = state.lastPostAt || 0;
  let lastSlot = state.lastSlot ?? null;

  for (const job of queue) {
    if (attempts >= cfg.maxAttempts) break;
    attempts++;
    try {
      let image;
      try {
        image = await render({
          headline: job.headline,
          imageUrl: job.imageUrl,
          imageUrls: job.imageUrls ?? [],
          pageUrls: job.pageUrls ?? [],
          dateLabel,
          requirePhoto: cfg.requirePhoto,
        });
      } catch (e) {
        throw new FbError("render", `কার্ড তৈরি ব্যর্থ: ${String(e?.message ?? e).slice(0, 200)}`);
      }
      const caption = job.caption(siteUrl, tags);
      if (dryRun) {
        stats.preview.push({ kind: job.kind, headline: job.headline, caption, image });
        stats.source = job.kind;
        done = true;
        break;
      }
      await client.postPhoto({ image, caption, altText: job.headline });
    } catch (e) {
      const kind = e?.kind ?? "transient";
      stats.errors.push(`${kind}: ${e?.message ?? e}`);
      if (kind === "rate_limit") {
        pausedUntil = now + Math.min(Math.max(e.retryAfterMs ?? 30 * MIN, 5 * MIN), HOUR);
        break;
      }
      if (kind === "config") {
        pausedUntil = now + 6 * HOUR;
        break;
      }
      tries[job.key] = (tries[job.key] || 0) + 1;
      if (kind === "transient") break; // নেটওয়ার্ক/সার্ভার সমস্যা: পরের রানে (একই স্লটে) আবার
      continue; // bad_request / render: পরের খবর
    }
    for (const k of job.marks) posted[k] = now;
    usage.count++;
    stats.sent++;
    stats.source = job.kind;
    lastPostAt = now;
    lastSlot = slot;
    done = true;
    break;
  }
  if (!done && !stats.skipped && !stats.errors.length) stats.skipped = "no_candidate";

  if (!dryRun) {
    await store.saveFacebook({ posted, tries, usage, lastPostAt, lastSlot, pausedUntil: pausedUntil > now ? pausedUntil : 0, updatedAt: now });
  }
  return stats;
}
