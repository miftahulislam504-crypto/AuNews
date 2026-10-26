// মিক্সড ফিডের (ডিফল্ট ক্যাটাগরি national/international) খবর কিওয়ার্ড দিয়ে নির্দিষ্ট ক্যাটাগরিতে নেয়।
// নির্দিষ্ট ক্যাটাগরির ফিড (যেমন bbc-tech) অপরিবর্তিত থাকে।
const RULES = {
  sports: {
    bn: ["ক্রিকেট", "ফুটবল", "টেস্ট ম্যাচ", "ওয়ানডে", "টি-টোয়েন্টি", "বিপিএল", "বিশ্বকাপ", "টুর্নামেন্ট", "ম্যাচ", "ক্রীড়া", "অলিম্পিক", "এশিয়া কাপ", "উইকেট", "ব্যাটার", "বোলার", "প্রিমিয়ার লিগ", "চ্যাম্পিয়নস লিগ", "লা লিগা"],
    en: ["cricket", "football", "soccer", "tournament", "world cup", "premier league", "champions league", "la liga", "bpl", "fifa", "icc", "olympic", "olympics", "wicket", "tennis", "formula 1", "match"],
  },
  politics: {
    bn: ["রাজনীতি", "রাজনৈতিক", "নির্বাচন", "সংসদ", "বিএনপি", "আওয়ামী লীগ", "জামায়াত", "জামাত", "এনসিপি", "জাতীয় পার্টি", "প্রধান উপদেষ্টা", "প্রধানমন্ত্রী", "মন্ত্রিসভা", "ভোট", "সংবিধান"],
    en: ["politics", "political", "election", "elections", "parliament", "bnp", "awami league", "jamaat", "ncp", "prime minister", "cabinet", "senate", "congress", "voters", "ballot"],
  },
  economy: {
    bn: ["অর্থনীতি", "অর্থনৈতিক", "বাজেট", "ব্যাংক", "শেয়ারবাজার", "শেয়ার বাজার", "ডলার", "রপ্তানি", "আমদানি", "মূল্যস্ফীতি", "বিনিয়োগ", "রিজার্ভ", "জিডিপি", "পুঁজিবাজার", "রাজস্ব", "এনবিআর", "ঋণ"],
    en: ["economy", "economic", "inflation", "stock market", "share market", "stocks", "bank", "banks", "budget", "export", "exports", "import", "imports", "gdp", "investment", "investors", "revenue", "tax", "currency", "dollar", "tariff", "imf", "world bank"],
  },
  technology: {
    bn: ["প্রযুক্তি", "স্মার্টফোন", "এআই", "কৃত্রিম বুদ্ধিমত্তা", "ইন্টারনেট", "সাইবার", "মোবাইল অ্যাপ", "সফটওয়্যার", "গুগল", "অ্যাপল", "মাইক্রোসফট", "ফেসবুক", "টেসলা", "রোবট", "মোবাইল ফোন", "স্টার্টআপ", "চ্যাটজিপিটি"],
    en: ["technology", "tech", "ai", "artificial intelligence", "smartphone", "iphone", "android", "software", "startup", "startups", "cyber", "hackers", "google", "apple", "microsoft", "openai", "chatgpt", "tesla", "robot", "semiconductor", "app", "internet", "5g"],
  },
  entertainment: {
    bn: ["বিনোদন", "সিনেমা", "চলচ্চিত্র", "নাটক", "অভিনেতা", "অভিনেত্রী", "গায়ক", "গায়িকা", "ঢালিউড", "বলিউড", "হলিউড", "ওটিটি", "তারকা", "কনসার্ট", "ওয়েব সিরিজ"],
    en: ["movie", "movies", "film", "films", "cinema", "actor", "actress", "singer", "album", "concert", "bollywood", "hollywood", "dhallywood", "celebrity", "netflix", "box office", "web series", "trailer", "oscar", "grammy"],
  },
  health: {
    bn: ["স্বাস্থ্য", "হাসপাতাল", "ডেঙ্গু", "চিকিৎসা", "চিকিৎসক", "রোগ", "ভ্যাকসিন", "টিকা", "ক্যানসার", "ওষুধ", "করোনা", "নিপাহ", "ডায়াবেটিস", "ডাক্তার", "মহামারি", "সংক্রমণ"],
    en: ["health", "hospital", "hospitals", "dengue", "disease", "vaccine", "vaccination", "cancer", "doctor", "doctors", "medicine", "medical", "virus", "covid", "outbreak", "diabetes", "patients", "surgery"],
  },
  science: {
    bn: ["বিজ্ঞান", "বিজ্ঞানী", "গবেষণা", "মহাকাশ", "নাসা", "জলবায়ু", "উপগ্রহ", "ইসরো", "স্পেসএক্স", "প্রত্নতাত্ত্বিক"],
    en: ["scientist", "scientists", "science", "nasa", "space", "astronomers", "researchers", "study finds", "climate", "planet", "telescope", "spacex", "fossil", "physics", "biology"],
  },
  engineering: {
    bn: ["প্রকৌশল", "প্রকৌশলী", "সেতু", "মেট্রোরেল", "মেট্রো রেল", "ফ্লাইওভার", "এক্সপ্রেসওয়ে", "টানেল", "বিদ্যুৎকেন্দ্র", "রেলপথ", "বুয়েট", "স্থাপত্য", "অবকাঠামো", "এলজিইডি", "গণপূর্ত"],
    en: ["engineering", "engineer", "engineers", "bridge", "metro rail", "flyover", "expressway", "construction", "tunnel", "infrastructure", "architecture", "skyscraper", "power plant", "railway", "highway", "building code"],
  },
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const COMPILED = Object.entries(RULES).map(([cat, r]) => [
  cat,
  { bn: r.bn, en: new RegExp(`\\b(?:${r.en.map(esc).join("|")})\\b`, "gi") },
]);

function hits(text, rule) {
  if (!text) return 0;
  let n = 0;
  for (const k of rule.bn) if (text.includes(k)) n++;
  const m = text.match(rule.en);
  if (m) n += m.length;
  return Math.min(n, 3);
}

// যুদ্ধ/হামলা/দুর্ঘটনার শিরোনামে 'hospital' বা 'ব্যাংক' এর মতো শব্দ থাকলেও খবরটি স্বাস্থ্য/অর্থনীতিতে যাবে না
const CONFLICT_BN = ["হামলা", "নিহত", "যুদ্ধ", "বিস্ফোরণ", "সংঘর্ষ", "গুলিবিদ্ধ", "গোলাগুলি", "অগ্নিকাণ্ড", "দুর্ঘটনা", "অভিযান"];
const CONFLICT_EN = /\b(?:strike|strikes|airstrike|airstrikes|killed|kills|dead|attack|attacks|war|bomb|bombing|explosion|shooting|ceasefire|crash|fire|raid)\b/i;

export function classify(defaultCategory, title, summary) {
  if (defaultCategory !== "national" && defaultCategory !== "international") return defaultCategory;
  if (title && (CONFLICT_EN.test(title) || CONFLICT_BN.some((k) => title.includes(k)))) return defaultCategory;
  let best = null;
  let bestScore = 0;
  let tie = false;
  for (const [cat, rule] of COMPILED) {
    const score = hits(title, rule) * 2 + hits(summary, rule);
    if (score > bestScore) { best = cat; bestScore = score; tie = false; }
    else if (score === bestScore && score > 0) tie = true;
  }
  return bestScore >= 2 && !tie ? best : defaultCategory;
}
