import categories from "@/config/categories.json";
import settings from "@/config/settings.json";
import { readData } from "./github";
import { groupItems, type Group } from "./group";
import { formatTimeLabel } from "./time";
import type { FeedItem, SlimItem, StoredItem } from "./types";

const DAY = 86400000;

type Snapshot = { items?: StoredItem[]; updatedAt?: number };

// ক্যাটাগরি স্ন্যাপশট (feeds/{id}.json) — ingest এটি প্রতি ৩০ মিনিটে হালনাগাদ করে
export async function getFeed(
  categoryId: string
): Promise<{ items: FeedItem[]; updatedAt: number | null; updatedLabel: string | null }> {
  try {
    const data = await readData<Snapshot>(`feeds/${categoryId}.json`);
    if (!data) return { items: [], updatedAt: null, updatedLabel: null };
    const cutoff = Date.now() - settings.retention.days * DAY;
    const items = (data.items ?? [])
      .filter((i) => i.publishedAt >= cutoff)
      .map((i) => ({ ...i, timeLabel: formatTimeLabel(i.publishedAt) }));
    const updatedAt = data.updatedAt ?? null;
    return { items, updatedAt, updatedLabel: updatedAt ? formatTimeLabel(updatedAt) : null };
  } catch (e) {
    console.error("getFeed failed:", e);
    return { items: [], updatedAt: null, updatedLabel: null };
  }
}

// সার্চের জন্য সব স্ন্যাপশট মিলিয়ে ইউনিক তালিকা (১১টি ফাইল, ১০ মিনিটে একবার)
export async function getSearchIndex(): Promise<SlimItem[]> {
  try {
    const ids = ["all", ...categories.map((c) => c.id)];
    const snaps = await Promise.all(ids.map((id) => readData<Snapshot>(`feeds/${id}.json`)));
    const cutoff = Date.now() - settings.retention.days * DAY;
    const byId = new Map<string, StoredItem>();
    for (const s of snaps) {
      for (const it of s?.items ?? []) if (it.publishedAt >= cutoff && !byId.has(it.id)) byId.set(it.id, it);
    }
    return [...byId.values()]
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .map((i) => ({
        id: i.id, t: i.title, s: i.summary, u: i.link, n: i.sourceName, k: i.sourceId,
        c: i.category, p: i.scope, l: i.lang, i: i.image, d: i.publishedAt,
        ...(i.titleBn ? { tb: i.titleBn } : {}),
        ...(i.summaryBn ? { sb: i.summaryBn } : {}),
      }));
  } catch (e) {
    console.error("getSearchIndex failed:", e);
    return [];
  }
}

// ট্রেন্ডিং: গত N ঘণ্টায় কমপক্ষে M টি আলাদা সোর্সে আসা ঘটনা (feeds/all এক ডকুমেন্ট রিড)
export async function getTrending(): Promise<{ groups: Group[]; updatedLabel: string | null }> {
  const { items, updatedLabel } = await getFeed("all");
  const c = settings.cluster;
  const since = Date.now() - c.trendingWindowHours * 3600000;
  const groups = groupItems(items.filter((i) => i.publishedAt >= since))
    .filter((g) => g.sourceCount >= c.trendingMinSources)
    .sort((a, b) => b.sourceCount - a.sourceCount || b.latest - a.latest)
    .slice(0, c.trendingLimit);
  return { groups, updatedLabel };
}

// একটি খবর আইডি দিয়ে খোঁজা (ইন-অ্যাপ রিডারের জন্য) — সব স্ন্যাপশটে খোঁজে
export async function getItem(id: string): Promise<FeedItem | null> {
  if (!/^[a-f0-9]{20}$/.test(id)) return null;
  try {
    const ids = ["all", ...categories.map((c) => c.id)];
    const snaps = await Promise.all(ids.map((x) => readData<Snapshot>(`feeds/${x}.json`)));
    for (const s of snaps) {
      const it = s?.items?.find((i) => i.id === id);
      if (it) return { ...it, timeLabel: formatTimeLabel(it.publishedAt) };
    }
    return null;
  } catch (e) {
    console.error("getItem failed:", e);
    return null;
  }
}
