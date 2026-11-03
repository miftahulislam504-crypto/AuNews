import Link from "next/link";
import { toBn } from "@/lib/bn";
import { hueStyle } from "@/lib/reader";
import type { DailyEdition } from "@/lib/types";

// "আজকের বড় খবর" তালিকা: ব্রিফ থাকলে আমাদের ব্রিফে, না থাকলে মূল সোর্সে নিয়ে যায়
export default function DailyView({ edition, others }: { edition: DailyEdition; others: DailyEdition[] }) {
  return (
    <>
      <h1 className="page-title">আজকের {toBn(edition.stories.length)}টি বড় খবর</h1>
      <p className="updated">
        {edition.label} · গত ২৪ ঘণ্টায় সবচেয়ে বেশি সংবাদমাধ্যমে আসা ঘটনা। বাছাই স্বয়ংক্রিয়: যত বেশি সোর্সে এসেছে, তত উপরে।
      </p>
      <ol className="daily-list">
        {edition.stories.map((s) => (
          <li key={s.clusterId} className="daily-item">
            <span className="daily-rank" aria-hidden="true">{toBn(s.rank)}</span>
            <div>
              {s.digestId ? (
                <Link href={`/p/${s.digestId}`} prefetch={false} className="daily-title">{s.headline}</Link>
              ) : (
                <a href={s.link ?? "#"} target="_blank" rel="noopener noreferrer" className="daily-title">{s.headline}</a>
              )}
              {s.lead ? <p className="daily-lead">{s.lead}</p> : null}
              <p className="daily-meta">
                {s.digestId ? <span className="badge ai">এআই ব্রিফ</span> : s.sourceName ? <span className="src" style={hueStyle(s.sourceName)}>{s.sourceName}</span> : null}
                <span>{toBn(s.sourceCount)}টি সোর্সে</span>
              </p>
            </div>
          </li>
        ))}
      </ol>
      {others.length > 0 ? (
        <p className="daily-prev">
          আগের দিনের:{" "}
          {others.map((o) => (
            <Link key={o.date} href={`/daily/${o.date}`} prefetch={false}>{o.label}</Link>
          ))}
        </p>
      ) : null}
    </>
  );
}
