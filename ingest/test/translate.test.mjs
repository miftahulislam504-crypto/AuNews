import test from "node:test";
import assert from "node:assert/strict";
import { AiError, createGroqTranslator, parseTranslations, translateArticles } from "../lib/translate.mjs";

const headers = (h = {}) => ({ get: (k) => h[k.toLowerCase()] ?? null });
const resp = (status, body, h) => ({ ok: status >= 200 && status < 300, status, headers: headers(h), json: async () => body });
const chat = (rows, tokens = 1000) => ({ choices: [{ message: { content: JSON.stringify({ items: rows }) } }], usage: { total_tokens: tokens } });
const mk = (fetchImpl, extra = {}) =>
  createGroqTranslator({ apiKey: "KEY", model: "openai/gpt-oss-120b", fetchImpl, sleepImpl: async () => {}, retryDelayMs: 0, ...extra });

test("parseTranslations: {items:[]} অবজেক্ট, সরাসরি অ্যারে, ``` বেড়া, বাংলা নেই এমন উত্তর বাদ", () => {
  const rows = [{ i: 0, t: "গাজায় হাসপাতালে হামলা", s: "কয়েক ডজন নিহত" }, { i: 1, t: "English only", s: "x" }, { i: 2, t: "ঢাকায় বৃষ্টি", s: "" }];
  assert.equal(parseTranslations(JSON.stringify({ items: rows })).size, 2);
  assert.equal(parseTranslations(JSON.stringify(rows)).get(0).s, "কয়েক ডজন নিহত");
  assert.equal(parseTranslations("```json\n" + JSON.stringify({ items: rows }) + "\n```").size, 2);
  assert.equal(parseTranslations("nope"), null);
  assert.equal(parseTranslations(JSON.stringify({ a: 1 })), null);
});

