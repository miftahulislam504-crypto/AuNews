import Link from "next/link";
import { opensInApp } from "@/lib/reader";
import type { FeedItem } from "@/lib/types";

// হোমের উপরের লাল "সর্বশেষ খবর" বার
export default function BreakingTicker({ item }: { item?: FeedItem }) {
  if (!item) return null;
  const inner = (
    <>
      <span className="ticker-tag">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
          <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />
        </svg>
        সর্বশেষ খবর
      </span>
      <span className="ticker-text">{item.titleBn ?? item.title}</span>
      <svg className="ticker-chev" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5l7 7-7 7" />
      </svg>
    </>
  );
  return opensInApp(item) ? (
    <Link href={`/n/${item.id}`} prefetch={false} className="ticker">
      {inner}
    </Link>
  ) : (
    <a href={item.link} target="_blank" rel="noopener noreferrer" className="ticker">
      {inner}
    </a>
  );
}
