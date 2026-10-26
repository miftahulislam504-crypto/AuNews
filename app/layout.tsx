import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import settings from "@/config/settings.json";
import CategoryTabs from "@/components/CategoryTabs";
import HeaderActions from "@/components/HeaderActions";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: settings.site.name, template: `%s | ${settings.site.name}` },
  description: settings.site.tagline,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b5fff",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bn">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">
              {settings.site.name}
            </Link>
            <span className="tagline">{settings.site.tagline}</span>
            <HeaderActions />
          </div>
          <CategoryTabs />
        </header>
        <main className="container">{children}</main>
        <footer className="footer">
          শিরোনাম ও সংক্ষিপ্ত সারাংশ সংশ্লিষ্ট সোর্স থেকে নেওয়া। পুরো খবরের স্বত্ব সোর্সের; পড়তে মূল লিংকে যান।
        </footer>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
