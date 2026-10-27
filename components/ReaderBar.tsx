"use client";

import { useRouter } from "next/navigation";
import { useBookmarks } from "@/lib/bookmarks";
import type { FeedItem } from "@/lib/types";

export default function ReaderBar({ item }: { item: FeedItem }) {
  const router = useRouter();
  const { ids, toggle } = useBookmarks();
  const saved = ids.has(item.id);
  return (
    <div className="reader-bar">
      <button
        type="button"
        className="back-btn"
        onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        ফিরে যান
      </button>
      <button
        type="button"
        className={saved ? "save-btn on" : "save-btn"}
        aria-pressed={saved}
        aria-label={saved ? "সংরক্ষণ সরান" : "সংরক্ষণ করুন"}
        onClick={() => toggle(item)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"
            fill={saved ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
