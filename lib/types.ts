export type Scope = "bd" | "intl";

// Firestore স্ন্যাপশটে যেভাবে সেভ থাকে
export interface StoredItem {
  id: string;
  title: string;
  summary: string;
  link: string;
  sourceId: string;
  sourceName: string;
  lang: "bn" | "en";
  scope: Scope;
  category: string;
  image: string | null;
  publishedAt: number; // ms
  clusterId?: string; // একই ঘটনার খবরের গ্রুপ (একাধিক আইটেম থাকলে)
  titleBn?: string; // ইংরেজি খবরের AI বাংলা অনুবাদ (থাকলে)
  summaryBn?: string;
}

export interface FeedItem extends StoredItem {
  timeLabel: string;
}

// /api/search-index এর ছোট করা রূপ (ডেটা কম লাগে)
export interface SlimItem {
  id: string;
  t: string; // title
  s: string; // summary
  u: string; // link
  n: string; // sourceName
  k: string; // sourceId
  c: string; // category
  p: Scope;
  l: "bn" | "en";
  i: string | null; // image
  d: number; // publishedAt
  tb?: string; // titleBn
  sb?: string; // summaryBn
}
