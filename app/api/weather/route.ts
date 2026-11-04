import { NextResponse } from "next/server";
import { getWeather } from "@/lib/info";

// /api/weather?lat=23.8&lon=90.4 — ব্যবহারকারীর এলাকার আবহাওয়া। অবস্থান ০.১° (~১১ কিমি) এ গোল করি,
// তাই কাছাকাছি সবার অনুরোধ একই ক্যাশ ব্যবহার করে (ফ্রি API এর সীমা বাঁচে) এবং সঠিক অবস্থান সার্ভারে যায় না।
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const rawLat = q.get("lat");
  const rawLon = q.get("lon");
  const lat = rawLat === null ? NaN : Number(rawLat);
  const lon = rawLon === null ? NaN : Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "bad_coords" }, { status: 400 });
  }
  const w = await getWeather(Math.round(lat * 10) / 10, Math.round(lon * 10) / 10);
  if (!w) return NextResponse.json({ error: "unavailable" }, { status: 502 });
  return NextResponse.json(w, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" } });
}
