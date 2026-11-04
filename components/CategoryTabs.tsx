"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import categories from "@/config/categories.json";

const tabs = [
  { id: "all", bn: "সর্বশেষ", href: "/" },
  { id: "daily", bn: "আজকের ১০", href: "/daily" },
  { id: "trending", bn: "ট্রেন্ডিং", href: "/trending" },
  ...categories.map((c) => ({ id: c.id, bn: c.bn, href: `/c/${c.id}` })),
];

// ট্যাব-বার শুধু খবরের তালিকার পেজে (হোম, আজকের ১০, ট্রেন্ডিং, ক্যাটাগরি); ভিডিও/দ্রুত/প্রোফাইল ইত্যাদিতে নিচের মেনুই যথেষ্ট
const showOn = (p: string) => p === "/" || p === "/daily" || p.startsWith("/daily/") || p === "/trending" || p.startsWith("/c/");

export default function CategoryTabs() {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);
  const visible = showOn(pathname);

  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  if (!visible) return null;

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
