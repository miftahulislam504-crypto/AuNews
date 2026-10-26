import type { FeedItem } from "./types";

export interface Group {
  rep: FeedItem; // প্রধান আইটেম (ছবি থাকলে সেটি, নাহলে সবচেয়ে নতুন)
  others: FeedItem[]; // একই ঘটনার বাকি খবর
  sourceCount: number; // কয়টি আলাদা সোর্স
  latest: number; // সবচেয়ে নতুন সদস্যের সময় (ms)
}

// items নতুন→পুরনো ক্রমে থাকলে গ্রুপগুলোও সেই ক্রমে (গ্রুপের সবচেয়ে নতুন সদস্যের জায়গায়) আসে
export function groupItems(items: FeedItem[]): Group[] {
  const order: string[] = [];
  const buckets = new Map<string, FeedItem[]>();
  for (const it of items) {
    const key = it.clusterId ?? it.id;
    const b = buckets.get(key);
    if (b) b.push(it);
    else {
      buckets.set(key, [it]);
      order.push(key);
    }
  }
  return order.map((key) => {
    const members = [...(buckets.get(key) as FeedItem[])].sort((a, b) => b.publishedAt - a.publishedAt);
    const rep = members.find((m) => m.image) ?? members[0];
    return {
      rep,
      others: members.filter((m) => m !== rep),
      sourceCount: new Set(members.map((m) => m.sourceId)).size,
      latest: members[0].publishedAt,
    };
  });
}
