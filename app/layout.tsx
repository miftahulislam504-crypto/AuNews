import type { Metadata, Viewport } from "next";
import { Hind_Siliguri, Noto_Serif_Bengali } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import settings from "@/config/settings.json";
import CategoryTabs from "@/components/CategoryTabs";
import DateLine from "@/components/DateLine";
import HeaderActions from "@/components/HeaderActions";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
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
  title: { default: settings.site.name, template: `%s | ${settings.site.name}` },
  description: settings.site.tagline,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
          <p className="footer-tag">{settings.site.tagline}</p>
          <p className="footer-note">
            খবরের স্বত্ব সংশ্লিষ্ট সোর্সের। প্রতিটি খবরের নিচে মূল লিংক দেওয়া আছে।
          </p>
        </footer>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
