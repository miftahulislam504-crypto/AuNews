// এআই ব্রিফ: একই ঘটনা একাধিক সোর্সে এলে সেই সোর্সগুলোর লেখা পড়ে এআই নিজের ভাষায় তথ্যবহুল সারসংক্ষেপ লেখে।
// নিরাপত্তা-নীতি (সঠিকতা আগে):
//  • মডেলকে শুধু দেওয়া লেখার তথ্য ব্যবহার করতে বলা হয়; প্রতিটি পয়েন্টে সোর্স নম্বর বাধ্যতামূলক
//  • সোর্সে নেই এমন সংখ্যা থাকলে সেই পয়েন্ট/ব্রিফ বাদ
//  • সোর্স থেকে হুবহু অনুলিপি ধরা পড়লে বাদ (নিজের ভাষায় লেখা নিশ্চিত করতে)
//  • যথেষ্ট লেখা না পেলে ব্রিফ বানানো হয় না (অনুমান নয়)
import { AiError } from "./translate.mjs";
import { fetchArticleText } from "./articleText.mjs";
import { makeId, truncate } from "./text.mjs";

const HAS_BN = /[\u0980-\u09FF]/;
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const HOUR = 3600000;
const DAY = 24 * HOUR;
const URL = "https://api.groq.com/openai/v1/chat/completions";

export const DIGEST_DEFAULTS = {
  enabled: true,
  model: "openai/gpt-oss-20b",
  windowHours: 24,
  minSources: 3,
  minSourcesWithText: 2,
  maxSources: 3,
  maxCharsPerSource: 1400,
  minCharsPerSource: 250,
  maxPerRun: 2,
  maxCandidatesPerRun: 6,
  dailyMax: 20,
  dailyTokenBudget: 150000,
  tokensPerMinute: 8000,
  retryAfterHours: 3,
  keep: 60,
};

const SYSTEM = [
  "You are a careful Bengali news editor. You receive excerpts from several news reports about ONE event.",
  "Write an ORIGINAL Bengali (Bangladesh standard) briefing using ONLY facts that are stated in the excerpts.",
  "Hard rules:",
  "- Never add facts, numbers, names, causes, quotes or predictions from your own knowledge.",
  "- Paraphrase in your own words; never copy sentences from the excerpts.",
  "- Every point must be supported by at least one source number (the \"n\" of the source).",
  "- If reports disagree on a fact (for example a casualty count), say so in \"conflict\" and do not pick a side.",
  "- If the excerpts are too thin or are not about one clear event, set \"skip\" to true.",
  "- Neutral tone; no editorial opinions.",
  'Respond with one JSON object only: {"skip": boolean, "headline": string (Bengali, up to 90 characters), "lead": string (Bengali, 1-2 sentences), "points": [{"t": string (Bengali, one fact), "s": [source numbers]}] (3 to 5 items), "background": string (Bengali, up to 2 sentences, only if the excerpts contain it, else ""), "conflict": string (Bengali, "" if none)}.',
].join("\n");

