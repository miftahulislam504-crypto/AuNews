import settings from "@/config/settings.json";

// হোমের "আজকের তথ্য" স্ট্রিপ। দুটোই বাইরের ফ্রি API; ব্যর্থ হলে null (স্ট্রিপে ওই অংশ দেখায় না)।
// Open-Meteo শুধু অবাণিজ্যিক ব্যবহারে ফ্রি; ExchangeRate-API এর ফ্রি এন্ডপয়েন্টে আয়-সূত্র লিংক দেখানো বাধ্যতামূলক।

export type Weather = { name: string; temp: number; humidity: number | null; wind: number | null; label: string };
export type Fx = { base: string; quote: string; rate: number; updated: string | null };

// WMO ওয়েদার কোড → বাংলা
function weatherLabel(code: number): string {
  if (code === 0) return "পরিষ্কার আকাশ";
  if (code <= 2) return "আংশিক মেঘলা";
  if (code === 3) return "মেঘলা";
  if (code === 45 || code === 48) return "কুয়াশা";
  if (code >= 51 && code <= 57) return "গুঁড়িগুঁড়ি বৃষ্টি";
  if (code >= 61 && code <= 67) return "বৃষ্টি";
  if (code >= 71 && code <= 77) return "তুষারপাত";
  if (code >= 80 && code <= 82) return "ভারী বৃষ্টির ঝাপটা";
  if (code >= 95) return "বজ্রসহ বৃষ্টি";
  return "";
}

async function getJson(url: string, revalidate: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, next: { revalidate } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function getWeather(): Promise<Weather | null> {
  const w = settings.info?.weather;
  if (!w?.enabled) return null;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${w.lat}&longitude=${w.lon}` +
    "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=Asia%2FDhaka";
  const d = (await getJson(url, 1800)) as { current?: Record<string, unknown> } | null;
  const c = d?.current;
  if (!c || typeof c.temperature_2m !== "number") return null;
  return {
    name: w.name,
    temp: Math.round(c.temperature_2m),
    humidity: typeof c.relative_humidity_2m === "number" ? Math.round(c.relative_humidity_2m) : null,
    wind: typeof c.wind_speed_10m === "number" ? Math.round(c.wind_speed_10m) : null,
    label: typeof c.weather_code === "number" ? weatherLabel(c.weather_code) : "",
  };
}

export async function getFx(): Promise<Fx | null> {
  const f = settings.info?.fx;
  if (!f?.enabled) return null;
  const d = (await getJson(`https://open.er-api.com/v6/latest/${f.base}`, 3600)) as {
    result?: string;
    rates?: Record<string, number>;
    time_last_update_utc?: string;
  } | null;
  const rate = d?.result === "success" ? d.rates?.[f.quote] : undefined;
  if (typeof rate !== "number" || !Number.isFinite(rate)) return null;
  return { base: f.base, quote: f.quote, rate, updated: d?.time_last_update_utc ?? null };
}
