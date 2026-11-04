// ভিডিও ট্যাব: YouTube চ্যানেলের RSS (কোনো key লাগে না) থেকে সাম্প্রতিক ভিডিও আনে → feeds/videos.json।
// চ্যানেল ঠিকানা: config/video.json এ `channelId` (UC...) বা `handles` (@নাম; একাধিক দিলে সবগুলো ক্রমে চেষ্টা হয়)।
// ভুল চ্যানেলের ভিডিও যেন না ঢোকে, তাই `match` (নামের regex) মিললেই কেবল চ্যানেলটি নেওয়া হয়।
const DAY = 86400000;

export const VIDEO_DEFAULTS = { enabled: true, maxPerChannel: 6, maxItems: 120, skipShorts: true, channels: [] };

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decode(s) {
  return String(s ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      }
      return ENT[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function parseVideoFeed(xml) {
  const text = String(xml ?? "");
  const head = text.split("<entry>")[0] ?? "";
  const feedName = decode(head.match(/<author>\s*<name>([^<]*)<\/name>/)?.[1] ?? head.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
  const entries = [];
  for (const m of text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const id = e.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1];
    const title = decode(e.match(/<title>([\s\S]*?)<\/title>/)?.[1]);
    const publishedAt = Date.parse(e.match(/<published>([^<]+)<\/published>/)?.[1] ?? "");
    const href = e.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/)?.[1] ?? "";
    if (!id || !title || Number.isNaN(publishedAt)) continue;
    entries.push({ id, title, publishedAt, isShort: /\/shorts\//.test(href) });
  }
  return { feedName, entries };
}

// @handle → channel ID (UC...); না পেলে null
export async function resolveChannelId(handle, fetchText) {
  const h = `@${String(handle).trim().replace(/^@/, "")}`;
  if (!/^@[A-Za-z0-9._-]{3,60}$/.test(h)) return null;
  const html = await fetchText(`https://www.youtube.com/${h}`);
  const m =
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) ||
    html.match(/"externalId":"(UC[\w-]{22})"/) ||
    html.match(/itemprop="(?:identifier|channelId)" content="(UC[\w-]{22})"/);
  return m ? m[1] : null;
}

export async function defaultFetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NewsAggregatorBot/0.1)",
        "Accept-Language": "en-US,en;q=0.8",
        Cookie: "CONSENT=YES+1; SOCS=CAI",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

const sameItems = (a, b) => a.length === b.length && a.every((x, i) => x.id === b[i].id && x.title === b[i].title);

// store: loadVideos / saveVideos
export async function runVideos({ store, settings, config, fetchText = defaultFetchText, now = Date.now() }) {
  const cfg = { ...VIDEO_DEFAULTS, ...(config ?? {}) };
  const stats = { skipped: null, channelsOk: 0, failed: [], added: 0, total: 0 };
  if (!cfg.enabled) return { ...stats, skipped: "disabled" };
  const channels = (cfg.channels ?? []).filter((c) => c.enabled !== false);
  if (!channels.length) return { ...stats, skipped: "no_channels" };

  const cutoff = now - (settings.retention?.days ?? 1) * DAY;
  const state = (await store.loadVideos()) ?? {};
  const before = (state.items ?? []).filter((v) => v.publishedAt >= cutoff);
  const resolved = { ...(state.resolved ?? {}) };
  let resolvedChanged = false;
  const fresh = new Map();

  async function pullChannel(ch) {
    const candidates = [];
    if (ch.channelId) candidates.push({ cid: ch.channelId });
    else if (resolved[ch.id]?.channelId) candidates.push({ cid: resolved[ch.id].channelId, cached: true });
    else for (const h of ch.handles ?? (ch.handle ? [ch.handle] : [])) candidates.push({ handle: h });
    if (!candidates.length) throw new Error("channelId বা handles নেই");

    const re = ch.match ? new RegExp(ch.match, "i") : null;
    const errs = [];
    for (const c of candidates) {
      try {
        const cid = c.cid ?? (await resolveChannelId(c.handle, fetchText));
        if (!cid) { errs.push(`${c.handle}: ID পাওয়া যায়নি`); continue; }
        const feed = parseVideoFeed(await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`));
        if (re && !re.test(feed.feedName)) { errs.push(`${c.handle ?? cid}: নাম মেলেনি ("${feed.feedName}")`); continue; }
        if (!ch.channelId && resolved[ch.id]?.channelId !== cid) {
          resolved[ch.id] = { channelId: cid, name: feed.feedName };
          resolvedChanged = true;
        }
        const vids = feed.entries
          .filter((v) => v.publishedAt >= cutoff && !(cfg.skipShorts && v.isShort))
          .sort((a, b) => b.publishedAt - a.publishedAt)
          .slice(0, cfg.maxPerChannel);
        for (const v of vids) {
          fresh.set(v.id, { id: v.id, title: v.title, channelId: cid, channelKey: ch.id, channelName: ch.name || feed.feedName, publishedAt: v.publishedAt });
        }
        return;
      } catch (e) {
        errs.push(`${c.handle ?? c.cid}: ${String(e?.message || e)}`);
        if (c.cached) { delete resolved[ch.id]; resolvedChanged = true; }
      }
    }
    throw new Error(errs.join("; "));
  }

  const BATCH = 4;
  for (let i = 0; i < channels.length; i += BATCH) {
    await Promise.all(
      channels.slice(i, i + BATCH).map(async (ch) => {
        try {
          await pullChannel(ch);
          stats.channelsOk++;
        } catch (e) {
          stats.failed.push(`${ch.id}: ${String(e?.message || e)}`);
        }
      })
    );
  }

  const known = new Set(before.map((v) => v.id));
  stats.added = [...fresh.keys()].filter((id) => !known.has(id)).length;
  const byId = new Map(before.map((v) => [v.id, v]));
  for (const [id, v] of fresh) byId.set(id, v);
  const items = [...byId.values()].sort((a, b) => b.publishedAt - a.publishedAt).slice(0, cfg.maxItems);
  stats.total = items.length;

  if (!sameItems(items, state.items ?? []) || resolvedChanged) {
    await store.saveVideos({ items, resolved, updatedAt: now });
  }
  return stats;
}
