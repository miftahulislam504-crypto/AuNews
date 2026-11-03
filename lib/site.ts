import settings from "@/config/settings.json";

// কাস্টম ডোমেইন নিলে Vercel এ NEXT_PUBLIC_SITE_URL দিন (বা settings.json এর site.url বদলান)
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || settings.site.url).replace(/\/+$/, "");
export const SITE_NAME = settings.site.name;
