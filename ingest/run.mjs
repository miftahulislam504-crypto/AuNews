import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchFeed } from "./lib/feeds.mjs";
import { createFsStore } from "./lib/fsStore.mjs";
import { runIngest } from "./lib/pipeline.mjs";
import { createGroqTranslator } from "./lib/translate.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const readJson = async (rel) => JSON.parse(await readFile(path.join(here, rel), "utf8"));

const sources = await readJson("../config/sources.json");
const settings = await readJson("../config/settings.json");
const categories = await readJson("../config/categories.json");

// ডেটা ডিরেক্টরি: Actions এ `data` ব্রাঞ্চের চেকআউট (DATA_DIR), না দিলে ../data
const dataDir = process.env.DATA_DIR || path.join(here, "..", "data");
const store = createFsStore(dataDir);

// ঐচ্ছিক: GROQ_API_KEY সিক্রেট থাকলে ইংরেজি খবর বাংলায় অনুবাদ হয়
const apiKey = process.env.GROQ_API_KEY;
const translator =
  apiKey && settings.ai?.enabled
    ? createGroqTranslator({
        apiKey,
        model: process.env.GROQ_MODEL || settings.ai.model,
        includeSummary: Boolean(settings.ai.translateSummary),
        tokensPerMinute: settings.ai.tokensPerMinute,
      })
    : null;

const stats = await runIngest({
  store,
  fetchFeed,
  sources,
  categoryIds: categories.map((c) => c.id),
  settings,
  translator,
});

const lines = [
  "## Ingest রিপোর্ট",
  `- ফিড ঠিক: **${stats.feedsOk}**, ফেল: **${stats.feedsFailed.length}**`,
  `- নতুন খবর: **${stats.added}** (ডুপ্লিকেট ${stats.dup}, পুরনো ${stats.old}, তারিখহীন ${stats.noDate})`,
  `- স্ন্যাপশট আপডেট: ${stats.snapshotsWritten}, ৭ দিনের পুরনো বাদ (সর্বশেষ ফিডে): ${stats.expired}${stats.wiped ? " (সাপ্তাহিক wipe হয়েছে)" : ""}`,
];
if (translator) {
  lines.push(
    `- AI অনুবাদ: ${stats.ai.translated}টি (কল ${stats.ai.requests}, টোকেন ${stats.ai.tokens})${stats.ai.skipped ? `, বাদ: ${stats.ai.skipped}` : ""}`
  );
  for (const e of stats.ai.errors) lines.push(`  - ⚠️ ${e}`);
} else {
  lines.push("- AI অনুবাদ: বন্ধ (GROQ_API_KEY নেই)");
}
if (stats.feedsFailed.length) lines.push("", "### ফেল করা ফিড", ...stats.feedsFailed.map((f) => `- ${f}`));
const summary = lines.join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + "\n");

if (stats.feedsOk === 0) {
  console.error("কোনো ফিডই কাজ করেনি");
  process.exit(1);
}
