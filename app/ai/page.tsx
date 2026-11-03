import type { Metadata } from "next";
import DigestCard from "@/components/DigestCard";
import { getDigests } from "@/lib/digest";

export const revalidate = 600;
export const metadata: Metadata = {
  title: "এআই ব্রিফ",
  description: "একই ঘটনার একাধিক সোর্সের মূল তথ্য এক জায়গায়, সোর্স নম্বরসহ।",
  alternates: { canonical: "/ai" },
};

export default async function AiPage() {
  const digests = await getDigests();
  return (
    <>
      <h1 className="page-title">এআই ব্রিফ</h1>
      <p className="updated">
        একই ঘটনা যে খবরে একাধিক সোর্স ছাপিয়েছে, তার মূল তথ্য এআই নিজের ভাষায় গুছিয়ে লেখে। প্রতিটি পয়েন্টের পাশে সোর্স নম্বর দেওয়া থাকে।
      </p>
      {digests.length === 0 ? (
        <p className="empty">এখনো কোনো ব্রিফ তৈরি হয়নি। কিছুক্ষণ পর আবার দেখুন।</p>
      ) : (
        <ul className="dlist">
          {digests.map((d) => (
            <DigestCard key={d.id} d={d} />
          ))}
        </ul>
      )}
    </>
  );
}
