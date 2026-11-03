import { readData } from "./github";
import type { DailyEdition } from "./types";

type DailyFile = { items?: DailyEdition[] };

// নতুন → পুরনো; ফাইল না থাকলে বা ত্রুটিতে খালি
export async function getEditions(): Promise<DailyEdition[]> {
  try {
    const data = await readData<DailyFile>("feeds/daily.json");
    return [...(data?.items ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1));
  } catch (e) {
    console.error("getEditions failed:", e);
    return [];
  }
}

export async function getEdition(date: string): Promise<DailyEdition | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return (await getEditions()).find((e) => e.date === date) ?? null;
}
