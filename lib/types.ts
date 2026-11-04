export type Scope = "bd" | "intl";

// data ব্রাঞ্চের স্ন্যাপশট ফাইলে যেভাবে সেভ থাকে
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

// এআই ব্রিফ (data ব্রাঞ্চের feeds/digest.json)
export interface DigestPoint {
  t: string; // একটি তথ্য
  s: number[]; // সমর্থনকারী সোর্স নম্বর
}

export interface DigestSource {
  n: number;
  name: string;
  link: string;
  title: string;
}

export interface Digest {
  id: string;
  clusterId: string;
  category: string;
  scope: Scope;
  headline: string;
  lead: string;
  points: DigestPoint[];
  background: string;
  conflict: string;
  sources: DigestSource[];
  sourceCount: number;
  image: string | null;
  publishedAt: number; // ms (ঘটনার সবচেয়ে নতুন খবরের সময়)
  createdAt: number; // ms (ব্রিফ লেখার সময়)
  model: string;
}

export interface DigestView extends Digest {
  timeLabel: string;
}

// আজকের বড় খবর (data ব্রাঞ্চের feeds/daily.json)
export interface DailyStory {
  rank: number;
  clusterId: string;
  headline: string;
  lead: string;
  sourceCount: number;
  digestId: string | null; // এআই ব্রিফ থাকলে তার id
  link: string | null; // ব্রিফ না থাকলে মূল সোর্সের লিংক
  sourceName: string;
  altLink?: string | null; // ব্রিফ মুছে গেলে এই মূল সোর্স-লিংকে নেওয়া হয়
  altSource?: string;
  scope: Scope;
  category: string;
}

export interface DailyEdition {
  date: string; // YYYY-MM-DD (ঢাকা)
  label: string; // "৩ নভেম্বর ২০২৬"
  generatedAt: number;
  stories: DailyStory[];
}

// ভিডিও (data ব্রাঞ্চের feeds/videos.json) — YouTube চ্যানেলের RSS থেকে
export interface VideoItem {
  id: string; // YouTube video id
  title: string;
  channelId: string;
  channelKey: string;
  channelName: string;
  publishedAt: number; // ms
}

export interface VideoView extends VideoItem {
  timeLabel: string;
}
