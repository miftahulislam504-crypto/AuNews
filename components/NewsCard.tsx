"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import { toBn } from "@/lib/bn";
import { hueStyle, opensInApp } from "@/lib/reader";
import type { FeedItem } from "@/lib/types";

function ItemLink({
  item,
  forceExternal,
  className,
  children,
}: {
  item: FeedItem;
  forceExternal: boolean;
  className?: string;
  children: ReactNode;
}) {
  // prefetch বন্ধ: নইলে স্ক্রলে দেখা প্রতিটি কার্ডের জন্য সোর্স সাইট থেকে খবর আনা শুরু হবে
  if (!forceExternal && opensInApp(item)) {
    return (
      <Link href={`/n/${item.id}`} prefetch={false} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={item.link} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

function initial(name: string): string {
  return Array.from(name.trim())[0] ?? "•";
}

function uniqueSources(items: FeedItem[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const i of items) if (!seen.has(i.sourceId)) seen.set(i.sourceId, i.sourceName);
  return [...seen].map(([id, name]) => ({ id, name }));
}

export default function NewsCard({
  item,
  saved,
  onToggle,
  others,
  sourceCount,
  lead = false,
  forceExternal = false,
}: {
  item: FeedItem;
  saved: boolean;
  onToggle: (item: FeedItem) => void;
  others?: FeedItem[];
  sourceCount?: number;
  lead?: boolean;
  forceExternal?: boolean;
}) {
  const [imgOk, setImgOk] = useState(true);
  const title = item.titleBn ?? item.title;
  const summary = item.summaryBn ?? (item.titleBn ? "" : item.summary);
  const showImg = Boolean(item.image) && imgOk;
  const hasOthers = Boolean(others && others.length > 0);
  const sources = hasOthers ? uniqueSources([item, ...(others as FeedItem[])]) : [];
  const n = sourceCount ?? 1;
  const cls = ["card", lead ? "lead" : "", lead && !showImg ? "noimg" : ""].filter(Boolean).join(" ");

  return (
    <li className={cls}>
      <ItemLink item={item} forceExternal={forceExternal} className="card-link">
        <div className="card-body">
          <h2 className="card-title">{title}</h2>
          {item.titleBn ? (
            <p className="card-orig" lang="en">
              {item.title}
            </p>
          ) : null}
          {summary ? <p className="card-summary">{summary}</p> : null}
        </div>
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image as string}
            alt=""
            loading={lead ? "eager" : "lazy"}
            fetchPriority={lead ? "high" : undefined}
            referrerPolicy="no-referrer"
            className="card-img"
            onError={() => setImgOk(false)}
          />
        ) : null}
      </ItemLink>
      <div className="card-foot">
        <p className="card-meta">
          <span className="src" style={hueStyle(item.sourceId)}>
            {item.sourceName}
          </span>
          <time dateTime={new Date(item.publishedAt).toISOString()}>{item.timeLabel}</time>
          {item.titleBn ? <span className="badge ai">AI অনুবাদ</span> : null}
        </p>
        <button
          type="button"
          className={saved ? "save-btn on" : "save-btn"}
          aria-pressed={saved}
          aria-label={saved ? "সংরক্ষণ সরান" : "সংরক্ষণ করুন"}
          onClick={() => onToggle(item)}
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
      {hasOthers ? (
        <details className="more">
          <summary>
            <span className="stack" aria-hidden="true">
              {sources.slice(0, 4).map((s) => (
                <span key={s.id} className="stack-dot" style={hueStyle(s.id)}>
                  {initial(s.name)}
                </span>
              ))}
              {sources.length > 4 ? <span className="stack-dot stack-more">+{toBn(sources.length - 4)}</span> : null}
            </span>
            <span>{n > 1 ? `${toBn(n)}টি সোর্সে এই খবর` : `একই খবর আরও ${toBn((others as FeedItem[]).length)}টি`}</span>
            <svg className="chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <ul className="more-list">
            {(others as FeedItem[]).map((o) => (
              <li key={o.id}>
                <ItemLink item={o} forceExternal={forceExternal}>
                  <span className="more-src">{o.sourceName}</span>
                  {o.titleBn ?? o.title}
                </ItemLink>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}