test("Groq অনুরোধের গঠন: URL, Bearer, JSON মোড, gpt-oss এ reasoning প্যারামিটার, শুধু টাইটেল", async () => {
  let seen;
  const tr = mk(async (url, init) => {
    seen = { url, init };
    return resp(200, chat([{ i: 0, t: "বাংলা শিরোনাম", s: "" }], 1200));
  });
  const { items, tokens } = await tr([{ title: "Hello", summary: "World" }]);
  assert.equal(items.get(0).t, "বাংলা শিরোনাম");
  assert.equal(tokens, 1200);
  assert.equal(seen.url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(seen.init.headers.Authorization, "Bearer KEY");
  const body = JSON.parse(seen.init.body);
  assert.equal(body.model, "openai/gpt-oss-120b");
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.equal(body.reasoning_effort, "low");
  assert.equal(body.include_reasoning, false);
  assert.deepEqual(JSON.parse(body.messages[1].content), [{ i: 0, title: "Hello" }]); // summary পাঠানো হয়নি
  assert.ok(!seen.url.includes("KEY"));
});

test("includeSummary=true হলে সারাংশ (২০০ অক্ষর পর্যন্ত) যায়; Llama মডেলে reasoning প্যারামিটার নেই", async () => {
  let body;
  const tr = mk(async (_u, init) => { body = JSON.parse(init.body); return resp(200, chat([{ i: 0, t: "অনুবাদ", s: "সারাংশ" }])); },
    { model: "llama-3.3-70b-versatile", includeSummary: true });
  await tr([{ title: "Hello", summary: "x".repeat(500) }]);
  assert.equal(JSON.parse(body.messages[1].content)[0].summary.length, 200);
  assert.equal(body.reasoning_effort, undefined);
  assert.equal(body.include_reasoning, undefined);
});

test("TPM পেসিং: ব্যবহৃত টোকেন অনুযায়ী পরের কলের আগে অপেক্ষা", async () => {
  let t = 1_000_000;
  const sleeps = [];
  const tr = mk(async () => resp(200, chat([{ i: 0, t: "বাংলা", s: "" }], 4000)), {
    tokensPerMinute: 8000, nowImpl: () => t, sleepImpl: async (ms) => { sleeps.push(ms); t += ms; },
  });
  await tr([{ title: "a" }]);
  assert.deepEqual(sleeps, []); // প্রথম কলে অপেক্ষা নেই
  await tr([{ title: "b" }]);
  assert.deepEqual(sleeps, [30000]); // 4000/8000 মিনিট
});

test("429: ছোট retry-after এ অপেক্ষা করে আবার চেষ্টা; বড় হলে rate_limit ত্রুটি (retryAfterMs সহ)", async () => {
  let n = 0;
  const sleeps = [];
  const ok = mk(async () => (++n === 1 ? resp(429, {}, { "retry-after": "5" }) : resp(200, chat([{ i: 0, t: "ঠিক আছে", s: "" }]))),
    { sleepImpl: async (ms) => sleeps.push(ms) });
  assert.equal((await ok([{ title: "a" }])).items.get(0).t, "ঠিক আছে");
  assert.equal(n, 2);
  assert.equal(sleeps[0], 5250);

  const big = mk(async () => resp(429, {}, { "retry-after": "7200" }));
  await assert.rejects(big([{ title: "a" }]), (e) => e instanceof AiError && e.kind === "rate_limit" && e.retryAfterMs === 7_200_000);
  const noHeader = mk(async () => resp(429, {}));
  await assert.rejects(noHeader([{ title: "a" }]), (e) => e.kind === "rate_limit" && e.retryAfterMs === null);
});

test("অন্যান্য ত্রুটি: 401/404 → config, 5xx রিট্রাই, json_validate_failed → bad_output, খালি কনটেন্ট → bad_output", async () => {
  await assert.rejects(mk(async () => resp(401, { error: { message: "Invalid API Key" } }))([{ title: "a" }]), (e) => e.kind === "config" && /Invalid API Key/.test(e.message));
  await assert.rejects(mk(async () => resp(404, { error: { message: "model_not_found" } }))([{ title: "a" }]), (e) => e.kind === "config");
  let n = 0;
  const flaky = mk(async () => (++n === 1 ? resp(503, {}) : resp(200, chat([{ i: 0, t: "ঠিক", s: "" }]))));
  assert.equal((await flaky([{ title: "a" }])).items.size, 1);
  await assert.rejects(mk(async () => resp(503, {}))([{ title: "a" }]), (e) => e.kind === "transient");
  await assert.rejects(mk(async () => resp(400, { error: { code: "json_validate_failed", message: "Failed to generate JSON" } }))([{ title: "a" }]), (e) => e.kind === "bad_output");
  await assert.rejects(mk(async () => resp(200, { choices: [{ message: { content: "" } }], usage: { total_tokens: 10 } }))([{ title: "a" }]), (e) => e.kind === "bad_output");
});

test("মডেল reasoning প্যারামিটার না নিলে (400) প্যারামিটার ছাড়া আবার চেষ্টা, পরের কলেও বাদ", async () => {
  const bodies = [];
  const tr = mk(async (_u, init) => {
    const b = JSON.parse(init.body);
    bodies.push(b);
    return b.reasoning_effort ? resp(400, { error: { message: "reasoning_effort is not supported with this model" } }) : resp(200, chat([{ i: 0, t: "বাংলা", s: "" }]));
  });
  await tr([{ title: "a" }]);
  await tr([{ title: "b" }]);
  assert.equal(bodies.length, 3);
  assert.ok(bodies[0].reasoning_effort);
  assert.equal(bodies[1].reasoning_effort, undefined);
  assert.equal(bodies[2].reasoning_effort, undefined);
});

const arts = (n) => Array.from({ length: n }, (_, i) => ({ id: "id" + i, title: "T" + i, summary: "S" + i }));
const fakeTranslator = (log, tokens = 500) => async (batch) => {
  log.push(batch.length);
  return { items: new Map(batch.map((a, i) => [i, { t: "অনুবাদ " + a.id, s: "সারাংশ " + a.id }])), tokens };
};

test("translateArticles: ব্যাচিং, maxRequests ও টোকেন সংগ্রহ", async () => {
  const log = [];
  const r = await translateArticles({ articles: arts(31), translator: fakeTranslator(log), batchSize: 10, maxRequests: 2 });
  assert.deepEqual(log, [10, 10]);
  assert.equal(r.requests, 2);
  assert.equal(r.tokens, 1000);
  assert.equal(r.translated.size, 20);
  assert.equal(r.translated.get("id0").titleBn, "অনুবাদ id0");
  assert.equal(r.translated.get("id20"), undefined);
});

test("translateArticles: টোকেন বাজেটে থামে; rate_limit এ retryAfterMs সহ থামে ও আগের ফল রাখে", async () => {
  const log = [];
  const r = await translateArticles({ articles: arts(50), translator: fakeTranslator(log, 600), batchSize: 10, maxRequests: 5, maxTokens: 1000 });
  assert.equal(r.requests, 2); // ৬০০ → ১২০০ ≥ ১০০০ → থামে
  assert.equal(r.stoppedBy, "token_budget");

  let calls = 0;
  const limited = async (batch) => {
    if (++calls === 2) throw new AiError("rate_limit", "HTTP 429", 90000);
    return { items: new Map(batch.map((a, i) => [i, { t: "বাংলা", s: "" }])), tokens: 100 };
  };
  const r2 = await translateArticles({ articles: arts(30), translator: limited, batchSize: 10, maxRequests: 5 });
  assert.equal(r2.stoppedBy, "rate_limit");
  assert.equal(r2.retryAfterMs, 90000);
  assert.equal(r2.translated.size, 10);
  assert.equal(r2.translated.get("id0").summaryBn, undefined);

  let c3 = 0;
  const r3 = await translateArticles({ articles: arts(60), translator: async () => { c3++; throw new AiError("transient", "HTTP 500"); }, batchSize: 10, maxRequests: 4 });
  assert.equal(c3, 2);
  assert.equal(r3.stoppedBy, "transient");
});
