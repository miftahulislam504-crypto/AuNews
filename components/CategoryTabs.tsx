"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import categories from "@/config/categories.json";

const tabs = [
  { id: "all", bn: "সর্বশেষ", href: "/" },
  { id: "daily", bn: "আজকের ১০", href: "/daily" },
  { id: "trending", bn: "ট্রেন্ডিং", href: "/trending" },
  { id: "ai", bn: "এআই ব্রিফ", href: "/ai" },
  ...categories.map((c) => ({ id: c.id, bn: c.bn, href: `/c/${c.id}` })),
];

export default function CategoryTabs() {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  return (
    <nav className="tabs" ref={ref} aria-label="ক্যাটাগরি">
      {tabs.map((t) => {
        const active = pathname === t.href || (t.id === "daily" && pathname.startsWith("/daily/"));
        return (
          <Link key={t.id} href={t.href} className={active ? "tab active" : "tab"} aria-current={active ? "page" : undefined}>
            {t.bn}
          </Link>
        );
      })}
    </nav>
  );
}
