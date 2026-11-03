import type { MetadataRoute } from "next";
import { getDigests } from "@/lib/digest";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

// শুধু সেই পেজ, যেগুলো গুগলে আসুক চাই: হোম, এআই ব্রিফ তালিকা, আমাদের সম্পর্কে, প্রতিটি ব্রিফ।
// ক্যাটাগরি/ট্রেন্ডিং পেজ অন্য সাইটের শিরোনামের তালিকা, তাই noindex (মৌলিক লেখা বাড়লে খুলে দেওয়া যাবে)।
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const digests = await getDigests();
  const newest = digests[0]?.createdAt;
  return [
    { url: `${SITE_URL}/`, lastModified: newest ? new Date(newest) : undefined, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/ai`, lastModified: newest ? new Date(newest) : undefined, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/about`, changeFrequency: "yearly", priority: 0.3 },
    ...digests.map((d) => ({ url: `${SITE_URL}/p/${d.id}`, lastModified: new Date(d.createdAt), changeFrequency: "never" as const, priority: 0.7 })),
  ];
}
