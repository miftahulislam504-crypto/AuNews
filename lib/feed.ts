import categories from "@/config/categories.json";
import settings from "@/config/settings.json";
import { getDb } from "./firebaseAdmin";
import { groupItems, type Group } from "./group";
import { formatTimeLabel } from "./time";
import type { FeedItem, SlimItem, StoredItem } from "./types";

const DAY = 86400000;

// ক্যাটাগরি স্ন্যাপশট (feeds/{id}) এক ডকুমেন্ট পড়ে — রিড খরচ ন্যূনতম।
export async function getFeed(
  categoryId: string
): Promise<{ items: FeedItem[]; updatedAt: number | null; updatedLabel: string | null }> {
  try {
    const snap = await getDb().collection("feeds").doc(categoryId).get();
    if (!snap.exists) return { items: [], updatedAt: null, updatedLabel: null };
    const data = snap.data() as { items?: StoredItem[]; updatedAt?: number };
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

// সার্চের জন্য সব স্ন্যাপশট মিলিয়ে ইউনিক তালিকা (১১টি ডকুমেন্ট রিড, ১০ মিনিটে একবার)
export async function getSearchIndex(): Promise<SlimItem[]> {
  try {
    const db = getDb();
    const ids = ["all", ...categories.map((c) => c.id)];
    const snaps = await db.getAll(...ids.map((id) => db.collection("feeds").doc(id)));
    const cutoff = Date.now() - settings.retention.days * DAY;
    const byId = new Map<string, StoredItem>();
    for (const s of snaps) {
      if (!s.exists) continue;
      const items = ((s.data() as { items?: StoredItem[] }).items ?? []) as StoredItem[];
      for (const it of items) if (it.publishedAt >= cutoff && !byId.has(it.id)) byId.set(it.id, it);
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
