const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

// বাংলা/ইংরেজি দুটোর জন্যই: NFC, ছোট হাতের, ZWJ/ZWNJ বাদ, বাংলা অঙ্ক → ইংরেজি অঙ্ক
export function normalize(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
    .replace(/\s+/g, " ")
    .trim();
}

export function buildHaystack(i: {
  title: string;
  summary: string;
  sourceName: string;
  titleBn?: string;
  summaryBn?: string;
}): string {
  return normalize(`${i.title} ${i.titleBn ?? ""} ${i.summary} ${i.summaryBn ?? ""} ${i.sourceName}`);
}

// প্রতিটি শব্দ থাকতে হবে (AND)
export function matches(haystack: string, query: string): boolean {
  const tokens = normalize(query).split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => haystack.includes(t));
}
