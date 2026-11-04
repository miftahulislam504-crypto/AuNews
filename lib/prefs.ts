import { useCallback, useMemo, useSyncExternalStore } from "react";
import { DEFAULT_PLACE, districtPlace, type Place } from "./places";

// "দ্রুত" পেজে কে কী দেখবেন আর কোন এলাকার তথ্য — ডিভাইসের localStorage এ থাকে (লগইন লাগে না)।
export type WidgetId = "weather" | "sun" | "prayer" | "fx" | "football" | "cricket";

export const WIDGETS: { id: WidgetId; bn: string; hint: string }[] = [
  { id: "weather", bn: "আবহাওয়া", hint: "তাপমাত্রা, আর্দ্রতা, বৃষ্টির সম্ভাবনা" },
  { id: "sun", bn: "সূর্যোদয় ও সূর্যাস্ত", hint: "আপনার এলাকার আজকের সময়" },
  { id: "prayer", bn: "নামাজের সময়সূচি", hint: "ফজর থেকে এশা, পরবর্তী ওয়াক্তসহ" },
  { id: "fx", bn: "ডলারের দাম", hint: "১ মার্কিন ডলার = কত টাকা" },
  { id: "football", bn: "ফুটবল", hint: "আজকের ফলাফল ও আসন্ন ম্যাচ" },
  { id: "cricket", bn: "ক্রিকেট", hint: "আজকের ফলাফল ও আসন্ন ম্যাচ" },
];

export interface Prefs {
  v: 1;
  place: Place;
  widgets: Record<WidgetId, boolean>;
}

export const DEFAULT_PREFS: Prefs = {
  v: 1,
  place: DEFAULT_PLACE,
  widgets: { weather: true, sun: true, prayer: true, fx: true, football: true, cricket: true },
};

const KEY = "aunews:prefs:v1";
const EVT = "aunews:prefs";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// বাইরে থেকে আসা (localStorage / ক্লাউড) ডেটা যাচাই; ভুল অংশ ডিফল্টে ফেরে
export function sanitizePrefs(x: unknown): Prefs {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const widgets = { ...DEFAULT_PREFS.widgets };
  const w = (o.widgets && typeof o.widgets === "object" ? o.widgets : {}) as Record<string, unknown>;
  for (const id of Object.keys(widgets) as WidgetId[]) if (typeof w[id] === "boolean") widgets[id] = w[id] as boolean;

  let place: Place = DEFAULT_PLACE;
  const p = (o.place && typeof o.place === "object" ? o.place : {}) as Record<string, unknown>;
  if (p.kind === "district" && typeof p.id === "string") place = districtPlace(p.id) ?? DEFAULT_PLACE;
  else if (p.kind === "gps" && isNum(p.lat) && isNum(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180) {
    place = { kind: "gps", name: typeof p.name === "string" && p.name ? p.name.slice(0, 40) : "আপনার অবস্থান", lat: p.lat, lon: p.lon };
  }
  return { v: 1, place, widgets };
}

function readRaw(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function parse(raw: string): Prefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    return sanitizePrefs(JSON.parse(raw));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function readPrefs(): Prefs {
  return parse(readRaw());
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* প্রাইভেট মোডে সেভ নাও হতে পারে */
  }
  window.dispatchEvent(new Event(EVT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function usePrefs() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const prefs = useMemo(() => parse(raw), [raw]);
  const update = useCallback((patch: Partial<Prefs> | ((cur: Prefs) => Prefs)) => {
    const cur = readPrefs();
    savePrefs(sanitizePrefs(typeof patch === "function" ? patch(cur) : { ...cur, ...patch }));
  }, []);
  return { prefs, update };
}

const noop = () => () => {};
// সার্ভারে/হাইড্রেশনের সময় false, ক্লায়েন্টে true — localStorage-নির্ভর UI এর জন্য
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
