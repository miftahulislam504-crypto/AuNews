"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toBn } from "@/lib/bn";
import type { Fx, Weather } from "@/lib/info";
import type { Match, MatchesData, Sport } from "@/lib/matches";
import { placeTimeZone } from "@/lib/places";
import { PRAYERS, fmtTime, methodLabel, nextPrayer, timesFor } from "@/lib/prayer";
import { useHydrated, usePrefs } from "@/lib/prefs";

const DAY = 86400000;
const MIN = 60000;

// ঘণ্টা-মিনিট বাংলায় ("১ ঘণ্টা ২০ মিনিট")
function span(ms: number): string {
  const total = Math.max(0, Math.round(ms / MIN));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0 && m === 0) return "এখনই";
  return `${h ? `${toBn(h)} ঘণ্টা ` : ""}${m ? `${toBn(m)} মিনিট` : ""}`.trim();
}

// ম্যাচের সময় সবসময় ঢাকার সময়ে, ইংরেজিতে ("Today 5:30 PM")
function whenLabel(ms: number, now: number): string {
  const idx = (t: number) => Math.floor((t + 6 * 3600000) / DAY);
  const diff = idx(ms) - idx(now);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dhaka", hour: "numeric", minute: "2-digit", hour12: true })
    .format(new Date(ms))
    .replace(/\u202f/g, " ");
  if (diff === 0) return `Today ${time}`;
  if (diff === 1) return `Tomorrow ${time}`;
  const d = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short" }).format(new Date(ms));
  return `${d}, ${time}`;
}

function MatchRow({ m, now }: { m: Match; now: number }) {
  const upcoming = m.state === "upcoming";
  return (
    <li className="match">
      {m.competition ? <p className="match-comp">{m.competition}</p> : null}
      <div className="match-row">
        <span className="match-team">{m.home}</span>
        <span className="match-score">{upcoming ? "" : (m.homeScore ?? "–")}</span>
      </div>
      <div className="match-row">
        <span className="match-team">{m.away}</span>
        <span className="match-score">{upcoming ? "" : (m.awayScore ?? "–")}</span>
      </div>
      <p className={m.state === "live" ? "match-note live" : "match-note"}>{upcoming ? whenLabel(m.startsAt, now) : m.note}</p>
    </li>
  );
}

function SportCard({ sport, matches, now }: { sport: Sport; matches: Match[]; now: number }) {
  const mine = matches.filter((m) => m.sport === sport);
  const groups: [string, Match[]][] = [
    ["Live", mine.filter((m) => m.state === "live")],
    ["Today's Results", mine.filter((m) => m.state === "result")],
    ["Upcoming Matches", mine.filter((m) => m.state === "upcoming")],
  ];
  const any = groups.some(([, l]) => l.length > 0);
  return (
    <section className="q-card" aria-label={sport === "cricket" ? "Cricket" : "Football"} lang="en">
      <h2 className="q-h">{sport === "cricket" ? "Cricket" : "Football"}</h2>
      {any ? (
        groups.map(([title, list]) =>
          list.length ? (
            <div key={title}>
              <h3 className="q-h3">{title}</h3>
              <ul className="match-list">
                {list.map((m) => (
                  <MatchRow key={m.id} m={m} now={now} />
                ))}
              </ul>
            </div>
          ) : null
        )
      ) : (
        <p className="q-sub">No match information for today.</p>
      )}
    </section>
  );
}

