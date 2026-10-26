import { classify } from "./classify.mjs";
import { annotateClusters } from "./cluster.mjs";
import { translateArticles } from "./translate.mjs";
import { extractImage, makeId, normalizeUrl, stripHtml, truncate } from "./text.mjs";
import { mergeSnapshot, parseSeen, pruneSeen, serializeSeen } from "./merge.mjs";

const DAY = 86400000;

// raw = rss-parser এর আইটেম। ফেরত: { ok:true, article } | { ok:false, reason }
export function toArticle(raw, source, now, summaryMax) {
  const url = normalizeUrl(raw.link || raw.guid);
  if (!url) return { ok: false, reason: "nolink" };
  const title = truncate(stripHtml(raw.title), 300);
  if (!title) return { ok: false, reason: "notitle" };
  let t = Date.parse(raw.isoDate || raw.pubDate || "");
  if (Number.isNaN(t)) return { ok: false, reason: "nodate" };
  if (t > now + 10 * 60000) t = now; // ভবিষ্যতের তারিখ (টাইমজোন ভুল) → এখন

  let summary = stripHtml(raw.summary || raw.contentSnippet || raw.content || raw.description || raw.contentEncoded || "");
  if (summary === title || summary.startsWith(title)) summary = summary.slice(title.length).trim();
  summary = truncate(summary, summaryMax);

  return {
    ok: true,
    article: {
      id: makeId(url.key),
      title,
      summary,
      link: url.link,
      sourceId: source.id,
      sourceName: source.name,
      lang: source.lang,
      scope: source.scope,
      category: classify(source.category, title, summary),
      image: extractImage(raw, url.link),
      publishedAt: t,
    },
  };
}

async function deleteDocs(db, snap) {
  const w = db.bulkWriter();
  const ps = snap.docs.map((d) => w.delete(d.ref).catch(() => {}));
  await w.close();
  await Promise.all(ps);
}

async function deleteExpired(db, Timestamp, col, cutoffMs, limit) {
  const snap = await db.collection(col).where("publishedAt", "<", Timestamp.fromMillis(cutoffMs)).limit(limit).get();
  if (snap.empty) return 0;
  await deleteDocs(db, snap);
  return snap.size;
}

async function wipeCollection(db, col) {
  let total = 0;
  for (let i = 0; i < 60; i++) {
    const snap = await db.collection(col).limit(500).get();
    if (snap.empty) break;
    await deleteDocs(db, snap);
    total += snap.size;
  }
  return total;
}

