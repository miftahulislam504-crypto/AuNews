import FeedList from "@/components/FeedList";
import { getFeed } from "@/lib/feed";

import type { Metadata } from "next";

export const revalidate = 600;
export const metadata: Metadata = { alternates: { canonical: "/" } };

// স্ন্যাপশটে এর চেয়ে বেশি খবর থাকে (ট্রেন্ডিং-এর জন্য); হোমে পেজ হালকা রাখতে সর্বশেষ এতগুলোই পাঠাই
const HOME_LIMIT = 150;

// হোম = শুধু "সর্বশেষ" খবরের তালিকা। আবহাওয়া/ডলার/ম্যাচ "দ্রুত" পেজে, এআই ব্রিফ নিচের মেনুর "এআই ব্রিফ" এ,
// আজকের বড় খবর উপরের "আজকের ১০" ট্যাবে।
export default async function Home() {
  const { items, updatedLabel } = await getFeed("all");
  return (
    <>
      <h1 className="page-title">সর্বশেষ</h1>
      <p className="updated">
        AuNews একটি স্বয়ংক্রিয় ই-নিউজপেপার: বাংলাদেশ ও বিশ্বের একাধিক সংবাদমাধ্যমের খবর প্রতি ৩০ মিনিটে নিজে থেকে সংগ্রহ হয়, আর একই ঘটনার খবর মিলিয়ে এআই লেখে সংক্ষিপ্ত ব্রিফ, মূল সোর্সের লিংকসহ।
      </p>
      <FeedList items={items.slice(0, HOME_LIMIT)} updatedLabel={updatedLabel} />
    </>
  );
}
