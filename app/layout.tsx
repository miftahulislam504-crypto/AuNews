import type { Metadata, Viewport } from "next";
import { Hind_Siliguri } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import settings from "@/config/settings.json";
import BottomNav from "@/components/BottomNav";
import CategoryTabs from "@/components/CategoryTabs";
import DateLine from "@/components/DateLine";
import HeaderActions from "@/components/HeaderActions";
import HeaderWeather from "@/components/HeaderWeather";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import SocialLinks from "@/components/SocialLinks";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// সব লেখা: Hind Siliguri (next/font নিজেই হোস্ট করে, বাইরের রিকোয়েস্ট লাগে না)
const ui = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-ui",
});

// গুগলের সার্চ রেজাল্টে যে বর্ণনা দেখাবে (১৫০ অক্ষরের কাছাকাছি রাখুন)
const DESC =
  "বাংলাদেশ ও বিশ্বের সব খবর, প্রতি ৩০ মিনিটে নিজে থেকে হালনাগাদ হয় যে স্বয়ংক্রিয় ই-নিউজপেপারে। একাধিক সংবাদমাধ্যমের খবর মিলিয়ে এআই ব্রিফ, মূল সোর্সের লিংকসহ।";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${settings.site.name} — ${settings.site.tagline}`, template: `%s | ${settings.site.name}` },
  description: DESC,
  applicationName: settings.site.name,
  openGraph: { type: "website", siteName: settings.site.name, locale: "bn_BD", description: DESC },
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
    { media: "(prefers-color-scheme: light)", color: "#001B4D" },
    { media: "(prefers-color-scheme: dark)", color: "#001B4D" },
  ],
};

// গুগলকে সাইটের নাম জানায়: সার্চ রেজাল্টে "Vercel" এর বদলে "AuNews" দেখানোর জন্য
const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: settings.site.name,
  alternateName: `${settings.site.name} — ${settings.site.tagline}`,
  url: `${SITE_URL}/`,
  inLanguage: "bn",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bn" className={ui.variable}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
        <header className="site-head">
          <div className="topstrip">
            <div className="strip-in">
              <DateLine />
              <HeaderWeather />
              <SocialLinks />
            </div>
          </div>
          <div className="mast">
            <div className="mast-in">
              <Link href="/" className="brand" aria-label={`${settings.site.name} — হোম`}>
                <Image src="/logo.png" alt={settings.site.name} width={580} height={320} priority />
              </Link>
              <HeaderActions />
            </div>
          </div>
        </header>
        <CategoryTabs />
        <main className="container">{children}</main>
        <footer className="footer">
          <div className="footer-in">
            <Image src="/logo.png" alt={settings.site.name} width={580} height={320} className="footer-logo" />
            <SocialLinks className="social social-foot" />
            <p className="footer-tag" lang="en">
              {settings.site.taglineEn}
            </p>
            <p className="footer-note" lang="en">
              Each story belongs to its original source. A link to the original is provided with every story.
            </p>
            <p className="footer-note">
              <Link href="/about">আমাদের সম্পর্কে</Link> · <Link href="/ai">এআই ব্রিফ</Link> · <a href="/feed.xml">RSS</a>
            </p>
          </div>
        </footer>
        <BottomNav />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
