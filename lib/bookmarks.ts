import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { FeedItem } from "./types";

const KEY = "aunews:saved:v1";
const EVT = "aunews:saved";
const MAX = 200;

function readRaw(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

function parse(raw: string): FeedItem[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as FeedItem[]) : [];
  } catch {
    return [];
  }
}

// সংরক্ষিত খবর শুধু এই ডিভাইসের localStorage এ থাকে (৭ দিন পর সার্ভার থেকে মুছলেও এখানে থাকবে)
export function useBookmarks() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "[]");
  const items = useMemo(() => parse(raw), [raw]);
  const ids = useMemo(() => new Set(items.map((i) => i.id)), [items]);

  const toggle = useCallback((item: FeedItem) => {
    const current = parse(readRaw());
    const next = current.some((i) => i.id === item.id)
      ? current.filter((i) => i.id !== item.id)
      : [item, ...current].slice(0, MAX);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* স্টোরেজ ভরা/বন্ধ */
    }
    window.dispatchEvent(new Event(EVT));
  }, []);

  return { items, ids, toggle };
}
