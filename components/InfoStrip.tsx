import { toBn } from "@/lib/bn";
import { getFx, getWeather } from "@/lib/info";

// হোমের উপরে "আজকের তথ্য": ঢাকার আবহাওয়া ও ডলারের দাম। কোনোটি না এলে সেটি বাদ, দুটোই না এলে স্ট্রিপই নেই।
export default async function InfoStrip() {
  const [w, fx] = await Promise.all([getWeather(), getFx()]);
  if (!w && !fx) return null;
  return (
    <section className="info" aria-label="আজকের তথ্য">
      {w ? (
        <div className="info-cell">
          <span className="info-k">{w.name}</span>
          <span className="info-v">{toBn(w.temp)}°সে</span>
          <span className="info-s">
            {[w.label, w.humidity != null ? `আর্দ্রতা ${toBn(w.humidity)}%` : "", w.wind != null ? `বাতাস ${toBn(w.wind)} কিমি/ঘ` : ""]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      ) : null}
      {fx ? (
        <div className="info-cell">
          <span className="info-k">১ মার্কিন ডলার</span>
          <span className="info-v">{toBn(fx.rate.toFixed(2))} টাকা</span>
          <span className="info-s">
            বাজারদর (দিনে একবার হালনাগাদ) ·{" "}
            <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">
              Rates By Exchange Rate API
            </a>
          </span>
        </div>
      ) : null}
    </section>
  );
}
