"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Item = { id: string; bn: string; href: string; icon: ReactNode };

const items: Item[] = [
  { id: "home", bn: "হোম", href: "/", icon: <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" /> },
  {
    id: "video",
    bn: "ভিডিও",
    href: "/video",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor" />
      </>
    ),
  },
  {
    id: "ai",
    bn: "এআই ব্রিফ",
    href: "/ai",
    icon: (
      <>
        <path d="M11 3.5l1.8 4.7 4.7 1.8-4.7 1.8L11 16.5l-1.8-4.7L4.5 10l4.7-1.8z" />
        <path d="M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
      </>
    ),
  },
  { id: "quick", bn: "দ্রুত", href: "/quick", icon: <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" /> },
  {
    id: "profile",
    bn: "প্রোফাইল",
    href: "/profile",
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20.5c0-3.8 3.6-6 8-6s8 2.2 8 6" />
      </>
    ),
  },
];

function activeId(path: string): string {
  if (path === "/video" || path.startsWith("/video/")) return "video";
  if (path === "/ai" || path.startsWith("/p/")) return "ai";
  if (path === "/quick") return "quick";
  if (path === "/profile") return "profile";
  return "home"; // হোম, ক্যাটাগরি, ট্রেন্ডিং, আজকের ১০, সার্চ, সংরক্ষিত
}

export default function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/n/")) return null; // খবর পড়ার পেজে নিজস্ব বার আছে
  const active = activeId(pathname);
  return (
    <nav className="bottomnav" aria-label="প্রধান মেনু">
      <div className="bottomnav-inner">
        {items.map((it) => (
          <Link key={it.id} href={it.href} className={it.id === active ? "bn-item active" : "bn-item"} aria-current={it.id === active ? "page" : undefined}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              {it.icon}
            </svg>
            <span>{it.bn}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
