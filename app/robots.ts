import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // /n/, /saved, /search robots.txt এ বন্ধ করা হয়নি ইচ্ছা করেই: বন্ধ থাকলে গুগল পেজের noindex ট্যাগটাই দেখতে পায় না
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
