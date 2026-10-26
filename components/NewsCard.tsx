"use client";

import { useState } from "react";
import type { FeedItem } from "@/lib/types";

export default function NewsCard({
  item,
  saved,
  onToggle,
  others,
  sourceCount,
}: {
  item: FeedItem;
  saved: boolean;
  onToggle: (item: FeedItem) => void;
  others?: FeedItem[];
  sourceCount?: number;
}) {
  const [imgOk, setImgOk] = useState(true);
  const title = item.titleBn ?? item.title;
  const summary = item.summaryBn ?? (item.titleBn ? "" : item.summary);
  return (
    <li className="card">
      <a href={item.link} target="_blank" rel="noopener noreferrer" className="card-link">
        <div className="card-body">
          <h2 className="card-title">{title}</h2>
          {item.titleBn ? (
            <p className="card-orig" lang="en">
              {item.title}
            </p>
          ) : null}
          {summary ? <p className="card-summary">{summary}</p> : null}
        </div>
        {item.image && imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="card-img"
            onError={() => setImgOk(false)}
          />
        ) : null}
      </a>
      <div className="card-foot">
        <p className="card-meta">
          <span>{item.sourceName}</span>
          <span aria-hidden="true">·</span>
          <time>{item.timeLabel}</time>
          {sourceCount && sourceCount > 1 ? <span className="badge">{sourceCount}টি সোর্স</span> : null}
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
      {others && others.length > 0 ? (
        <details className="more">
          <summary>একই খবর আরও {others.length}টি</summary>
          <ul className="more-list">
            {others.map((o) => (
              <li key={o.id}>
                <a href={o.link} target="_blank" rel="noopener noreferrer">
                  <span className="more-src">{o.sourceName}</span>
                  {o.titleBn ?? o.title}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}
