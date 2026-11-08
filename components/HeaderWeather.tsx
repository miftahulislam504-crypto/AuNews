"use client";

import { useEffect, useState } from "react";
import { toBn } from "@/lib/bn";
import type { Weather } from "@/lib/info";

// হেডারের উপরের স্ট্রিপে ঢাকার তাপমাত্রা; আবহাওয়া না পেলে কিছুই দেখায় না
export default function HeaderWeather() {
  const [temp, setTemp] = useState<number | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/weather?lat=23.8&lon=90.4", { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Weather>) : Promise.reject(new Error(String(r.status)))))
      .then((w) => setTemp(w.temp))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  if (temp === null) return null;
  return (
    <span className="wx">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="#ffc83d" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4.2" fill="#ffc83d" />
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
      </svg>
      {toBn(temp)}°C ঢাকা
    </span>
  );
}
