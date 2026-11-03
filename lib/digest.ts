import settings from "@/config/settings.json";
import { readData } from "./github";
import { formatTimeLabel } from "./time";
import type { Digest, DigestView } from "./types";

const DAY = 86400000;

type DigestFile = { items?: Digest[]; updatedAt?: number };

function view(d: Digest): DigestView {
  return { ...d, timeLabel: formatTimeLabel(d.publishedAt) };
}

// নতুন → পুরনো; ফাইল না থাকলে বা ত্রুটিতে খালি তালিকা (সাইট ভাঙে না)
export async function getDigests(limit?: number): Promise<DigestView[]> {
  try {
    const data = await readData<DigestFile>("feeds/digest.json");
    const cutoff = Date.now() - settings.retention.days * DAY;
    const items = (data?.items ?? [])
      .filter((d) => d.publishedAt >= cutoff)
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .map(view);
    return limit ? items.slice(0, limit) : items;
  } catch (e) {
    console.error("getDigests failed:", e);
    return [];
  }
}

export async function getDigest(id: string): Promise<DigestView | null> {
  if (!/^[a-f0-9]{20}$/.test(id)) return null;
  const all = await getDigests();
  return all.find((d) => d.id === id) ?? null;
}

// কোনো খবর কোনো এআই ব্রিফের অংশ হলে সেই ব্রিফ (খবরের পেজ থেকে লিংকের জন্য)
export async function getDigestForCluster(clusterId: string | undefined): Promise<DigestView | null> {
  if (!clusterId) return null;
  const all = await getDigests();
  return all.find((d) => d.clusterId === clusterId) ?? null;
}
