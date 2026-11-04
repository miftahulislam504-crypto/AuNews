import type { Metadata } from "next";
import VideoList from "@/components/VideoList";
import { getVideos } from "@/lib/videos";

export const revalidate = 600;
export const metadata: Metadata = {
  title: "ভিডিও",
  description: "সংবাদমাধ্যমগুলোর গত ২৪ ঘণ্টার ভিডিও",
  robots: { index: false, follow: true }, // অন্য চ্যানেলের ভিডিওর তালিকা, তাই noindex
};

export default async function VideoPage() {
  const items = await getVideos();
  return (
    <>
      <h1 className="page-title">ভিডিও</h1>
      <p className="updated">নিউজ চ্যানেলগুলোর গত ২৪ ঘণ্টার ভিডিও। ছবিতে ট্যাপ করলে এখানেই চলবে; ভিডিও ও চ্যানেলের স্বত্ব মূল চ্যানেলের।</p>
      {items.length === 0 ? <p className="empty">এখনো কোনো ভিডিও আসেনি। কিছুক্ষণ পর আবার দেখুন।</p> : <VideoList items={items} />}
    </>
  );
}
