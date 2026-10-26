"use client";

import { useMemo, useState } from "react";
import { groupItems } from "@/lib/group";
import type { FeedItem } from "@/lib/types";
import GroupList from "./GroupList";

type Filter = "all" | "bd" | "intl";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "সব" },
  { id: "bd", label: "বাংলাদেশ" },
  { id: "intl", label: "আন্তর্জাতিক" },
];

export default function FeedList({ items, updatedLabel }: { items: FeedItem[]; updatedLabel?: string | null }) {
  const [scope, setScope] = useState<Filter>("all");
  const [source, setSource] = useState("all");

  const scoped = useMemo(() => (scope === "all" ? items : items.filter((i) => i.scope === scope)), [items, scope]);

  const sources = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of scoped) m.set(i.sourceId, i.sourceName);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [scoped]);

  const activeSource = sources.some(([id]) => id === source) ? source : "all";
  const shown = useMemo(
    () => (activeSource === "all" ? scoped : scoped.filter((i) => i.sourceId === activeSource)),
    [scoped, activeSource]
  );
  const groups = useMemo(() => groupItems(shown), [shown]);

  return (
    <section>
      <div className="filters">
        <div className="chips" role="group" aria-label="অঞ্চল ফিল্টার">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={scope === f.id ? "chip active" : "chip"}
              onClick={() => setScope(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {sources.length > 1 ? (
          <select
            className="select"
            aria-label="সোর্স"
            value={activeSource}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="all">সব সোর্স</option>
            {sources.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {updatedLabel ? <p className="updated">আপডেট: {updatedLabel}</p> : null}
      {groups.length === 0 ? (
        <p className="empty">এখনো কোনো খবর নেই। কিছুক্ষণ পর আবার দেখুন।</p>
      ) : (
        <GroupList groups={groups} />
      )}
    </section>
  );
}
