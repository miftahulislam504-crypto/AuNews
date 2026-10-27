import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReaderBar from "@/components/ReaderBar";
import ReaderImage from "@/components/ReaderImage";
import { fetchArticle } from "@/lib/article";
import { getItem } from "@/lib/feed";
import { hueStyle, opensInApp } from "@/lib/reader";

export const revalidate = 1800;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const item = await getItem(id);
  // অন্যের লেখা সার্চ ইঞ্জিনে ইনডেক্স করানো হয় না
  return { title: item ? (item.titleBn ?? item.title) : undefined, robots: { index: false, follow: false } };
}

export default async function ArticlePage({ params }: Props) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const article = opensInApp(item) ? await fetchArticle(item.link) : null;
  const title = item.titleBn ?? item.title;
  const summary = item.summaryBn ?? (item.titleBn ? "" : item.summary);

  return (
    <>
      <ReaderBar item={item} />
      <article className="reader">
        <h1 className="reader-title">{title}</h1>
        {item.titleBn ? (
          <p className="reader-orig" lang="en">
            {item.title}
          </p>
        ) : null}
        <p className="reader-meta">
          <span className="src" style={hueStyle(item.sourceId)}>
            {item.sourceName}
          </span>
          <time dateTime={new Date(item.publishedAt).toISOString()}>{item.timeLabel}</time>
          {item.titleBn ? <span className="badge ai">AI অনুবাদ</span> : null}
        </p>
        {item.image ? <ReaderImage src={item.image} /> : null}

        {article ? (
          <>
            {item.lang === "en" ? <p className="reader-note">এই খবরের পুরো লেখা ইংরেজিতে।</p> : null}
            <div className="reader-body" lang={item.lang}>
              {article.blocks.map((b, i) => (b.t === "h" ? <h2 key={i}>{b.text}</h2> : <p key={i}>{b.text}</p>))}
            </div>
          </>
        ) : (
          <>
            {summary ? <p className="reader-lead">{summary}</p> : null}
            <p className="reader-note">পুরো খবর এখানে আনা যায়নি। মূল সাইটে গিয়ে পড়ুন।</p>
          </>
        )}

        <div className="reader-end">
          <p className="reader-credit">সূত্র: {item.sourceName}। পুরো খবরের স্বত্ব সংশ্লিষ্ট সোর্সের।</p>
          <a className="reader-cta" href={item.link} target="_blank" rel="noopener noreferrer">
            মূল খবর পড়ুন
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>
      </article>
    </>
  );
}
