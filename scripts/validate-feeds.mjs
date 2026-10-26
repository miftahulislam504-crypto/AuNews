// Phase 0: প্রতিটি RSS ফিড কাজ করছে কিনা যাচাই করে (কোনো dependency লাগে না, Node 20+)
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";

const read = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
const sources = await read("../config/sources.json");
const categories = await read("../config/categories.json");

const TIMEOUT_MS = 15000;
const BATCH = 8;
const UA = "Mozilla/5.0 (compatible; NewsAggregatorBot/0.1)";

async function tryFetch(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(text)) return { ok: false, reason: "ফিড নয় (HTML/অন্য কিছু)" };
    const items = (text.match(/<(item|entry)[\s>]/gi) || []).length;
    if (!items) return { ok: false, reason: "কোনো আইটেম নেই" };
    const m = text.match(/<(pubDate|updated|dc:date|published)[^>]*>([^<]+)</i);
    let ageHours = null;
    if (m) {
      const t = Date.parse(m[2].trim());
      if (!Number.isNaN(t)) ageHours = Math.max(0, Math.round((Date.now() - t) / 36e5));
    }
    return { ok: true, items, ageHours };
  } catch (e) {
    return { ok: false, reason: e.name === "AbortError" ? "timeout" : String(e.cause?.code || e.message) };
  } finally {
    clearTimeout(timer);
  }
}

async function checkSource(s) {
  const urls = [s.url, ...(s.alts || [])];
  let firstReason = "";
  for (const u of urls) {
    const r = await tryFetch(u);
    if (r.ok) {
      return { id: s.id, name: s.name, scope: s.scope, category: s.category, ok: true,
               workingUrl: u, changed: u !== s.url, items: r.items, ageHours: r.ageHours };
    }
    if (!firstReason) firstReason = r.reason;
  }
  return { id: s.id, name: s.name, scope: s.scope, category: s.category, ok: false, reason: firstReason, tried: urls.length };
}

const active = sources.filter((s) => s.enabled !== false);
const results = [];
for (let i = 0; i < active.length; i += BATCH) {
  results.push(...(await Promise.all(active.slice(i, i + BATCH).map(checkSource))));
}

for (const r of results) {
  console.log(r.ok
    ? `OK    ${r.id} (${r.items} items${r.ageHours != null ? `, ~${r.ageHours}h আগের` : ""})${r.changed ? "  <- বিকল্প URL কাজ করেছে" : ""}`
    : `FAIL  ${r.id} — ${r.reason}`);
}

const ok = results.filter((r) => r.ok);
const bad = results.filter((r) => !r.ok);
const count = (arr, scope) => arr.filter((r) => r.scope === scope).length;

const md = [];
md.push("## ফিড রিপোর্ট");
md.push(`কাজ করছে **${ok.length}/${results.length}** (বাংলাদেশ ${count(ok, "bd")}, আন্তর্জাতিক ${count(ok, "intl")})`);
md.push("");
md.push("### ক্যাটাগরি কভারেজ (কাজ করা ফিড)");
md.push("| ক্যাটাগরি | বাংলাদেশ | আন্তর্জাতিক |");
md.push("|---|---|---|");
for (const c of categories) {
  const inCat = ok.filter((r) => r.category === c.id);
  const bd = count(inCat, "bd"), intl = count(inCat, "intl");
  md.push(`| ${c.bn} ${bd + intl === 0 ? "⚠️" : ""} | ${bd} | ${intl} |`);
}
if (bad.length) {
  md.push("", "### ফেল করা ফিড (sources.json এ URL ঠিক করুন বা enabled:false দিন)");
  md.push("| id | কারণ |", "|---|---|");
  for (const r of bad) md.push(`| ${r.id} | ${r.reason} |`);
}
const changed = ok.filter((r) => r.changed);
if (changed.length) {
  md.push("", "### URL বদলান (বিকল্প URL কাজ করেছে)");
  md.push("| id | কাজ করা URL |", "|---|---|");
  for (const r of changed) md.push(`| ${r.id} | ${r.workingUrl} |`);
}
const stale = ok.filter((r) => r.ageHours != null && r.ageHours > 72);
if (stale.length) {
  md.push("", "### পুরনো (৩ দিনের বেশি আগের আইটেম)");
  md.push(stale.map((r) => `- ${r.id} (~${r.ageHours}h)`).join("\n"));
}
const summary = md.join("\n");
console.log("\n" + summary);

await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
await writeFile(new URL("../reports/feed-report.json", import.meta.url), JSON.stringify(results, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
