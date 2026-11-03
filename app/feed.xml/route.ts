import { getDigests } from "@/lib/digest";
import settings from "@/config/settings.json";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const revalidate = 600;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// নিজের এআই ব্রিফের RSS: পাঠকরা রিডারে/অন্য সাইটে সাবস্ক্রাইব করতে পারে; Telegram/ইমেইল অটোমেশনেরও উৎস হতে পারে
export async function GET() {
  const items = (await getDigests(30))
    .map((d) => {
      const body = [d.lead, ...d.points.map((p) => `• ${p.t}`)].join("\n");
      return `<item><title>${esc(d.headline)}</title><link>${SITE_URL}/p/${d.id}</link><guid isPermaLink="true">${SITE_URL}/p/${d.id}</guid><pubDate>${new Date(d.createdAt).toUTCString()}</pubDate><description>${esc(body)}</description></item>`;
    })
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(SITE_NAME)} — এআই ব্রিফ</title><link>${SITE_URL}</link><description>${esc(settings.site.tagline)}</description><language>bn</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
