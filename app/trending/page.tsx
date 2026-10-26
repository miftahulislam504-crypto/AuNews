import type { Metadata } from "next";
import GroupList from "@/components/GroupList";
import { getTrending } from "@/lib/feed";

export const revalidate = 600;
export const metadata: Metadata = { title: "ট্রেন্ডিং" };

export default async function TrendingPage() {
  const { groups, updatedLabel } = await getTrending();
  return (
    <>
      <h1 className="page-title">ট্রেন্ডিং</h1>
      <p className="updated">
        যে খবর একাধিক সোর্সে এসেছে{updatedLabel ? ` · আপডেট: ${updatedLabel}` : ""}
      </p>
      {groups.length === 0 ? (
        <p className="empty">এখনো কোনো ট্রেন্ডিং খবর নেই। কিছুক্ষণ পর আবার দেখুন।</p>
      ) : (
        <GroupList groups={groups} />
      )}
    </>
  );
}
