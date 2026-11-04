import settings from "@/config/settings.json";
import { readData } from "./github";
import { formatTimeLabel } from "./time";
import type { VideoItem, VideoView } from "./types";

const DAY = 86400000;

type VideoFile = { items?: VideoItem[]; updatedAt?: number };

// নতুন → পুরনো; রিটেনশন (২৪ ঘণ্টা) পেরোনো ভিডিও সাইটে সঙ্গে সঙ্গে লুকায়, ingest ফাইল থেকেও সরায়
export async function getVideos(): Promise<VideoView[]> {
  try {
    const data = await readData<VideoFile>("feeds/videos.json");
    const cutoff = Date.now() - settings.retention.days * DAY;
    return (data?.items ?? [])
      .filter((v) => v.publishedAt >= cutoff && /^[\w-]{11}$/.test(v.id))
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .map((v) => ({ ...v, timeLabel: formatTimeLabel(v.publishedAt) }));
  } catch (e) {
    console.error("getVideos failed:", e);
    return [];
  }
}
