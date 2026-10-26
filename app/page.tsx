import FeedList from "@/components/FeedList";
import { getFeed } from "@/lib/feed";

export const revalidate = 600;

export default async function Home() {
  const { items, updatedLabel } = await getFeed("all");
  return (
    <>
      <h1 className="page-title">সর্বশেষ</h1>
      <FeedList items={items} updatedLabel={updatedLabel} />
    </>
  );
}
