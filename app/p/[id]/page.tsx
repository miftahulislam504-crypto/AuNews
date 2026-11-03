import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BackBar from "@/components/BackBar";
import ReaderImage from "@/components/ReaderImage";
import { toBn } from "@/lib/bn";
import { getDigest } from "@/lib/digest";
import { hueStyle } from "@/lib/reader";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import ShareButton from "@/components/ShareButton";

export const revalidate = 600;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const d = await getDigest(id);
  if (!d) return {};
  return {
    title: d.headline,
    description: d.lead,
    alternates: { canonical: `/p/${d.id}` },
    openGraph: { type: "article", title: d.headline, description: d.lead, publishedTime: new Date(d.createdAt).toISOString(), url: `/p/${d.id}` },
  };
}

export default async function DigestPage({ params }: Props) {
  const { id } = await params;
  const d = await getDigest(id);
  if (!d) notFound();

  const ld = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: d.headline.slice(0, 110),
    description: d.lead,
    inLanguage: "bn",
    datePublished: new Date(d.createdAt).toISOString(),
    dateModified: new Date(d.createdAt).toISOString(),
    mainEntityOfPage: `${SITE_URL}/p/${d.id}`,
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    isBasedOn: d.sources.map((s) => s.link),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <BackBar />
      <article className="reader digest">
        <p className="dcard-kicker">
          <span className="badge ai">এআই ব্রিফ</span>
          <span>{toBn(d.sourceCount)}টি সোর্স থেকে</span>
        </p>
        <h1 className="reader-title">{d.headline}</h1>
        <p className="reader-meta">
          <time dateTime={new Date(d.publishedAt).toISOString()}>{d.timeLabel}</time>
        </p>
        {d.image ? <ReaderImage src={d.image} /> : null}

        <p className="reader-lead">{d.lead}</p>

        <h2 className="digest-h">মূল তথ্য</h2>
        <ul className="digest-points">
          {d.points.map((p, i) => (
            <li key={i}>
              <span>{p.t}</span>{" "}
              <span className="refs" aria-label="সোর্স">
                {p.s.map((n) => (
                  <a key={n} href={`#src-${n}`} className="ref">
                    {toBn(n)}
                  </a>
                ))}
              </span>
            </li>
          ))}
        </ul>

        {d.conflict ? (
          <p className="digest-warn">
            <strong>সূত্রে অমিল:</strong> {d.conflict}
          </p>
        ) : null}

        {d.background ? (
          <>
            <h2 className="digest-h">পটভূমি</h2>
            <p className="digest-bg">{d.background}</p>
          </>
        ) : null}

        <ShareButton title={d.headline} />

        <h2 className="digest-h">সোর্স</h2>
        <ol className="digest-sources">
          {d.sources.map((s) => (
            <li key={s.n} id={`src-${s.n}`}>
              <a href={s.link} target="_blank" rel="noopener noreferrer">
                <span className="src" style={hueStyle(s.name)}>
                  {s.name}
                </span>
                <span className="digest-src-title">
                  {s.title}
                </span>
              </a>
            </li>
          ))}
        </ol>

        <p className="reader-note">
          এটি এআই-তৈরি সারসংক্ষেপ; শুধু উপরের সোর্সের লেখা থেকে নেওয়া তথ্য দিয়ে সাজানো, তবু ভুল থাকতে পারে। নিশ্চিত হতে মূল সোর্স পড়ুন।
          {" "}ব্রিফ তৈরি করেছে: {d.model}।
        </p>
      </article>
    </>
  );
}
