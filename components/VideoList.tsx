"use client";

import { useMemo, useState } from "react";
import { hueStyle } from "@/lib/reader";
import type { VideoView } from "@/lib/types";

// ইউটিউবের প্রাইভেসি-মোড এমবেড (youtube-nocookie); ছবিতে ট্যাপ করলে তবেই প্লেয়ার লোড হয়, তাই তালিকা হালকা থাকে
export default function VideoList({ items }: { items: VideoView[] }) {
  const [channel, setChannel] = useState("all");
  const [playing, setPlaying] = useState<string | null>(null);

  const channels = useMemo(() => {
    const m = new Map<string, { name: string; n: number }>();
    for (const v of items) {
      const c = m.get(v.channelKey);
      if (c) c.n++;
      else m.set(v.channelKey, { name: v.channelName, n: 1 });
    }
    return [...m].sort((a, b) => b[1].n - a[1].n);
  }, [items]);

  const shown = channel === "all" ? items : items.filter((v) => v.channelKey === channel);

  return (
    <>
      {channels.length > 1 ? (
        <div className="vchips" role="tablist" aria-label="চ্যানেল">
          <button type="button" role="tab" aria-selected={channel === "all"} className={channel === "all" ? "vchip active" : "vchip"} onClick={() => { setChannel("all"); setPlaying(null); }}>
            সব
          </button>
          {channels.map(([key, c]) => (
            <button key={key} type="button" role="tab" aria-selected={channel === key} className={channel === key ? "vchip active" : "vchip"} onClick={() => { setChannel(key); setPlaying(null); }}>
              {c.name}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="vlist">
        {shown.map((v) => (
          <li key={v.id} className="vcard">
            <div className="vframe">
              {playing === v.id ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&playsinline=1&rel=0`}
                  title={v.title}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : (
                <button type="button" className="vplay" onClick={() => setPlaying(v.id)} aria-label={`চালান: ${v.title}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" loading="lazy" decoding="async" />
                  <span className="vplay-ico" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="26" height="26"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
                  </span>
                </button>
              )}
            </div>
            <div className="vbody">
              <a className="vtitle" href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer">
                {v.title}
              </a>
              <p className="vmeta">
                <span className="src" style={hueStyle(v.channelName)}>{v.channelName}</span>
                <span>{v.timeLabel}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
