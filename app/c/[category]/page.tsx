import type { Metadata } from "next";
import { notFound } from "next/navigation";
import categories from "@/config/categories.json";
import FeedList from "@/components/FeedList";
import { getFeed } from "@/lib/feed";

export const revalidate = 600;
export const dynamicParams = false;

type Props = { params: Promise<{ category: string }> };

export function generateStaticParams() {
  return categories.map((c) => ({ category: c.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  const c = categories.find((x) => x.id === category);
  return { title: c ? c.bn : undefined };
}

export default async function CategoryPage({ params }: Props) {
  const { category } = await params;
  const c = categories.find((x) => x.id === category);
  if (!c) notFound();
  const { items, updatedLabel } = await getFeed(c.id);
  return (
    <>
      <h1 className="page-title">{c.bn}</h1>
      <FeedList items={items} updatedLabel={updatedLabel} />
    </>
  );
}
