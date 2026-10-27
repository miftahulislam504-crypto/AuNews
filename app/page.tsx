import FeedList from "@/components/FeedList";
import { getFeed } from "@/lib/feed";

export const revalidate = 600;

// স্ন্যাপশটে এর চেয়ে বেশি খবর থাকে (ট্রেন্ডিং-এর জন্য); হোমে পেজ হালকা রাখতে সর্বশেষ এতগুলোই পাঠাই
const HOME_LIMIT = 150;

export default async function Home() {
  const { items, updatedLabel } = await getFeed("all");
  return (
    <>
      <h1 className="page-title">সর্বশেষ</h1>
      <FeedList items={items.slice(0, HOME_LIMIT)} updatedLabel={updatedLabel} />
    </>
  );
}
