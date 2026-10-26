import type { MetadataRoute } from "next";
import settings from "@/config/settings.json";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${settings.site.name} — ${settings.site.tagline}`,
    short_name: settings.site.name,
    description: settings.site.tagline,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0b5fff",
    lang: "bn",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "খুঁজুন", url: "/search" },
      { name: "সংরক্ষিত", url: "/saved" },
    ],
  };
}
