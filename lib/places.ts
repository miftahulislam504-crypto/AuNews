// এলাকা: বাংলাদেশের ৬৪ জেলা (জেলা-সদরের আনুমানিক অবস্থান) অথবা ডিভাইসের GPS। আবহাওয়া, সূর্যোদয়/সূর্যাস্ত ও নামাজের সময় এই অবস্থান ধরে হিসাব হয়।
export type Place =
  | { kind: "district"; id: string; name: string; lat: number; lon: number }
  | { kind: "gps"; name: string; lat: number; lon: number };

type D = [id: string, bn: string, lat: number, lon: number];

export const DIVISIONS: { bn: string; list: D[] }[] = [
  { bn: "ঢাকা বিভাগ", list: [
    ["dhaka", "ঢাকা", 23.81, 90.41], ["gazipur", "গাজীপুর", 24.0, 90.42], ["narayanganj", "নারায়ণগঞ্জ", 23.63, 90.5],
    ["narsingdi", "নরসিংদী", 23.92, 90.72], ["manikganj", "মানিকগঞ্জ", 23.86, 90.0], ["munshiganj", "মুন্সীগঞ্জ", 23.55, 90.53],
    ["tangail", "টাঙ্গাইল", 24.25, 89.92], ["kishoreganj", "কিশোরগঞ্জ", 24.43, 90.78], ["faridpur", "ফরিদপুর", 23.6, 89.84],
    ["gopalganj", "গোপালগঞ্জ", 23.01, 89.83], ["madaripur", "মাদারীপুর", 23.17, 90.2], ["rajbari", "রাজবাড়ী", 23.76, 89.64],
    ["shariatpur", "শরীয়তপুর", 23.22, 90.35],
  ] },
  { bn: "চট্টগ্রাম বিভাগ", list: [
    ["chattogram", "চট্টগ্রাম", 22.36, 91.78], ["coxsbazar", "কক্সবাজার", 21.43, 92.01], ["cumilla", "কুমিল্লা", 23.46, 91.18],
    ["feni", "ফেনী", 23.02, 91.4], ["brahmanbaria", "ব্রাহ্মণবাড়িয়া", 23.96, 91.11], ["noakhali", "নোয়াখালী", 22.82, 91.1],
    ["chandpur", "চাঁদপুর", 23.23, 90.66], ["lakshmipur", "লক্ষ্মীপুর", 22.94, 90.84], ["rangamati", "রাঙামাটি", 22.65, 92.17],
    ["khagrachhari", "খাগড়াছড়ি", 23.12, 91.98], ["bandarban", "বান্দরবান", 22.2, 92.22],
  ] },
  { bn: "রাজশাহী বিভাগ", list: [
    ["rajshahi", "রাজশাহী", 24.37, 88.6], ["chapainawabganj", "চাঁপাইনবাবগঞ্জ", 24.6, 88.28], ["naogaon", "নওগাঁ", 24.8, 88.94],
    ["natore", "নাটোর", 24.41, 89.0], ["pabna", "পাবনা", 24.0, 89.25], ["sirajganj", "সিরাজগঞ্জ", 24.45, 89.7],
    ["bogura", "বগুড়া", 24.85, 89.37], ["joypurhat", "জয়পুরহাট", 25.1, 89.02],
  ] },
  { bn: "খুলনা বিভাগ", list: [
    ["khulna", "খুলনা", 22.82, 89.55], ["bagerhat", "বাগেরহাট", 22.65, 89.79], ["satkhira", "সাতক্ষীরা", 22.72, 89.07],
    ["jashore", "যশোর", 23.17, 89.21], ["narail", "নড়াইল", 23.17, 89.5], ["magura", "মাগুরা", 23.49, 89.42],
    ["jhenaidah", "ঝিনাইদহ", 23.54, 89.17], ["kushtia", "কুষ্টিয়া", 23.9, 89.12], ["chuadanga", "চুয়াডাঙ্গা", 23.64, 88.84],
    ["meherpur", "মেহেরপুর", 23.76, 88.63],
  ] },
  { bn: "বরিশাল বিভাগ", list: [
    ["barishal", "বরিশাল", 22.7, 90.37], ["bhola", "ভোলা", 22.69, 90.65], ["patuakhali", "পটুয়াখালী", 22.36, 90.33],
    ["pirojpur", "পিরোজপুর", 22.58, 89.97], ["jhalokati", "ঝালকাঠি", 22.64, 90.2], ["barguna", "বরগুনা", 22.15, 90.13],
  ] },
  { bn: "সিলেট বিভাগ", list: [
    ["sylhet", "সিলেট", 24.9, 91.87], ["moulvibazar", "মৌলভীবাজার", 24.48, 91.77], ["habiganj", "হবিগঞ্জ", 24.38, 91.42],
    ["sunamganj", "সুনামগঞ্জ", 25.07, 91.4],
  ] },
  { bn: "রংপুর বিভাগ", list: [
    ["rangpur", "রংপুর", 25.75, 89.25], ["dinajpur", "দিনাজপুর", 25.63, 88.64], ["kurigram", "কুড়িগ্রাম", 25.81, 89.64],
    ["gaibandha", "গাইবান্ধা", 25.33, 89.53], ["nilphamari", "নীলফামারী", 25.93, 88.86], ["lalmonirhat", "লালমনিরহাট", 25.99, 89.45],
    ["thakurgaon", "ঠাকুরগাঁও", 26.03, 88.46], ["panchagarh", "পঞ্চগড়", 26.34, 88.55],
  ] },
  { bn: "ময়মনসিংহ বিভাগ", list: [
    ["mymensingh", "ময়মনসিংহ", 24.75, 90.41], ["jamalpur", "জামালপুর", 24.92, 89.94], ["netrokona", "নেত্রকোনা", 24.87, 90.73],
    ["sherpur", "শেরপুর", 25.02, 90.02],
  ] },
];

