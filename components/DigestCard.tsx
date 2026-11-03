import Link from "next/link";
import { toBn } from "@/lib/bn";
import type { DigestView } from "@/lib/types";

// সার্ভার কম্পোনেন্ট (কোনো ক্লায়েন্ট স্টেট নেই); হোম ও /ai তালিকায় ব্যবহৃত
export default function DigestCard({ d, compact = false }: { d: DigestView; compact?: boolean }) {
  return (
    <li className={compact ? "dcard compact" : "dcard"}>
      <Link href={`/p/${d.id}`} prefetch={false} className="dcard-link">
        <div className="dcard-body">
          <p className="dcard-kicker">
            <span className="badge ai">এআই ব্রিফ</span>
            <span>{toBn(d.sourceCount)}টি সোর্স থেকে</span>
          </p>
          <h2 className="dcard-title">{d.headline}</h2>
          {compact ? null : <p className="dcard-lead">{d.lead}</p>}
          <p className="dcard-meta">
            <time dateTime={new Date(d.publishedAt).toISOString()}>{d.timeLabel}</time>
          </p>
        </div>
      </Link>
    </li>
  );
}
