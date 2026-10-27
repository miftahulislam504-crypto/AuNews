import type { CSSProperties } from "react";
import settings from "@/config/settings.json";

// খবর অ্যাপের ভেতরে খুলবে কি না (বন্ধ করলে বা তালিকায় থাকা সোর্স হলে সরাসরি মূল সাইটে যায়)
export function opensInApp(item: { sourceId: string }): boolean {
  if (!settings.reader.enabled) return false;
  return !(settings.reader.externalSources as string[]).includes(item.sourceId);
}

// সোর্স-ভেদে স্থির রঙ (sourceId থেকে hue)
export function hueStyle(id: string): CSSProperties {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return { "--h": h } as CSSProperties;
}
