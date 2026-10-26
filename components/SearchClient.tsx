"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useBookmarks } from "@/lib/bookmarks";
import { buildHaystack, matches } from "@/lib/search";
import { formatTimeLabel } from "@/lib/time";
import type { FeedItem, SlimItem } from "@/lib/types";
import NewsCard from "./NewsCard";

const LIMIT = 100;

function toFeedItem(r: SlimItem): FeedItem {
  return {
    id: r.id, title: r.t, summary: r.s, link: r.u, sourceId: r.k, sourceName: r.n,
    lang: r.l, scope: r.p, category: r.c, image: r.i, publishedAt: r.d, timeLabel: formatTimeLabel(r.d),
    titleBn: r.tb, summaryBn: r.sb,
  };
}

export default function SearchClient() {
  const [data, setData] = useState<FeedItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q);
  const { ids, toggle } = useBookmarks();

  useEffect(() => {
    let alive = true;
    fetch("/api/search-index")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
      .then((rows: SlimItem[]) => {
        if (alive) setData(rows.map(toFeedItem));
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const haystacks = useMemo(() => (data ? data.map(buildHaystack) : []), [data]);

  const results = useMemo(() => {
    if (!data || !deferred.trim()) return [];
    const out: FeedItem[] = [];
    for (let i = 0; i < data.length && out.length < LIMIT; i++) {
      if (matches(haystacks[i], deferred)) out.push(data[i]);
    }
    return out;
  }, [data, haystacks, deferred]);

  return (
    <section>
      <input
        className="search-input"
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoFocus
        placeholder="শিরোনাম, সোর্স বা শব্দ লিখুন"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="খবর খুঁজুন"
      />
      {failed ? (
        <p className="empty">সার্চ লোড হয়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।</p>
      ) : !data ? (
        <p className="empty">লোড হচ্ছে…</p>
      ) : !q.trim() ? (
        <p className="empty">গত ৭ দিনের সাম্প্রতিক খবরে খুঁজুন।</p>
      ) : results.length === 0 ? (
        <p className="empty">কিছু পাওয়া যায়নি।</p>
      ) : (
        <>
          <p className="updated">{results.length}টি ফলাফল{results.length >= LIMIT ? " (প্রথম ১০০টি)" : ""}</p>
          <ul className="list">
            {results.map((i) => (
              <NewsCard key={i.id} item={i} saved={ids.has(i.id)} onToggle={toggle} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
