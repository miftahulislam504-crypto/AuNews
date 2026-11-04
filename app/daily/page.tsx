import type { Metadata } from "next";
import DailyView from "@/components/DailyView";
import { getEditions } from "@/lib/daily";
import { getDigests } from "@/lib/digest";

export const revalidate = 600;
export const metadata: Metadata = { title: "আজকের বড় খবর", robots: { index: false, follow: true } };

export default async function DailyPage() {
  const [all, digests] = await Promise.all([getEditions(), getDigests()]);
  const latest = all[0];
  if (!latest) return <p className="empty">আজকের তালিকা সকাল ৭টার পর তৈরি হয়। একটু পরে আবার দেখুন।</p>;
  return <DailyView edition={latest} others={all.slice(1)} liveDigestIds={digests.map((d) => d.id)} />;
}
