// নিউজ-কার্ড ছবি (১০৮০×১৩৫০, ৪:৫): ওপরে খবরের ছবি, নিচে লাল ব্যান্ডে শিরোনাম + তারিখ + ব্র্যান্ড।
// sharp (libvips + pango) দিয়ে আঁকা হয়; বাংলা যুক্তাক্ষর ঠিক রাখতে pango টেক্সট ব্যবহার করে।
// সিস্টেমে বাংলা ফন্ট লাগে: GitHub Actions এ `fonts-noto-core` (Noto Sans Bengali) ইনস্টল হয় (ingest.yml দেখুন)।
// sharp আলসেভাবে (lazy) লোড হয়, তাই ফেসবুক বন্ধ থাকলে বা sharp না থাকলে বাকি ইনজেস্ট প্রভাবিত হয় না।

export const CARD = {
  W: 1080,
  H: 1350,
  PHOTO_H: 780,
  FONT: "Noto Sans Bengali, Hind Siliguri, Lohit Bengali, FreeSans",
  RED_TOP: "#c4161c",
  RED_BOTTOM: "#7a0b10",
  HEADLINE_SIZES: [68, 62, 56, 50, 46, 42, 38],
  HEADLINE_MAX_H: 330,
};

// pango মার্কআপে এই ক্যারেক্টারগুলো escape করতে হয়
export const escMarkup = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

let sharpPromise = null;
async function loadSharp() {
  sharpPromise ??= import("sharp").then((m) => m.default ?? m);
  return sharpPromise;
}

// খবরের ছবি নামায়; ব্যর্থ বা ছোট/নষ্ট হলে null (তখন ব্র্যান্ডেড ব্যাকগ্রাউন্ড)
export async function fetchImageBuffer(url, { fetchImpl = fetch, timeoutMs = 15000, maxBytes = 12e6 } = {}) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AuNewsBot/1.0)", Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
    });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length"));
    if (Number.isFinite(len) && len > maxBytes) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length && buf.length <= maxBytes ? buf : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// একটি টেক্সট-লেয়ার (স্বচ্ছ PNG)। width>0 হলে সেই প্রস্থে শব্দ ধরে লাইন ভাঙে।
