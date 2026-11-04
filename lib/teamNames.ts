// দল/ক্লাবের নাম বাংলায় (না মিললে ইংরেজি নামই দেখায়)
const BN: Record<string, string> = {
  // ক্রিকেট/জাতীয় দল
  bangladesh: "বাংলাদেশ", india: "ভারত", pakistan: "পাকিস্তান", "sri lanka": "শ্রীলঙ্কা", afghanistan: "আফগানিস্তান", nepal: "নেপাল",
  australia: "অস্ট্রেলিয়া", england: "ইংল্যান্ড", "south africa": "দক্ষিণ আফ্রিকা", "new zealand": "নিউজিল্যান্ড", "west indies": "ওয়েস্ট ইন্ডিজ",
  zimbabwe: "জিম্বাবুয়ে", ireland: "আয়ারল্যান্ড", scotland: "স্কটল্যান্ড", netherlands: "নেদারল্যান্ডস", "united arab emirates": "সংযুক্ত আরব আমিরাত",
  oman: "ওমান", usa: "যুক্তরাষ্ট্র", "united states": "যুক্তরাষ্ট্র", canada: "কানাডা",
  // ফুটবল/জাতীয় দল
  argentina: "আর্জেন্টিনা", brazil: "ব্রাজিল", germany: "জার্মানি", france: "ফ্রান্স", spain: "স্পেন", portugal: "পর্তুগাল", italy: "ইতালি",
  belgium: "বেলজিয়াম", croatia: "ক্রোয়েশিয়া", uruguay: "উরুগুয়ে", colombia: "কলম্বিয়া", mexico: "মেক্সিকো", japan: "জাপান",
  "south korea": "দক্ষিণ কোরিয়া", "korea republic": "দক্ষিণ কোরিয়া", morocco: "মরক্কো", senegal: "সেনেগাল", switzerland: "সুইজারল্যান্ড",
  denmark: "ডেনমার্ক", "saudi arabia": "সৌদি আরব", qatar: "কাতার", iran: "ইরান", turkey: "তুরস্ক", egypt: "মিসর", nigeria: "নাইজেরিয়া",
  // ক্লাব
  "real madrid": "রিয়াল মাদ্রিদ", barcelona: "বার্সেলোনা", "atletico madrid": "অ্যাটলেটিকো মাদ্রিদ", sevilla: "সেভিয়া", valencia: "ভ্যালেন্সিয়া",
  "manchester united": "ম্যানচেস্টার ইউনাইটেড", "man united": "ম্যানচেস্টার ইউনাইটেড", "manchester city": "ম্যানচেস্টার সিটি", "man city": "ম্যানচেস্টার সিটি",
  liverpool: "লিভারপুল", arsenal: "আর্সেনাল", chelsea: "চেলসি", tottenham: "টটেনহ্যাম", "tottenham hotspur": "টটেনহ্যাম",
  "newcastle united": "নিউক্যাসল", newcastle: "নিউক্যাসল", "aston villa": "অ্যাস্টন ভিলা", "west ham united": "ওয়েস্ট হ্যাম",
  "bayern munich": "বায়ার্ন মিউনিখ", bayern: "বায়ার্ন মিউনিখ", "borussia dortmund": "বরুসিয়া ডর্টমুন্ড", dortmund: "বরুসিয়া ডর্টমুন্ড",
  "bayer leverkusen": "বায়ার লেভারকুসেন", "paris saint-germain": "পিএসজি", "paris saint germain": "পিএসজি", psg: "পিএসজি",
  juventus: "জুভেন্টাস", "inter milan": "ইন্টার মিলান", internazionale: "ইন্টার মিলান", inter: "ইন্টার মিলান", "ac milan": "এসি মিলান", milan: "এসি মিলান",
  napoli: "নাপোলি", roma: "রোমা", "as roma": "রোমা", lazio: "লাৎসিও", benfica: "বেনফিকা", porto: "পোর্তো", ajax: "আয়াক্স",
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|afc)\b/g, " ")
    .replace(/[.&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// একাধিক নাম দিলে (পুরো নাম, সংক্ষিপ্ত নাম) যেটি আগে মেলে সেটি; কিছুই না মিললে প্রথম নাম
export function teamBn(...names: string[]): string {
  const list = names.filter(Boolean);
  for (const n of list) {
    const hit = BN[norm(n)];
    if (hit) return hit;
  }
  return list[0] ?? "";
}
