import type { Metadata } from "next";
import QuickClient from "@/components/QuickClient";
import { getFx } from "@/lib/info";
import { getMatches } from "@/lib/matches";

export const revalidate = 300;
export const metadata: Metadata = { title: "দ্রুত", robots: { index: false, follow: true } };

// ডলার ও ম্যাচ সবার জন্য এক (সার্ভারে ক্যাশ)। আবহাওয়া, সূর্যোদয়/সূর্যাস্ত, নামাজের সময় ব্যবহারকারীর নিজের এলাকা ধরে ডিভাইসে বানানো হয়।
export default async function QuickPage() {
  const [fx, matches] = await Promise.all([getFx(), getMatches()]);
  return <QuickClient fx={fx} matches={matches} />;
}