// ---------- ছোট সহায়ক ----------
export function normDigits(s) {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

// ২ বা তার বেশি অঙ্কের সংখ্যা (কমা বাদে); ১ অঙ্কের সংখ্যা বাদ কারণ "২টি", "১ম" ধরনের শব্দে ভুল ধরা পড়ে
export function bigNumbers(text) {
  const out = new Set();
  for (const m of normDigits(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = m[0].replace(/,/g, "").replace(/\.$/, "");
    if (n.replace(/\D/g, "").length >= 2) out.add(n);
  }
  return out;
}

const squash = (s) => normDigits(s).replace(/\s+/g, " ").trim();

// text এর যেকোনো win-অক্ষরের টুকরো blob এ হুবহু থাকলে true
export function copiedFrom(text, source, win = 60) {
  const t = squash(text);
  if (t.length < win) return false;
  const blob = squash(source);
  for (let i = 0; i + win <= t.length; i += 12) {
    if (blob.includes(t.slice(i, i + win))) return true;
  }
  return blob.includes(t.slice(-win));
}

// ---------- প্রার্থী বাছাই ----------
// items: "all" স্ন্যাপশটের খবর (clusterId সহ)। ফেরত: [{ clusterId, members, sourceCount, latest }]
export function pickCandidates({ items, digests = [], tried = {}, cfg, now }) {
  const byCluster = new Map();
  for (const it of items) {
    if (!it.clusterId) continue;
    const b = byCluster.get(it.clusterId);
    if (b) b.push(it);
    else byCluster.set(it.clusterId, [it]);
  }
  const covered = new Set();
  const doneClusters = new Set();
  for (const d of digests) {
    doneClusters.add(d.clusterId);
    for (const id of d.memberIds ?? []) covered.add(id);
  }
  const since = now - cfg.windowHours * HOUR;
  const out = [];
  for (const [clusterId, members] of byCluster) {
    if (doneClusters.has(clusterId) || members.some((m) => covered.has(m.id))) continue;
    if (tried[clusterId] && now - tried[clusterId] < cfg.retryAfterHours * HOUR) continue;
    const sourceCount = new Set(members.map((m) => m.sourceId)).size;
    const latest = Math.max(...members.map((m) => m.publishedAt));
    if (sourceCount < cfg.minSources || latest < since) continue;
    out.push({ clusterId, members: [...members].sort((a, b) => b.publishedAt - a.publishedAt), sourceCount, latest });
  }
  return out.sort((a, b) => b.sourceCount - a.sourceCount || b.latest - a.latest);
}

// প্রতি সোর্স থেকে একটি করে খবর; লেখা আনা যায়নি এমন সোর্স বাদ। ফেরত: [{ n, item, text }]
export async function gatherSources(candidate, cfg, fetchText) {
  const seen = new Set();
  const pool = [];
  for (const m of candidate.members) {
    if (seen.has(m.sourceId)) continue;
    seen.add(m.sourceId);
    pool.push(m);
    if (pool.length >= cfg.maxSources + 2) break;
  }
  const texts = await Promise.all(pool.map((m) => fetchText(m.link, { maxChars: cfg.maxCharsPerSource })));
  const good = [];
  pool.forEach((m, i) => {
    if ((texts[i] || "").length >= cfg.minCharsPerSource) good.push({ item: m, text: texts[i] });
  });
  return good.slice(0, cfg.maxSources).map((g, i) => ({ n: i + 1, ...g }));
}

// ---------- মডেলের উত্তর যাচাই ----------
export function validateDigest(raw, sources) {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not_object" };
  if (raw.skip === true) return { ok: false, reason: "model_skip" };
  const blob = sources.map((s) => `${s.item.title} ${s.text}`).join(" \n ");
  const allowed = bigNumbers(blob);
  const str = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
  const clean = (text) => {
    if (!text) return "";
    if (!HAS_BN.test(text)) return "";
    for (const n of bigNumbers(text)) if (!allowed.has(n)) return "";
    if (copiedFrom(text, blob)) return "";
    return text;
  };

  const headline = clean(str(raw.headline));
  const lead = clean(str(raw.lead));
  if (!headline || headline.length > 140) return { ok: false, reason: "bad_headline" };
  if (!lead) return { ok: false, reason: "bad_lead" };

  const valid = new Set(sources.map((s) => s.n));
  const points = [];
  for (const p of Array.isArray(raw.points) ? raw.points : []) {
    const t = clean(str(p?.t));
    const s = [...new Set((Array.isArray(p?.s) ? p.s : []).map(Number))].filter((n) => valid.has(n));
    if (t && s.length) points.push({ t: truncate(t, 400), s });
    if (points.length >= 6) break;
  }
  if (points.length < 2) return { ok: false, reason: "few_points" };

  return {
    ok: true,
    digest: {
      headline: truncate(headline, 140),
      lead: truncate(lead, 500),
      points,
      background: truncate(clean(str(raw.background)), 500),
      conflict: truncate(clean(str(raw.conflict)), 400),
    },
  };
}

export function parseDigestJson(text) {
  const cleaned = String(text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    const data = JSON.parse(cleaned);
    return data && typeof data === "object" && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

// ---------- Groq ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createGroqDigester({
  apiKey,
  model,
  tokensPerMinute = 8000,
  fetchImpl = fetch,
  sleepImpl = sleep,
  nowImpl = Date.now,
  timeoutMs = 60000,
  retryDelayMs = 2000,
}) {
  let reasoningParams = model.startsWith("openai/gpt-oss");
  let nextAllowedAt = 0;

  const body = (userJson) => ({
    model,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userJson },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_completion_tokens: 3000,
    ...(reasoningParams ? { reasoning_effort: "low", include_reasoning: false } : {}),
  });

  async function post(b) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetchImpl(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(b),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  // sources: [{ n, item, text }] → { data, tokens }
  return async function write(sources) {
    const wait = nextAllowedAt - nowImpl();
    if (wait > 0) await sleepImpl(wait);
    const input = JSON.stringify({
      sources: sources.map((s) => ({ n: s.n, outlet: s.item.sourceName, title: s.item.title, text: s.text })),
    });

    let netRetry = 0, serverRetry = 0, paramRetry = 0;
    for (let guard = 0; guard < 6; guard++) {
      let res;
      try {
        res = await post(body(input));
      } catch (e) {
        if (netRetry++ < 1) {
          await sleepImpl(retryDelayMs);
          continue;
        }
        throw new AiError("transient", `network: ${e?.name || "error"}`);
      }
      if (res.ok) {
        const data = await res.json();
        const tokens = Number(data?.usage?.total_tokens) || Math.ceil(input.length / 2) + 1500;
        nextAllowedAt = nowImpl() + Math.ceil((tokens / tokensPerMinute) * 60000);
        const parsed = parseDigestJson(data?.choices?.[0]?.message?.content);
        if (!parsed) throw new AiError("bad_output", "JSON পার্স হয়নি");
        return { data: parsed, tokens };
      }
      if (res.status === 429) {
        const raw = res.headers?.get?.("retry-after");
        const n = Number(raw);
        throw new AiError("rate_limit", "HTTP 429", raw != null && raw !== "" && Number.isFinite(n) ? Math.ceil(n * 1000) : null);
      }
      if (res.status >= 500) {
        if (serverRetry++ < 1) {
          await sleepImpl(retryDelayMs);
          continue;
        }
        throw new AiError("transient", `HTTP ${res.status}`);
      }
      let code = "", msg = "";
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
        reasoningParams = false;
        continue;
      }
      throw new AiError("config", `HTTP ${res.status} ${msg}`.trim().slice(0, 300));
    }
    throw new AiError("transient", "retry exhausted");
  };
}

// ---------- মূল ধাপ ----------
// store: loadSnapshots / loadDigests / saveDigests; writer: createGroqDigester এর ফল
export async function runDigest({ store, settings, writer, model, fetchText = fetchArticleText, now = Date.now() }) {
  const cfg = { ...DIGEST_DEFAULTS, ...(settings.digest ?? {}) };
  const stats = {
    candidates: 0, created: 0, thin: 0, invalid: 0, requests: 0, tokens: 0,
    errors: [], skipped: null, invalidReasons: [],
  };
  if (!cfg.enabled) { stats.skipped = "disabled"; return stats; }

  const state = (await store.loadDigests()) ?? {};
  const today = new Date(now).toISOString().slice(0, 10);
  const usage = state.usage?.day === today ? { ...state.usage } : { day: today, requests: 0, tokens: 0, count: 0 };
  let pausedUntil = state.pausedUntil || 0;
  const tried = {};
  for (const [k, t] of Object.entries(state.tried ?? {})) if (now - t < DAY) tried[k] = t;
  const retentionMs = (settings.retention?.days ?? 7) * DAY;
  let items = (state.items ?? []).filter((d) => d.publishedAt >= now - retentionMs);
  const before = JSON.stringify({ n: (state.items ?? []).length, tried: Object.keys(state.tried ?? {}).length });

  if (now < pausedUntil) stats.skipped = "paused";
  else if (usage.count >= cfg.dailyMax || usage.tokens >= cfg.dailyTokenBudget) stats.skipped = "daily_budget";

  if (!stats.skipped) {
    const snap = (await store.loadSnapshots(["all"])).get("all") ?? [];
    const cands = pickCandidates({ items: snap, digests: items, tried, cfg, now }).slice(0, cfg.maxCandidatesPerRun);
    stats.candidates = cands.length;
    let failures = 0;

    for (const cand of cands) {
      if (stats.created >= cfg.maxPerRun) break;
      if (usage.count >= cfg.dailyMax || usage.tokens + 4000 > cfg.dailyTokenBudget) { stats.skipped = "daily_budget"; break; }

      const sources = await gatherSources(cand, cfg, fetchText);
      if (sources.length < cfg.minSourcesWithText) {
        tried[cand.clusterId] = now;
        stats.thin++;
        continue;
      }

      let result;
      stats.requests++;
      usage.requests++;
      try {
        result = await writer(sources);
      } catch (e) {
        const kind = e?.kind ?? "transient";
        stats.errors.push(`${kind}: ${e?.message ?? e}`);
        if (kind === "rate_limit") {
          pausedUntil = now + Math.min(Math.max(e.retryAfterMs ?? 3600000, 60000), 12 * HOUR);
          break;
        }
        if (kind === "config") {
          pausedUntil = now + 6 * HOUR;
          break;
        }
        tried[cand.clusterId] = now;
        if (++failures >= 2) break;
        continue;
      }
      failures = 0;
      usage.tokens += result.tokens || 0;
      stats.tokens += result.tokens || 0;

      const v = validateDigest(result.data, sources);
      if (!v.ok) {
        tried[cand.clusterId] = now;
        stats.invalid++;
        stats.invalidReasons.push(v.reason);
        continue;
      }
      const rep = cand.members.find((m) => m.image) ?? cand.members[0];
      items.push({
        id: makeId(`digest:${cand.clusterId}`),
        clusterId: cand.clusterId,
        memberIds: cand.members.map((m) => m.id),
        category: rep.category,
        scope: rep.scope,
        ...v.digest,
        sources: sources.map((s) => ({ n: s.n, name: s.item.sourceName, link: s.item.link, title: s.item.title })),
        sourceCount: cand.sourceCount,
        image: rep.image ?? null,
        publishedAt: cand.latest,
        createdAt: now,
        model: model || cfg.model,
      });
      usage.count++;
      stats.created++;
    }
  }

  items = items.sort((a, b) => b.publishedAt - a.publishedAt).slice(0, cfg.keep);
  const after = JSON.stringify({ n: items.length, tried: Object.keys(tried).length });
  if (stats.created > 0 || stats.requests > 0 || stats.thin > 0 || before !== after || pausedUntil !== (state.pausedUntil || 0)) {
    await store.saveDigests({
      items,
      updatedAt: now,
      usage,
      tried,
      pausedUntil: pausedUntil > now ? pausedUntil : 0,
    });
  }
  return stats;
}
