import Link from "next/link";
import DigestCard from "@/components/DigestCard";
import FeedList from "@/components/FeedList";
import InfoStrip from "@/components/InfoStrip";
import { getEditions } from "@/lib/daily";
import { getDigests } from "@/lib/digest";
import { toBn } from "@/lib/bn";
import { getFeed } from "@/lib/feed";

import type { Metadata } from "next";

export const revalidate = 600;
export const metadata: Metadata = { alternates: { canonical: "/" } };

// স্ন্যাপশটে এর চেয়ে বেশি খবর থাকে (ট্রেন্ডিং-এর জন্য); হোমে পেজ হালকা রাখতে সর্বশেষ এতগুলোই পাঠাই
const HOME_LIMIT = 150;
const HOME_DIGESTS = 3;

export default async function Home() {
  const [{ items, updatedLabel }, digests, editions] = await Promise.all([getFeed("all"), getDigests(HOME_DIGESTS), getEditions()]);
  const daily = editions[0];
  return (
    <>
      <InfoStrip />
      {daily ? (
        <Link href={`/daily/${daily.date}`} className="daily-banner">
          <strong>আজকের {toBn(daily.stories.length)}টি বড় খবর</strong>
          <span>{daily.label} · এক নজরে দেখুন</span>
        </Link>
      ) : null}
      {digests.length > 0 ? (
        <section className="home-digests" aria-label="এআই ব্রিফ">
          <div className="section-head">
            <h2>এআই ব্রিফ</h2>
            <Link href="/ai">সব দেখুন</Link>
          </div>
          <ul className="dlist">
            {digests.map((d) => (
              <DigestCard key={d.id} d={d} compact />
            ))}
          </ul>
        </section>
      ) : null}
      <h1 className="page-title">সর্বশেষ</h1>
      <FeedList items={items.slice(0, HOME_LIMIT)} updatedLabel={updatedLabel} />
    </>
  );
}
