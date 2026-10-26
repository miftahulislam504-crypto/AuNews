"use client";

import { useBookmarks } from "@/lib/bookmarks";
import type { Group } from "@/lib/group";
import NewsCard from "./NewsCard";

export default function GroupList({ groups }: { groups: Group[] }) {
  const { ids, toggle } = useBookmarks();
  return (
    <ul className="list">
      {groups.map((g) => (
        <NewsCard
          key={g.rep.id}
          item={g.rep}
          others={g.others}
          sourceCount={g.sourceCount}
          saved={ids.has(g.rep.id)}
          onToggle={toggle}
        />
      ))}
    </ul>
  );
}
