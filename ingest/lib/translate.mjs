// ইংরেজি খবরের শিরোনাম (ও ঐচ্ছিকভাবে সারাংশ) বাংলায় অনুবাদ — Groq (OpenAI-সামঞ্জস্যপূর্ণ chat/completions)।
// শুধু পাবলিক খবরের টেক্সট পাঠানো হয়। ব্যর্থ হলে খবর মূল ইংরেজিতেই থাকে।
import { truncate } from "./text.mjs";

const HAS_BN = /[\u0980-\u09FF]/;
const URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM = [
  "You are a professional news translator. Translate English news headlines (and short snippets, if given) into natural, standard Bengali (Bangladesh).",
  "Rules: use commonly used Bengali spellings for names of people, places and organisations; keep numbers; never add, remove or guess facts; never editorialise.",
  'The input is a JSON array of {"i": number, "title": string, "summary"?: string}. If "summary" is missing or empty, return "" for "s".',
  'Respond with a single JSON object of the form {"items": [{"i": number, "t": string, "s": string}]} with exactly one entry per input item, using the same "i". No other text.',
].join("\n");

export class AiError extends Error {
  constructor(kind, message, retryAfterMs = null) {
    super(message);
    this.kind = kind; // rate_limit | config | transient | bad_output
    this.retryAfterMs = retryAfterMs;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// মডেলের উত্তর → Map(i → {t, s}); পার্স না হলে null
export function parseTranslations(text) {
  const cleaned = String(text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  let data;
  try {
    data = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (data && !Array.isArray(data) && typeof data === "object") {
    data = Object.values(data).find((v) => Array.isArray(v));
  }
  if (!Array.isArray(data)) return null;
  const out = new Map();
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const i = Number(row.i);
    if (!Number.isInteger(i)) continue;
    const t = typeof row.t === "string" ? row.t.trim() : "";
    const s = typeof row.s === "string" ? row.s.trim() : "";
    if (!HAS_BN.test(t)) continue; // বাংলা নেই = অনুবাদ হয়নি
    out.set(i, { t, s: s && HAS_BN.test(s) ? s : "" });
  }
  return out;
}

function parseRetryAfter(res) {
  const raw = res.headers?.get?.("retry-after");
  const n = Number(raw);
  return raw != null && raw !== "" && Number.isFinite(n) && n >= 0 ? Math.ceil(n * 1000) : null;
}

export function createGroqTranslator({
  apiKey,
  model,
  includeSummary = false,
  tokensPerMinute = 8000,
  fetchImpl = fetch,
  sleepImpl = sleep,
  nowImpl = Date.now,
  timeoutMs = 60000,
  maxWaitMs = 30000,
  retryDelayMs = 2000,
}) {
  let reasoningParams = model.startsWith("openai/gpt-oss"); // শুধু gpt-oss এ reasoning প্যারামিটার
  let nextAllowedAt = 0;

  function buildBody(input) {
    return {
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(input) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_completion_tokens: 4096,
      ...(reasoningParams ? { reasoning_effort: "low", include_reasoning: false } : {}),
    };
  }

  async function post(body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetchImpl(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function call(input) {
    const wait = nextAllowedAt - nowImpl();
    if (wait > 0) await sleepImpl(wait); // TPM সীমা মেনে ব্যবধান

    let netRetry = 0, serverRetry = 0, rateRetry = 0, paramRetry = 0;
    for (let guard = 0; guard < 8; guard++) {
      let res;
      try {
        res = await post(buildBody(input));
      } catch (e) {
        if (netRetry++ < 1) {
          await sleepImpl(retryDelayMs);
          continue;
        }
        throw new AiError("transient", `network: ${e?.name || "error"}`);
      }
      if (res.ok) return res.json();

      if (res.status === 429) {
        const ra = parseRetryAfter(res);
        if (ra != null && ra <= maxWaitMs && rateRetry++ < 1) {
          await sleepImpl(ra + 250);
          continue;
        }
        throw new AiError("rate_limit", "HTTP 429", ra);
      }
      if (res.status >= 500) {
        if (serverRetry++ < 1) {
          await sleepImpl(retryDelayMs);
          continue;
        }
        throw new AiError("transient", `HTTP ${res.status}`);
      }

      let code = "";
      let msg = "";
      try {
        const e = (await res.json())?.error ?? {};
        code = String(e.code ?? "");
        msg = String(e.message ?? "");
      } catch {
        /* বডি নেই */
      }
      if (res.status === 400 && (code === "json_validate_failed" || /json_validate_failed|failed to generate json/i.test(msg))) {
        throw new AiError("bad_output", "মডেল বৈধ JSON দেয়নি");
      }
      if (res.status === 400 && reasoningParams && /reasoning/i.test(msg) && paramRetry++ < 1) {
        reasoningParams = false; // এই মডেল reasoning প্যারামিটার নেয় না — ছাড়া চেষ্টা
        continue;
      }
      throw new AiError("config", `HTTP ${res.status} ${msg}`.trim().slice(0, 300));
    }
    throw new AiError("transient", "retry exhausted");
  }

  // batch: [{ title, summary }] → { items: Map(index → {t, s}), tokens }
  return async function translateBatch(batch) {
    const input = batch.map((a, i) => ({
      i,
      title: a.title,
      ...(includeSummary && a.summary ? { summary: a.summary.slice(0, 200) } : {}),
    }));
    const data = await call(input);
    const tokens = Number(data?.usage?.total_tokens) || Math.ceil(JSON.stringify(input).length / 2) + 600;
    nextAllowedAt = nowImpl() + Math.ceil((tokens / tokensPerMinute) * 60000);
    const content = data?.choices?.[0]?.message?.content;
    const items = parseTranslations(content);
    if (!items) throw new AiError("bad_output", "JSON পার্স হয়নি");
    return { items, tokens };
  };
}

// articles নতুন→পুরনো ক্রমে; maxRequests/maxTokens পার হয় না; rate_limit/config এ থামে
export async function translateArticles({
  articles,
  translator,
  batchSize = 10,
  maxRequests = 4,
  summaryMax = 280,
  maxTokens = Infinity,
}) {
  const result = { translated: new Map(), requests: 0, tokens: 0, errors: [], stoppedBy: null, retryAfterMs: null };
  let consecutiveFailures = 0;
  for (let start = 0; start < articles.length && result.requests < maxRequests; start += batchSize) {
    if (result.tokens >= maxTokens) {
      result.stoppedBy = "token_budget";
      break;
    }
    const batch = articles.slice(start, start + batchSize);
    result.requests++;
    try {
      const { items, tokens } = await translator(batch);
      result.tokens += tokens || 0;
      consecutiveFailures = 0;
      batch.forEach((a, i) => {
        const r = items.get(i);
        if (r) {
          result.translated.set(a.id, {
            titleBn: truncate(r.t, 300),
            ...(r.s ? { summaryBn: truncate(r.s, summaryMax) } : {}),
          });
        }
      });
    } catch (e) {
      const kind = e?.kind ?? "transient";
      result.errors.push(`${kind}: ${e?.message ?? e}`);
      if (kind === "rate_limit") result.retryAfterMs = e.retryAfterMs ?? null;
      if (kind === "rate_limit" || kind === "config") {
        result.stoppedBy = kind;
        break;
      }
      if (++consecutiveFailures >= 2) {
        result.stoppedBy = kind;
        break;
      }
    }
  }
  return result;
}