export async function runIngest({ db, Timestamp, fetchFeed, sources, settings, translator = null, now = Date.now() }) {
  const col = settings.firestore.collection;
  const ing = settings.ingest;
  const mode = settings.retention.mode;
  const retentionMs = settings.retention.days * DAY;
  const cutoffMs = now - retentionMs;
  const windowMs = Math.min(retentionMs, ing.windowDays * DAY);
  const today = new Date(now).toISOString().slice(0, 10);

  const stats = {
    feedsOk: 0, feedsFailed: [], parsed: 0, noDate: 0, old: 0, dup: 0,
    added: 0, writeFailed: 0, budgetSkipped: 0, deleted: 0, wiped: false, snapshotsWritten: 0,
    ai: { requests: 0, translated: 0, tokens: 0, errors: [], skipped: null },
  };

  const metaRef = db.collection("meta").doc("ingest");
  const metaSnap = await metaRef.get();
  const meta = metaSnap.exists ? metaSnap.data() : {};
  const seen = parseSeen(meta.seen);
  const writesToday = meta.day === today ? meta.writes || 0 : 0;
  let wipeAt = meta.wipeAt || now;
  let floorAt = meta.floorAt || 0; // সর্বশেষ wipe-এর সময়; এর আগের খবর আর ঢোকে না
  let aiCalls = meta.aiDay === today ? meta.aiCalls || 0 : 0;
  let aiTokens = meta.aiDay === today ? meta.aiTokens || 0 : 0;
  let aiPausedUntil = meta.aiPausedUntil || 0;
  let metaDirty = !meta.wipeAt;

  // ---- রিটেনশন ----
  if (mode === "weekly_wipe") {
    if (meta.wipeAt && now - meta.wipeAt >= retentionMs) {
      stats.deleted += await wipeCollection(db, col);
      await wipeCollection(db, "feeds");
      seen.clear();
      wipeAt = now;
      floorAt = now;
      metaDirty = true;
      stats.wiped = true;
    }
  } else {
    stats.deleted += await deleteExpired(db, Timestamp, col, cutoffMs, 500);
  }
  const ingestFrom = Math.max(now - windowMs, floorAt);

  // ---- ফিড আনা ----
  const fresh = new Map();
  const active = sources.filter((s) => s.enabled !== false);
  const BATCH = 8;
  for (let i = 0; i < active.length; i += BATCH) {
    await Promise.all(
      active.slice(i, i + BATCH).map(async (source) => {
        let raws = null;
        let lastErr = "";
        for (const url of [source.url, ...(source.alts || [])]) {
          try {
            const items = await fetchFeed(url);
            if (items && items.length) { raws = items; break; }
            lastErr = "কোনো আইটেম নেই";
          } catch (e) {
            lastErr = String(e?.message || e);
          }
        }
        if (!raws) { stats.feedsFailed.push(`${source.id}: ${lastErr}`); return; }
        stats.feedsOk++;

        const arts = [];
        for (const raw of raws) {
          const r = toArticle(raw, source, now, ing.summaryMaxChars);
          if (!r.ok) { if (r.reason === "nodate") stats.noDate++; continue; }
          arts.push(r.article);
        }
        arts.sort((a, b) => b.publishedAt - a.publishedAt);
        for (const a of arts.slice(0, ing.maxItemsPerFeedPerRun)) {
          stats.parsed++;
          if (a.publishedAt < ingestFrom) { stats.old++; continue; }
          if (seen.has(a.id) || fresh.has(a.id)) { stats.dup++; continue; }
          fresh.set(a.id, a);
        }
      })
    );
  }

  // ---- দৈনিক রাইট বাজেট ----
  const room = Math.max(0, ing.dailyWriteBudget - writesToday - 30);
  let list = [...fresh.values()].sort((a, b) => b.publishedAt - a.publishedAt);
  if (list.length > room) { stats.budgetSkipped = list.length - room; list = list.slice(0, room); }

  // ---- ইংরেজি খবরের বাংলা অনুবাদ (ঐচ্ছিক; ব্যর্থ হলে মূল ইংরেজিই থাকে) ----
  const ai = settings.ai;
  if (translator && ai?.enabled) {
    const en = list.filter((a) => a.lang === "en");
    const callsLeft = Math.max(0, ai.dailyRequestBudget - aiCalls);
    const tokensLeft = Math.max(0, (ai.dailyTokenBudget ?? Infinity) - aiTokens);
    if (!en.length) stats.ai.skipped = "no_english";
    else if (now < aiPausedUntil) stats.ai.skipped = "paused";
    else if (callsLeft <= 0 || tokensLeft <= 0) stats.ai.skipped = "daily_budget";
    else {
      const r = await translateArticles({
        articles: en,
        translator,
        batchSize: ai.batchSize,
        maxRequests: Math.min(ai.maxRequestsPerRun, callsLeft),
        summaryMax: ing.summaryMaxChars,
        maxTokens: tokensLeft,
      });
      for (const a of en) {
        const tr = r.translated.get(a.id);
        if (tr) Object.assign(a, tr);
      }
      aiCalls += r.requests;
      aiTokens += r.tokens;
      stats.ai.requests = r.requests;
      stats.ai.tokens = r.tokens;
      stats.ai.translated = r.translated.size;
      stats.ai.errors = r.errors;
      if (r.stoppedBy === "rate_limit") {
        const wait = Math.min(Math.max(r.retryAfterMs ?? 3600000, 60000), 12 * 3600000);
        aiPausedUntil = now + wait;
      } else if (r.stoppedBy === "config") {
        aiPausedUntil = now + 6 * 3600000;
      }
      if (r.requests > 0) metaDirty = true;
    }
  }

  // ---- articles লেখা ----
  const okIds = new Set();
  if (list.length) {
    const w = db.bulkWriter();
    const ps = list.map((a) => {
      const { publishedAt, ...rest } = a;
      return w
        .set(db.collection(col).doc(a.id), { ...rest, publishedAt: Timestamp.fromMillis(publishedAt), fetchedAt: Timestamp.fromMillis(now) })
        .then(() => { okIds.add(a.id); }, () => { stats.writeFailed++; });
    });
    await w.close();
    await Promise.all(ps);
  }
  const written = list.filter((a) => okIds.has(a.id));
  stats.added = written.length;
  for (const a of written) seen.set(a.id, a.publishedAt);

  // ---- স্ন্যাপশট (ফিড পেজ এক ডকুমেন্ট থেকে পড়ে, রিড বাঁচে) ----
  if (written.length) {
    const sc = settings.snapshot;
    const ids = ["all", ...new Set(written.map((a) => a.category))];
    const refs = ids.map((id) => db.collection("feeds").doc(id));
    const docs = await db.getAll(...refs);
    const w = db.bulkWriter();
    const ps = [];
    docs.forEach((d, idx) => {
      const id = ids[idx];
      const existing = d.exists ? d.data().items || [] : [];
      const incoming = written
        .filter((a) => id === "all" || a.category === id)
        .map((a) => ({
          ...a,
          summary: truncate(a.summary, sc.summaryChars),
          ...(a.summaryBn ? { summaryBn: truncate(a.summaryBn, sc.summaryChars) } : {}),
        }));
      const m = mergeSnapshot(existing, incoming, { cap: id === "all" ? sc.all : sc.perCategory, cutoffMs });
      if (m.changed) {
        const items = annotateClusters(m.items, settings.cluster ?? {});
        ps.push(
          w.set(refs[idx], { items, updatedAt: now }).then(() => { stats.snapshotsWritten++; }, () => { stats.writeFailed++; })
        );
      }
    });
    await w.close();
    await Promise.all(ps);
  }

  // ---- meta ----
  const pruned = pruneSeen(seen, now - windowMs);
  if (metaDirty || stats.added > 0 || pruned > 0) {
    await metaRef.set({
      seen: serializeSeen(seen),
      wipeAt,
      floorAt,
      aiDay: today,
      aiCalls,
      aiTokens,
      aiPausedUntil: aiPausedUntil > now ? aiPausedUntil : 0,
      day: today,
      writes: writesToday + stats.added + stats.snapshotsWritten + 1,
      lastRunAt: now,
    });
  }
  return stats;
}
