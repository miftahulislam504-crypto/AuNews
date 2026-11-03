// টেলিগ্রাম চ্যানেলে স্বয়ংক্রিয় পোস্ট: সকালে "আজকের বড় খবর" এবং নতুন এআই ব্রিফ।
// Bot API: sendMessage (parse_mode=HTML)। বট চ্যানেলের অ্যাডমিন ও "Post messages" অনুমতি পাওয়া হতে হবে।
import { toBn, dhaka } from "./daily.mjs";

const HOUR = 3600000;
const DAY = 24 * HOUR;
const LIMIT = 3800; // টেলিগ্রামের সীমা ৪০৯৬; নিরাপদ মার্জিন

export const TG_DEFAULTS = {
  enabled: true,
  maxAgeHours: 6, // শুধু এর চেয়ে নতুন ব্রিফ পোস্ট হয়; চালু করার দিন পুরনো ব্রিফের বন্যা ঠেকায়
  maxPerRun: 3,
  dailyMax: 25,
  delayMs: 1500,
  maxTries: 3,
};

export class TgError extends Error {
  constructor(kind, message, retryAfterMs = null) {
    super(message);
    this.kind = kind; // rate_limit | config | bad_request | transient
    this.retryAfterMs = retryAfterMs;
  }
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export function formatDigest(d, siteUrl) {
  const url = `${siteUrl}/p/${d.id}`;
  const head = `🤖 <b>এআই ব্রিফ</b>\n<b>${esc(d.headline)}</b>\n\n${esc(d.lead)}`;
  const conflict = d.conflict ? `\n\n⚠️ <b>সূত্রে অমিল:</b> ${esc(d.conflict)}` : "";
  const foot = `\n\n📰 ${toBn(d.sourceCount)}টি সোর্স থেকে · <a href="${escAttr(url)}">সোর্সসহ পুরো ব্রিফ</a>`;
  for (let n = Math.min(3, d.points.length); n >= 0; n--) {
    const pts = n ? "\n\n" + d.points.slice(0, n).map((p) => `• ${esc(p.t)}`).join("\n") : "";
    const msg = head + pts + conflict + foot;
    if (msg.length <= LIMIT) return msg;
  }
  return `🤖 <b>এআই ব্রিফ</b>\n<b>${esc(clip(d.headline, 200))}</b>\n\n${esc(clip(d.lead, 600))}` + foot;
}

export function formatDaily(edition, siteUrl) {
  const n = edition.stories.length;
  const lines = edition.stories.map((s) => {
    const href = s.digestId ? `${siteUrl}/p/${s.digestId}` : s.link;
    const title = esc(clip(s.headline, 110));
    const tag = s.digestId ? " 🤖" : "";
    const label = href ? `<a href="${escAttr(href)}">${title}</a>` : title;
    return `${toBn(s.rank)}. ${label}${tag}\n    ${toBn(s.sourceCount)}টি সোর্স${s.sourceName ? ` · ${esc(s.sourceName)}` : ""}`;
  });
  const foot = `\n\n<a href="${escAttr(`${siteUrl}/daily/${edition.date}`)}">সবগুলো একসাথে দেখুন</a>\n🤖 = এআই ব্রিফ (সোর্সসহ)`;
  let msg = `<b>আজকের ${toBn(n)}টি বড় খবর</b> · ${esc(edition.label)}\n\n` + lines.join("\n\n") + foot;
  while (msg.length > LIMIT && lines.length > 1) {
    lines.pop();
    msg = `<b>আজকের বড় খবর</b> · ${esc(edition.label)}\n\n` + lines.join("\n\n") + foot;
  }
  return msg;
}

export function createTelegramClient({ token, chatId, fetchImpl = fetch, timeoutMs = 15000 }) {
  return {
    async send(html) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res;
      try {
        res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
          signal: ctrl.signal,
        });
      } catch (e) {
        // বার্তায় URL (মানে টোকেন) যেন না যায়, তাই শুধু ত্রুটির নাম
        throw new TgError("transient", `network: ${e?.name || "error"}`);
      } finally {
        clearTimeout(timer);
      }
      let json = null;
      try {
        json = await res.json();
      } catch {
        /* বডি নেই */
      }
      if (res.ok && json?.ok) return json.result?.message_id ?? null;
      const desc = String(json?.description ?? `HTTP ${res.status}`).slice(0, 200);
      if (res.status === 429) {
        const s = Number(json?.parameters?.retry_after);
        throw new TgError("rate_limit", desc, Number.isFinite(s) && s > 0 ? s * 1000 : 30000);
      }
      if (res.status === 401 || res.status === 403 || res.status === 404) throw new TgError("config", desc);
      if (res.status === 400 && /chat not found|not enough rights|not a member|write.?forbidden|have no rights/i.test(desc)) throw new TgError("config", desc);
      if (res.status >= 500) throw new TgError("transient", desc);
      throw new TgError("bad_request", desc);
    },
  };
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// store: loadDigests / loadDaily / loadTelegram / saveTelegram
export async function runTelegram({ store, client, settings, siteUrl, now = Date.now(), sleep = defaultSleep, dryRun = false }) {
  const cfg = { ...TG_DEFAULTS, ...(settings.telegram ?? {}) };
  const stats = { sent: 0, daily: 0, errors: [], skipped: null, preview: [] };
  if (!cfg.enabled) return { ...stats, skipped: "disabled" };

  const state = (await store.loadTelegram()) ?? {};
  let pausedUntil = state.pausedUntil || 0;
  if (now < pausedUntil) return { ...stats, skipped: "paused" };

  const today = new Date(now).toISOString().slice(0, 10);
  const usage = state.usage?.day === today ? { ...state.usage } : { day: today, count: 0 };
  const posted = {};
  for (const [k, t] of Object.entries(state.posted ?? {})) if (now - t < 3 * DAY) posted[k] = t;
  const dailyPosted = Object.fromEntries(Object.entries(state.dailyPosted ?? {}).slice(-10));
  const tries = { ...(state.tries ?? {}) };

  const digests = (((await store.loadDigests()) ?? {}).items ?? []);
  const editions = (((await store.loadDaily()) ?? {}).items ?? []);
  const edition = editions.find((e) => e.date === dhaka(now).date && !dailyPosted[e.date]);

  const queue = [];
  const covered = new Set();
  if (edition) {
    for (const s of edition.stories) if (s.digestId) covered.add(s.digestId);
    queue.push({ kind: "daily", key: `d:${edition.date}`, date: edition.date, html: formatDaily(edition, siteUrl) });
  }
  const fresh = digests
    .filter((d) => d.createdAt >= now - cfg.maxAgeHours * HOUR && !posted[d.id] && !covered.has(d.id) && (tries[d.id] || 0) < cfg.maxTries)
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const d of fresh) queue.push({ kind: "digest", key: d.id, html: formatDigest(d, siteUrl) });

  let digestsSent = 0, failures = 0, first = true;
  for (const job of queue) {
    if (usage.count >= cfg.dailyMax) { stats.skipped = "daily_limit"; break; }
    if (job.kind === "digest" && digestsSent >= cfg.maxPerRun) break;
    if (!first && !dryRun) await sleep(cfg.delayMs);
    first = false;
    try {
      if (dryRun) stats.preview.push(job.html);
      else await client.send(job.html);
    } catch (e) {
      const kind = e?.kind ?? "transient";
      stats.errors.push(`${kind}: ${e?.message ?? e}`);
      if (kind === "rate_limit") {
        pausedUntil = now + Math.min(Math.max(e.retryAfterMs ?? 30000, 5000), HOUR);
        break;
      }
      if (kind === "config") {
        pausedUntil = now + 6 * HOUR;
        break;
      }
      tries[job.key] = (tries[job.key] || 0) + 1;
      if (job.kind === "daily" && tries[job.key] >= cfg.maxTries) dailyPosted[job.date] = now; // বারবার ব্যর্থ হলে ছেড়ে দিই
      if (++failures >= 2) break;
      continue;
    }
    failures = 0;
    usage.count++;
    stats.sent++;
    if (job.kind === "daily") {
      dailyPosted[job.date] = now;
      for (const id of covered) posted[id] = now; // রাউন্ডআপে লিংক আছে; আলাদা করে আবার পোস্ট নয়
      stats.daily++;
    } else {
      posted[job.key] = now;
      digestsSent++;
    }
  }

  if (!dryRun) await store.saveTelegram({ posted, dailyPosted, tries, usage, pausedUntil: pausedUntil > now ? pausedUntil : 0, updatedAt: now });
  return stats;
}
