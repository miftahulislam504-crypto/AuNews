import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchFeed } from "./lib/feeds.mjs";
import { createFsStore } from "./lib/fsStore.mjs";
import { runIngest } from "./lib/pipeline.mjs";
import { createGroqTranslator } from "./lib/translate.mjs";
import { createGroqDigester, runDigest } from "./lib/digest.mjs";
import { runDaily, toBn } from "./lib/daily.mjs";
import { runVideos } from "./lib/youtube.mjs";
import { createTelegramClient, runTelegram } from "./lib/telegram.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const readJson = async (rel) => JSON.parse(await readFile(path.join(here, rel), "utf8"));

const sources = await readJson("../config/sources.json");
const settings = await readJson("../config/settings.json");
const categories = await readJson("../config/categories.json");
const videoConfig = await readJson("../config/video.json").catch(() => null);

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

// এআই ব্রিফ (ঐচ্ছিক): ব্যর্থ হলেও মূল ইনজেস্ট ঠিক থাকে
let digestStats = null;
let digestError = null;
if (apiKey && settings.digest?.enabled !== false) {
  try {
    const digestModel = process.env.GROQ_DIGEST_MODEL || settings.digest?.model || "openai/gpt-oss-20b";
    const writer = createGroqDigester({
      apiKey,
      model: digestModel,
      tokensPerMinute: settings.digest?.tokensPerMinute,
    });
    digestStats = await runDigest({ store, settings, writer, model: digestModel });
  } catch (e) {
    digestError = String(e?.message || e);
  }
}

// আজকের বড় খবর (এআই লাগে না) এবং টেলিগ্রাম পোস্ট; দুটোই ব্যর্থ হলে মূল ইনজেস্ট অক্ষত
let dailyStats = null;
let dailyError = null;
try {
  dailyStats = await runDaily({ store, settings });
} catch (e) {
  dailyError = String(e?.message || e);
}

// ভিডিও ট্যাব (YouTube চ্যানেলের RSS); ব্যর্থ হলেও মূল ইনজেস্ট অক্ষত
let videoStats = null;
let videoError = null;
try {
  videoStats = await runVideos({ store, settings, config: videoConfig });
} catch (e) {
  videoError = String(e?.message || e);
}

let tgStats = null;
let tgError = null;
const tgToken = process.env.TELEGRAM_BOT_TOKEN;
const tgChat = process.env.TELEGRAM_CHAT_ID;
const tgDry = process.env.TELEGRAM_DRY_RUN === "1";
if (tgToken && tgChat) {
  try {
    tgStats = await runTelegram({
      store,
      client: createTelegramClient({ token: tgToken, chatId: tgChat }),
      settings,
      siteUrl: (process.env.SITE_URL || settings.site.url).replace(/\/+$/, ""),
      dryRun: tgDry,
    });
  } catch (e) {
    tgError = String(e?.message || e);
  }
}

const retDays = settings.retention?.days ?? 1;
const retLabel = retDays === 1 ? "২৪ ঘণ্টার" : `${toBn(retDays)} দিনের`;
const lines = [
  "## Ingest রিপোর্ট",
  `- ফিড ঠিক: **${stats.feedsOk}**, ফেল: **${stats.feedsFailed.length}**`,
  `- নতুন খবর: **${stats.added}** (ডুপ্লিকেট ${stats.dup}, পুরনো ${stats.old}, তারিখহীন ${stats.noDate})`,
  `- স্ন্যাপশট আপডেট: ${stats.snapshotsWritten}, ${retLabel} পুরনো বাদ (সর্বশেষ ফিডে): ${stats.expired}${stats.wiped ? " (wipe হয়েছে)" : ""}`,
];
if (translator) {
  lines.push(
    `- AI অনুবাদ: ${stats.ai.translated}টি (কল ${stats.ai.requests}, টোকেন ${stats.ai.tokens})${stats.ai.skipped ? `, বাদ: ${stats.ai.skipped}` : ""}`
  );
  for (const e of stats.ai.errors) lines.push(`  - ⚠️ ${e}`);
} else {
  lines.push("- AI অনুবাদ: বন্ধ (GROQ_API_KEY নেই)");
}
if (digestStats) {
  lines.push(
    digestStats.skipped
      ? `- এআই ব্রিফ: বাদ (${digestStats.skipped})`
      : `- এআই ব্রিফ: নতুন ${digestStats.created}টি (প্রার্থী ${digestStats.candidates}, লেখা অপর্যাপ্ত ${digestStats.thin}, যাচাইয়ে বাতিল ${digestStats.invalid}, কল ${digestStats.requests}, টোকেন ${digestStats.tokens})`
  );
  if (digestStats.invalidReasons.length) lines.push(`  - বাতিলের কারণ: ${digestStats.invalidReasons.join(", ")}`);
  for (const e of digestStats.errors) lines.push(`  - ⚠️ ${e}`);
} else if (digestError) {
  lines.push(`- এআই ব্রিফ: ⚠️ ${digestError}`);
} else {
  lines.push("- এআই ব্রিফ: বন্ধ (GROQ_API_KEY নেই)");
}
if (dailyStats) {
  lines.push(
    dailyStats.created
      ? `- আজকের বড় খবর: তৈরি হলো (${dailyStats.stories}টি)`
      : `- আজকের বড় খবর: ${{ done: "আজকেরটা আগেই তৈরি", early: "সকাল ৭টার আগে", thin: `যথেষ্ট খবর নেই (${dailyStats.stories}টি)`, disabled: "বন্ধ" }[dailyStats.skipped] ?? dailyStats.skipped}`
  );
} else if (dailyError) {
  lines.push(`- আজকের বড় খবর: ⚠️ ${dailyError}`);
}
if (videoStats) {
  lines.push(
    videoStats.skipped
      ? `- ভিডিও: বাদ (${videoStats.skipped})`
      : `- ভিডিও: চ্যানেল ঠিক ${videoStats.channelsOk}, ফেল ${videoStats.failed.length}; নতুন ${videoStats.added}টি, মোট ${videoStats.total}টি`
  );
  for (const f of videoStats.failed) lines.push(`  - ⚠️ ${f}`);
} else if (videoError) {
  lines.push(`- ভিডিও: ⚠️ ${videoError}`);
}
if (tgStats) {
  lines.push(
    tgStats.skipped
      ? `- টেলিগ্রাম: বাদ (${tgStats.skipped})`
      : `- টেলিগ্রাম${tgDry ? " (ড্রাই-রান, কিছু পাঠানো হয়নি)" : ""}: ${tgDry ? tgStats.preview.length : tgStats.sent}টি পোস্ট${tgStats.daily ? " (রাউন্ডআপসহ)" : ""}`
  );
  for (const e of tgStats.errors) lines.push(`  - ⚠️ ${e}`);
  if (tgDry) for (const m of tgStats.preview) lines.push("", "```", m.replace(/<[^>]+>/g, ""), "```");
} else if (tgError) {
  lines.push(`- টেলিগ্রাম: ⚠️ ${tgError}`);
} else {
  lines.push("- টেলিগ্রাম: বন্ধ (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID নেই)");
}
if (stats.feedsFailed.length) lines.push("", "### ফেল করা ফিড", ...stats.feedsFailed.map((f) => `- ${f}`));
const summary = lines.join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + "\n");

if (stats.feedsOk === 0) {
  console.error("কোনো ফিডই কাজ করেনি");
  process.exit(1);
}
