import { readFile, appendFile } from "node:fs/promises";
import { cert, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import { fetchFeed } from "./lib/feeds.mjs";
import { runIngest } from "./lib/pipeline.mjs";
import { createGroqTranslator } from "./lib/translate.mjs";

const readJson = async (rel) => JSON.parse(await readFile(new URL(rel, import.meta.url), "utf8"));

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error("FIREBASE_SERVICE_ACCOUNT_JSON সিক্রেট সেট করা নেই (GitHub → Settings → Secrets → Actions)");
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

const sources = await readJson("../config/sources.json");
const settings = await readJson("../config/settings.json");

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

const stats = await runIngest({ db, Timestamp, fetchFeed, sources, settings, translator });

const lines = [
  "## Ingest রিপোর্ট",
  `- ফিড ঠিক: **${stats.feedsOk}**, ফেল: **${stats.feedsFailed.length}**`,
  `- নতুন খবর লেখা হয়েছে: **${stats.added}** (ডুপ্লিকেট ${stats.dup}, পুরনো ${stats.old}, তারিখহীন ${stats.noDate})`,
  `- স্ন্যাপশট আপডেট: ${stats.snapshotsWritten}, মুছে ফেলা: ${stats.deleted}${stats.wiped ? " (সাপ্তাহিক wipe হয়েছে)" : ""}`,
];
if (translator) {
  lines.push(
    `- AI অনুবাদ: ${stats.ai.translated}টি (কল ${stats.ai.requests}, টোকেন ${stats.ai.tokens})${stats.ai.skipped ? `, বাদ: ${stats.ai.skipped}` : ""}`
  );
  for (const e of stats.ai.errors) lines.push(`  - ⚠️ ${e}`);
} else {
  lines.push("- AI অনুবাদ: বন্ধ (GROQ_API_KEY নেই)");
}
if (stats.budgetSkipped) lines.push(`- ⚠️ দৈনিক রাইট বাজেটের কারণে বাদ: ${stats.budgetSkipped}`);
if (stats.writeFailed) lines.push(`- ⚠️ রাইট ফেল: ${stats.writeFailed}`);
if (stats.feedsFailed.length) lines.push("", "### ফেল করা ফিড", ...stats.feedsFailed.map((f) => `- ${f}`));
const summary = lines.join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + "\n");

if (stats.feedsOk === 0) {
  console.error("কোনো ফিডই কাজ করেনি");
  process.exit(1);
}