export default function QuickClient({ fx, matches }: { fx: Fx | null; matches: MatchesData | null }) {
  const hydrated = useHydrated();
  const { prefs } = usePrefs();
  const [now, setNow] = useState(() => Date.now());
  const [wx, setWx] = useState<{ key: string; data: Weather | null } | null>(null);

  const { place, widgets } = prefs;
  const key = `${place.lat},${place.lon}`;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!hydrated || !widgets.weather) return;
    const ctrl = new AbortController();
    fetch(`/api/weather?lat=${place.lat}&lon=${place.lon}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Weather>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => setWx({ key, data }))
      .catch((e) => {
        if (!ctrl.signal.aborted) setWx({ key, data: null });
        void e;
      });
    return () => ctrl.abort();
  }, [hydrated, widgets.weather, place.lat, place.lon, key]);

  if (!hydrated) {
    return (
      <>
        <h1 className="page-title">দ্রুত</h1>
        <div className="q-card q-skel" aria-hidden="true" />
        <div className="q-card q-skel" aria-hidden="true" />
      </>
    );
  }

  const tz = placeTimeZone(place);
  const nowD = new Date(now);
  const today = widgets.sun || widgets.prayer ? timesFor(place.lat, place.lon, nowD, tz) : null;
  const next = widgets.prayer ? nextPrayer(place.lat, place.lon, nowD, tz) : null;
  const w = wx && wx.key === key ? wx : null; // অন্য এলাকার পুরনো উত্তর দেখাই না
  const sports = (["cricket", "football"] as const).filter((s) => widgets[s]);
  const allOff = !widgets.weather && !widgets.sun && !widgets.prayer && !widgets.fx && sports.length === 0;

  return (
    <>
      <h1 className="page-title">দ্রুত</h1>
      <p className="q-place">
        <strong>{place.name}</strong> এলাকার তথ্য · <Link href="/profile">এলাকা ও কার্ড বদলান</Link>
      </p>

      {allOff ? <p className="empty">সব কার্ড বন্ধ আছে। প্রোফাইল থেকে যা দেখতে চান চালু করুন।</p> : null}

      {widgets.weather ? (
        <section className="q-card" aria-label="আবহাওয়া">
          <h2 className="q-h">আবহাওয়া</h2>
          {!w ? (
            <p className="q-sub">আবহাওয়া আনা হচ্ছে…</p>
          ) : !w.data ? (
            <p className="q-sub">আবহাওয়া এখন পাওয়া যাচ্ছে না। কিছুক্ষণ পর আবার দেখুন।</p>
          ) : (
            <>
              <p className="q-big">
                <span className="q-num">{toBn(w.data.temp)}°সে</span>
                {w.data.label ? <span className="q-label">{w.data.label}</span> : null}
              </p>
              <p className="q-sub">
                {[
                  w.data.max !== null && w.data.min !== null ? `আজ সর্বোচ্চ ${toBn(w.data.max)}° · সর্বনিম্ন ${toBn(w.data.min)}°` : "",
                  w.data.rain !== null ? `বৃষ্টির সম্ভাবনা ${toBn(w.data.rain)}%` : "",
                  w.data.humidity !== null ? `আর্দ্রতা ${toBn(w.data.humidity)}%` : "",
                  w.data.wind !== null ? `বাতাস ${toBn(w.data.wind)} কিমি/ঘ` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </>
          )}
        </section>
      ) : null}

      {widgets.sun && today ? (
        <section className="q-card" aria-label="সূর্যোদয় ও সূর্যাস্ত">
          <h2 className="q-h">সূর্যোদয় ও সূর্যাস্ত</h2>
          <div className="q-pair">
            <p>
              <span className="q-k">সূর্যোদয়</span>
              <span className="q-num">{fmtTime(today.sunrise, tz)}</span>
            </p>
            <p>
              <span className="q-k">সূর্যাস্ত</span>
              <span className="q-num">{fmtTime(today.sunset, tz)}</span>
            </p>
          </div>
          <p className="q-sub">দিনের দৈর্ঘ্য {span(today.sunset.getTime() - today.sunrise.getTime())}</p>
        </section>
      ) : null}

      {widgets.prayer && today && next ? (
        <section className="q-card" aria-label="নামাজের সময়সূচি">
          <h2 className="q-h">নামাজের সময়সূচি</h2>
          <p className="q-sub q-next">
            পরবর্তী: <strong>{PRAYERS.find((p) => p.id === next.id)?.bn}</strong>
            {next.tomorrow ? " (কাল)" : ""} · {fmtTime(next.at, tz)} · আর {span(next.at.getTime() - now)}
          </p>
          <ol className="prayer-list">
            {PRAYERS.map((p) => (
              <li key={p.id} className={p.id === next.id ? "prayer on" : "prayer"} aria-current={p.id === next.id ? "true" : undefined}>
                <span>{p.bn}</span>
                <span>{fmtTime(today[p.id], tz)}</span>
              </li>
            ))}
          </ol>
          <p className="q-foot">হিসাব: {methodLabel(place.lat, place.lon)}। স্থানীয় মসজিদের ঘোষিত সময়ের সঙ্গে ১–২ মিনিট অমিল হতে পারে।</p>
        </section>
      ) : null}

      {widgets.fx ? (
        <section className="q-card" aria-label="ডলারের দাম">
          <h2 className="q-h">ডলারের দাম</h2>
          {fx ? (
            <>
              <p className="q-big">
                <span className="q-num">{toBn(fx.rate.toFixed(2))} টাকা</span>
                <span className="q-label">১ মার্কিন ডলার</span>
              </p>
              <p className="q-sub">
                বাজারদর (দিনে একবার হালনাগাদ) ·{" "}
                <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">
                  Rates By Exchange Rate API
                </a>
              </p>
            </>
          ) : (
            <p className="q-sub">ডলারের দাম এখন পাওয়া যাচ্ছে না।</p>
          )}
        </section>
      ) : null}

      {matches ? sports.map((s) => <SportCard key={s} sport={s} matches={matches.matches} now={now} />) : null}
    </>
  );
}
