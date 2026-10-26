"use client";

import { useBookmarks } from "@/lib/bookmarks";
import NewsCard from "./NewsCard";

export default function SavedClient() {
  const { items, ids, toggle } = useBookmarks();
  return (
    <section>
      <p className="updated">সংরক্ষিত খবর শুধু এই ডিভাইসে থাকে।</p>
      {items.length === 0 ? (
        <p className="empty">এখনো কিছু সংরক্ষণ করা হয়নি। কার্ডের বুকমার্ক বাটনে চাপ দিন।</p>
      ) : (
        <ul className="list">
          {items.map((i) => (
            <NewsCard key={i.id} item={i} saved={ids.has(i.id)} onToggle={toggle} />
          ))}
        </ul>
      )}
    </section>
  );
}
