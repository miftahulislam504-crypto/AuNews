import settings from "@/config/settings.json";

const NETWORKS = [
  { id: "facebook", label: "ফেসবুক", d: "M14 8.5V7c0-.7.2-1 1.1-1H17V3h-2.6c-2.8 0-3.9 1.7-3.9 3.8v1.7H8v3h2.5V21H14v-9.5h2.6l.4-3z" },
  {
    id: "youtube",
    label: "ইউটিউব",
    d: "M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3z",
  },
  {
    id: "x",
    label: "এক্স (টুইটার)",
    d: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
  {
    id: "linkedin",
    label: "লিংকডইন",
    d: "M6.9 8.7H3.7V20h3.2zM5.3 3.5a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zM20.3 20v-6.2c0-3-1.6-4.4-3.8-4.4-1.7 0-2.5 1-2.9 1.6V8.7h-3.2V20h3.2v-6.3c0-1.4.8-2.3 2-2.3 1.3 0 1.8 1 1.8 2.5V20z",
  },
  {
    id: "telegram",
    label: "টেলিগ্রাম",
    d: "M21.5 4.3L2.8 11.5c-.9.4-.9 1.1-.2 1.3l4.8 1.5 1.8 5.6c.2.6.4.8.8.8s.6-.2.9-.4l2.4-2.3 4.8 3.5c.9.5 1.5.2 1.8-.8l3-14.3c.3-1.3-.5-1.9-1.4-1.5zM8 13.7l9.4-5.9c.4-.3.8-.1.5.2l-7.8 7-.3 3.3z",
  },
];

// settings.json → site.social এ যে লিংক বসানো আছে শুধু সেগুলোর আইকন দেখায়
export default function SocialLinks({ className = "social" }: { className?: string }) {
  const links = settings.site.social as Record<string, string>;
  const shown = NETWORKS.filter((n) => links[n.id]);
  if (shown.length === 0) return null;
  return (
    <div className={className}>
      {shown.map((n) => (
        <a key={n.id} href={links[n.id]} target="_blank" rel="noopener noreferrer" aria-label={n.label} className={`s-${n.id}`}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor" fillRule="evenodd">
            <path d={n.d} />
          </svg>
        </a>
      ))}
    </div>
  );
}