export const DISTRICTS = DIVISIONS.flatMap((d) => d.list.map(([id, bn, lat, lon]) => ({ id, bn, lat, lon })));

export function districtPlace(id: string): Place | null {
  const d = DISTRICTS.find((x) => x.id === id);
  return d ? { kind: "district", id: d.id, name: d.bn, lat: d.lat, lon: d.lon } : null;
}

export const DEFAULT_PLACE: Place = districtPlace("dhaka")!;

export function isInBangladesh(lat: number, lon: number): boolean {
  return lat >= 20.5 && lat <= 26.7 && lon >= 88.0 && lon <= 92.8;
}

function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function nearestDistrict(lat: number, lon: number): { id: string; bn: string; km: number } {
  let best = { id: DISTRICTS[0].id, bn: DISTRICTS[0].bn, km: Infinity };
  for (const d of DISTRICTS) {
    const k = km(lat, lon, d.lat, d.lon);
    if (k < best.km) best = { id: d.id, bn: d.bn, km: k };
  }
  return best;
}

// GPS অবস্থান: গোপনীয়তার জন্য ২ দশমিক (~১ কিমি) পর্যন্ত গোল করে রাখি
export function placeFromCoords(lat: number, lon: number): Place {
  const la = Math.round(lat * 100) / 100;
  const lo = Math.round(lon * 100) / 100;
  const n = nearestDistrict(la, lo);
  return { kind: "gps", name: n.km <= 80 ? n.bn : "আপনার অবস্থান", lat: la, lon: lo };
}

// বাংলাদেশে হলে ঢাকার সময়; বাইরে হলে ডিভাইসের টাইমজোন
export function placeTimeZone(p: Place): string {
  if (isInBangladesh(p.lat, p.lon)) return "Asia/Dhaka";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Dhaka";
  } catch {
    return "Asia/Dhaka";
  }
}
