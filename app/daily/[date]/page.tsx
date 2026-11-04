import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DailyView from "@/components/DailyView";
import { getEdition, getEditions } from "@/lib/daily";
import { getDigests } from "@/lib/digest";

export const revalidate = 600;

type Props = { params: Promise<{ date: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params;
  const e = await getEdition(date);
  // অন্য সাইটের শিরোনামের তালিকা বলে noindex; ভেতরের এআই ব্রিফগুলো নিজ নিজ পেজে ইনডেক্স হয়
  return e ? { title: `আজকের বড় খবর — ${e.label}`, robots: { index: false, follow: true } } : {};
}

export default async function DailyDatePage({ params }: Props) {
  const { date } = await params;
  const [edition, all, digests] = await Promise.all([getEdition(date), getEditions(), getDigests()]);
  if (!edition) notFound();
  return <DailyView edition={edition} others={all.filter((e) => e.date !== edition.date)} liveDigestIds={digests.map((d) => d.id)} />;
}
