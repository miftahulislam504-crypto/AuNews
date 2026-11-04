import type { Metadata, Viewport } from "next";
import { Hind_Siliguri, Noto_Serif_Bengali } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import settings from "@/config/settings.json";
import BottomNav from "@/components/BottomNav";
import CategoryTabs from "@/components/CategoryTabs";
import DateLine from "@/components/DateLine";
import HeaderActions from "@/components/HeaderActions";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// UI লেখা: Hind Siliguri, শিরোনাম: Noto Serif Bengali (next/font নিজেই হোস্ট করে, বাইরের রিকোয়েস্ট লাগে না)
const ui = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-ui",
});
const serif = Noto_Serif_Bengali({
  subsets: ["bengali", "latin"],
  weight: ["700"],
  display: "swap",
  variable: "--font-serif",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${settings.site.name} — ${settings.site.tagline}`, template: `%s | ${settings.site.name}` },
  description: settings.site.tagline,
  applicationName: settings.site.name,
  openGraph: { type: "website", siteName: settings.site.name, locale: "bn_BD", description: settings.site.tagline },
  twitter: { card: "summary" },
  alternates: { types: { "application/rss+xml": "/feed.xml" } },
  // Search Console / Bing Webmaster যাচাইয়ের কোড Vercel → Environment Variables এ দিন
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // PWA তে নিচের মেনু যেন ফোনের নিচের বারের নিচে না ঢোকে (safe-area)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0b4f3c" },
    { media: "(prefers-color-scheme: dark)", color: "#0a2f25" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bn" className={`${ui.variable} ${serif.variable}`}>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">
              {settings.site.name}
            </Link>
            <DateLine />
            <HeaderActions />
          </div>
          <CategoryTabs />
        </header>
        <main className="container">{children}</main>
        <footer className="footer">
          <p className="footer-tag" lang="en">
            {settings.site.taglineEn}
          </p>
          <p className="footer-note" lang="en">
            Each story belongs to its original source. A link to the original is provided with every story.
          </p>
          <p className="footer-note">
            <Link href="/about">আমাদের সম্পর্কে</Link> · <Link href="/ai">এআই ব্রিফ</Link> · <a href="/feed.xml">RSS</a>
          </p>
        </footer>
        <BottomNav />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