async function textLayer(sharp, text, { size, color = "#ffffff", bold = true, width = 0, align = "left" }) {
  const markup =
    `<span font_family="${escMarkup(CARD.FONT)}" weight="${bold ? "bold" : "normal"}" ` +
    `size="${Math.round(size * 1024)}" foreground="${color}">${escMarkup(text)}</span>`;
  const { data, info } = await sharp({
    text: { text: markup, font: CARD.FONT, width, align, rgba: true, dpi: 72, wrap: "word" },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { input: data, width: info.width, height: info.height };
}

// শিরোনাম যে বড় সাইজে ব্যান্ডে ধরে সেটি বাছে
async function fitHeadline(sharp, headline, width) {
  for (const size of CARD.HEADLINE_SIZES) {
    const layer = await textLayer(sharp, headline, { size, width });
    if (layer.height <= CARD.HEADLINE_MAX_H) return layer;
  }
  const size = CARD.HEADLINE_SIZES.at(-1);
  const cut = headline.length > 110 ? headline.slice(0, 109).trimEnd() + "…" : headline;
  return textLayer(sharp, cut, { size, width });
}

const svg = (w, h, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);

// ফেরত: { render({ headline, imageUrl, dateLabel }) → Buffer(JPEG) }
export function createCardRenderer({ brand = "AuNews", host = "", fetchImpl = fetch } = {}) {
  return {
    async render({ headline, imageUrl, dateLabel }) {
      const sharp = await loadSharp();
      const { W, H, PHOTO_H } = CARD;
      const bandH = H - PHOTO_H;
      const layers = [];

      // ---- ওপরের অংশ: খবরের ছবি, না পেলে ব্র্যান্ডেড ব্যাকগ্রাউন্ড ----
      let photo = null;
      const raw = await fetchImageBuffer(imageUrl, { fetchImpl });
      if (raw) {
        try {
          const meta = await sharp(raw, { failOn: "none" }).metadata();
          if ((meta.width ?? 0) >= 320 && (meta.height ?? 0) >= 180) {
            photo = await sharp(raw, { failOn: "none" })
              .rotate()
              .resize(W, PHOTO_H, { fit: "cover", position: sharp.strategy.attention })
              .jpeg({ quality: 92 })
              .toBuffer();
          }
        } catch {
          photo = null;
        }
      }
      if (photo) {
        layers.push({ input: photo, left: 0, top: 0 });
        // ছবির নিচের দিক একটু গাঢ় করে ব্যান্ডের সঙ্গে মেশানো
        layers.push({
          input: svg(W, 160, `<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></linearGradient></defs><rect width="${W}" height="160" fill="url(#f)"/>`),
          left: 0,
          top: PHOTO_H - 160,
        });
      } else {
        layers.push({
          input: svg(W, PHOTO_H, `<defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1b33"/><stop offset="1" stop-color="#5a0a10"/></linearGradient></defs><rect width="${W}" height="${PHOTO_H}" fill="url(#b)"/>`),
          left: 0,
          top: 0,
        });
        const logo = await textLayer(sharp, brand, { size: 150, color: "#ffffff", width: 0 });
        layers.push({ input: logo.input, left: Math.round((W - logo.width) / 2), top: Math.round((PHOTO_H - logo.height) / 2) });
      }

      // ---- লাল ব্যান্ড ----
      layers.push({
        input: svg(W, bandH, `<defs><linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${CARD.RED_TOP}"/><stop offset="1" stop-color="${CARD.RED_BOTTOM}"/></linearGradient></defs><rect width="${W}" height="${bandH}" fill="url(#r)"/>`),
        left: 0,
        top: PHOTO_H,
      });

      // ---- ব্র্যান্ড ট্যাব (ছবি ও ব্যান্ডের সংযোগস্থলে, বাঁ দিকে) ----
      const tag = await textLayer(sharp, brand, { size: 40, color: CARD.RED_TOP, width: 0 });
      const tabW = tag.width + 56;
      const tabH = 66;
      const tabTop = PHOTO_H - 33;
      layers.push({ input: svg(tabW, tabH, `<rect width="${tabW}" height="${tabH}" fill="#ffffff"/><rect y="${tabH - 6}" width="${tabW}" height="6" fill="#0b1b33"/>`), left: 60, top: tabTop });
      layers.push({ input: tag.input, left: 60 + Math.round((tabW - tag.width) / 2), top: tabTop + Math.max(0, Math.round((tabH - 6 - tag.height) / 2)) });

      // ---- তারিখ (ডানে) ----
      if (dateLabel) {
        const d = await textLayer(sharp, dateLabel, { size: 28, color: "#ffe9e9", bold: false, width: 0 });
        layers.push({ input: d.input, left: W - 60 - d.width, top: PHOTO_H + 24 });
      }

      // ---- শিরোনাম (সাদা ডাঁটাসহ) ----
      const hl = await fitHeadline(sharp, String(headline ?? "").replace(/\s+/g, " ").trim(), W - 160);
      const hlTop = PHOTO_H + 92;
      layers.push({ input: svg(8, hl.height, `<rect width="8" height="${hl.height}" fill="#ffffff"/>`), left: 60, top: hlTop });
      layers.push({ input: hl.input, left: 100, top: hlTop });

      // ---- ফুটার: ওয়েবসাইট (বাঁয়) + "বিস্তারিত ক্যাপশনে" (ডানে) ----
      layers.push({ input: svg(W - 120, 2, `<rect width="${W - 120}" height="2" fill="#ffffff" fill-opacity="0.28"/>`), left: 60, top: H - 96 });
      if (host) {
        const h = await textLayer(sharp, host, { size: 28, color: "#ffffff", bold: false, width: 0 });
        layers.push({ input: h.input, left: 60, top: H - 82 });
      }
      const more = await textLayer(sharp, "বিস্তারিত ক্যাপশনে", { size: 28, color: "#ffe9e9", bold: false, width: 0 });
      layers.push({ input: more.input, left: W - 60 - more.width, top: H - 82 });

      return sharp({ create: { width: W, height: H, channels: 3, background: "#0b1b33" } })
        .composite(layers)
        .jpeg({ quality: 90 })
        .toBuffer();
    },
  };
}
