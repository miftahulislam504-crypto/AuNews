"use client";

import Link from "next/link";
import { useState } from "react";
import { DIVISIONS, districtPlace, placeFromCoords } from "@/lib/places";
import { WIDGETS, useHydrated, usePrefs, type WidgetId } from "@/lib/prefs";

export default function ProfileClient() {
  const hydrated = useHydrated();
  const { prefs, update } = usePrefs();
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState("");

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setGeoMsg("এই ব্রাউজারে অবস্থান সুবিধা নেই। তালিকা থেকে জেলা বেছে নিন।");
      return;
    }
    setGeoBusy(true);
    setGeoMsg("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        update({ place: placeFromCoords(pos.coords.latitude, pos.coords.longitude) });
        setGeoBusy(false);
      },
      (err) => {
        setGeoBusy(false);
        setGeoMsg(err.code === 1 ? "অবস্থানের অনুমতি দেওয়া হয়নি। তালিকা থেকে জেলা বেছে নিন।" : "অবস্থান পাওয়া যায়নি। তালিকা থেকে জেলা বেছে নিন।");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  }

  const toggle = (id: WidgetId, on: boolean) => update((cur) => ({ ...cur, widgets: { ...cur.widgets, [id]: on } }));

  return (
    <>
      <h1 className="page-title">প্রোফাইল</h1>
      <p className="updated">এখানকার সেটিংস শুধু এই ডিভাইসে সেভ থাকে।</p>

      <section className="pf-card" aria-label="আমার এলাকা">
        <h2 className="q-h">আমার এলাকা</h2>
        {!hydrated ? (
          <p className="q-sub">…</p>
        ) : (
          <>
            <p className="q-sub">আবহাওয়া, সূর্যোদয়/সূর্যাস্ত ও নামাজের সময় এই এলাকা ধরে দেখানো হবে।</p>
            <label className="field">
              <span>জেলা</span>
              <select
                value={prefs.place.kind === "district" ? prefs.place.id : ""}
                onChange={(e) => {
                  const p = districtPlace(e.target.value);
                  if (p) update({ place: p });
                }}
              >
                {prefs.place.kind === "gps" ? (
                  <option value="" disabled>
                    {prefs.place.name} (আমার অবস্থান)
                  </option>
                ) : null}
                {DIVISIONS.map((d) => (
                  <optgroup key={d.bn} label={d.bn}>
                    {d.list.map(([id, bn]) => (
                      <option key={id} value={id}>
                        {bn}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-ghost" disabled={geoBusy} onClick={useMyLocation}>
              {geoBusy ? "অবস্থান খোঁজা হচ্ছে…" : "আমার বর্তমান অবস্থান ব্যবহার করুন"}
            </button>
            {geoMsg ? <p className="pf-msg err" role="status">{geoMsg}</p> : null}
            <p className="q-foot">অবস্থান শুধু আপনার ডিভাইসে সেভ হয়, প্রায় ১ কিমি পর্যন্ত গোল করে।</p>
          </>
        )}
      </section>

      <section className="pf-card" aria-label="দ্রুত পেজে কী দেখবেন">
        <h2 className="q-h">দ্রুত পেজে কী দেখবেন</h2>
        {!hydrated ? (
          <p className="q-sub">…</p>
        ) : (
          <ul className="check-list">
            {WIDGETS.map((w) => (
              <li key={w.id}>
                <label className="check">
                  <input type="checkbox" checked={prefs.widgets[w.id]} onChange={(e) => toggle(w.id, e.target.checked)} />
                  <span>
                    <b>{w.bn}</b>
                    <small>{w.hint}</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pf-card pf-links-card">
        <Link href="/saved">সংরক্ষিত খবর</Link>
        <Link href="/about">আমাদের সম্পর্কে</Link>
      </section>
    </>
  );
}
