import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from "adhan";
import { toBn } from "./bn";
import { isInBangladesh } from "./places";

// নামাজের সময় ও সূর্যোদয়/সূর্যাস্ত ডিভাইসেই হিসাব হয় (adhan লাইব্রেরি), তাই কোনো সার্ভার বা key লাগে না।
// বাংলাদেশে: করাচি পদ্ধতি (ফজর/এশা ১৮°) + হানাফি আসর। স্থানীয় মসজিদের ঘোষিত সময়ের সঙ্গে ১–২ মিনিট অমিল হতে পারে।
export type PrayerId = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
export const PRAYERS: { id: PrayerId; bn: string }[] = [
  { id: "fajr", bn: "ফজর" },
  { id: "dhuhr", bn: "যোহর" },
  { id: "asr", bn: "আসর" },
  { id: "maghrib", bn: "মাগরিব" },
  { id: "isha", bn: "এশা" },
];

export interface DayTimes {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  sunset: Date;
  maghrib: Date;
  isha: Date;
}

function ymdInTz(now: Date, tz: string): [number, number, number] {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = s.split("-").map(Number);
  return [y, m, d];
}

// dayOffset: ০ = আজ, ১ = কাল (জায়গার নিজস্ব তারিখ ধরে)
export function timesFor(lat: number, lon: number, now: Date, tz: string, dayOffset = 0): DayTimes {
  const [y, m, d] = ymdInTz(now, tz);
  const date = new Date(y, m - 1, d + dayOffset);
  const params = isInBangladesh(lat, lon) ? CalculationMethod.Karachi() : CalculationMethod.MuslimWorldLeague();
  if (isInBangladesh(lat, lon)) params.madhab = Madhab.Hanafi;
  const t = new PrayerTimes(new Coordinates(lat, lon), date, params);
  return { fajr: t.fajr, sunrise: t.sunrise, dhuhr: t.dhuhr, asr: t.asr, sunset: t.sunset, maghrib: t.maghrib, isha: t.isha };
}

export function nextPrayer(lat: number, lon: number, now: Date, tz: string): { id: PrayerId; at: Date; tomorrow: boolean } {
  const today = timesFor(lat, lon, now, tz, 0);
  for (const p of PRAYERS) if (today[p.id].getTime() > now.getTime()) return { id: p.id, at: today[p.id], tomorrow: false };
  return { id: "fajr", at: timesFor(lat, lon, now, tz, 1).fajr, tomorrow: true };
}

// "৩:২৫ PM" (সংখ্যা বাংলা, সাইটের বাকি সময়ের মতো)
export function fmtTime(d: Date, tz: string): string {
  if (Number.isNaN(d.getTime())) return "—";
  const s = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
  return toBn(s);
}

export function methodLabel(lat: number, lon: number): string {
  return isInBangladesh(lat, lon) ? "করাচি পদ্ধতি, হানাফি আসর" : "মুসলিম ওয়ার্ল্ড লীগ পদ্ধতি";
}
