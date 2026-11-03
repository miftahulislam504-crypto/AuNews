// "আজকের বড় খবর": গত ২৪ ঘণ্টায় সবচেয়ে বেশি সোর্সে আসা ঘটনা (সর্বোচ্চ ১০টি)। এআই লাগে না, তাই ভুল তথ্য তৈরির ঝুঁকিও নেই:
// শুধু আগের গ্রুপিং ও এআই ব্রিফ থেকে বাছাই। ব্রিফ থাকলে তার শিরোনাম ও ভূমিকা, না থাকলে সোর্সের বাংলা শিরোনাম।
const HAS_BN = /[\u0980-\u09FF]/;
const HOUR = 3600000;
const BN = "০১২৩৪৫৬৭৮৯";
const MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];

export const DAILY_DEFAULTS = {
  enabled: true,
  hourDhaka: 7,
  minStories: 3,
  maxStories: 10,
  minSources: 2,
  windowHours: 24,
  maxWorld: 4,
  keep: 7,
};

export const toBn = (n) => String(n).replace(/\d/g, (d) => BN[Number(d)]);

// ঢাকা = UTC+6 (ডে-লাইট সেভিং নেই)
export function dhaka(now) {
  const d = new Date(now + 6 * HOUR);
  return {
    date: d.toISOString().slice(0, 10),
    hour: d.getUTCHours(),
    label: `${toBn(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${toBn(d.getUTCFullYear())}`,
  };
}

export function buildEdition({ items, digests = [], cfg, now }) {
  const byCluster = new Map();
  for (const it of items) {
    if (!it.clusterId) continue;
    const b = byCluster.get(it.clusterId);
    if (b) b.push(it);
    else byCluster.set(it.clusterId, [it]);
  }
  const digestByCluster = new Map();
  const digestByMember = new Map();
  for (const d of digests) {
    digestByCluster.set(d.clusterId, d);
    for (const id of d.memberIds ?? []) digestByMember.set(id, d);
  }

  const since = now - cfg.windowHours * HOUR;
  const ranked = [];
  for (const [clusterId, raw] of byCluster) {
    const members = [...raw].sort((a, b) => b.publishedAt - a.publishedAt);
    const sourceCount = new Set(members.map((m) => m.sourceId)).size;
    if (sourceCount < cfg.minSources || members[0].publishedAt < since) continue;
    const digest = digestByCluster.get(clusterId) ?? members.map((m) => digestByMember.get(m.id)).find(Boolean) ?? null;
    let headline, lead = "", link = null, sourceName = "", rep = members[0];
    if (digest) {
      headline = digest.headline;
      lead = digest.lead;
    } else {
      rep = members.find((m) => HAS_BN.test(m.titleBn ?? m.title)) ?? null;
      if (!rep) continue; // বাংলা শিরোনাম নেই; বাংলা চ্যানেল/পেজে ইংরেজি ঢোকাই না
      headline = rep.titleBn ?? rep.title;
      link = rep.link;
      sourceName = rep.sourceName;
    }
    ranked.push({
      clusterId, headline, lead, sourceCount,
      digestId: digest?.id ?? null, link, sourceName,
      scope: rep.scope, category: rep.category, latest: members[0].publishedAt,
    });
  }
  ranked.sort((a, b) => b.sourceCount - a.sourceCount || Number(!!b.digestId) - Number(!!a.digestId) || b.latest - a.latest);

  const stories = [];
  let world = 0;
  for (const r of ranked) {
    if (stories.length >= cfg.maxStories) break;
    if (r.scope !== "bd") {
      if (world >= cfg.maxWorld) continue;
      world++;
    }
    const { latest, ...rest } = r;
    stories.push({ rank: stories.length + 1, ...rest });
  }
  return stories;
}

// store: loadSnapshots / loadDigests / loadDaily / saveDaily
export async function runDaily({ store, settings, now = Date.now() }) {
  const cfg = { ...DAILY_DEFAULTS, ...(settings.daily ?? {}) };
  const stats = { created: false, stories: 0, skipped: null };
  if (!cfg.enabled) return { ...stats, skipped: "disabled" };

  const state = (await store.loadDaily()) ?? {};
  const editions = state.items ?? [];
  const day = dhaka(now);
  if (editions.some((e) => e.date === day.date)) return { ...stats, skipped: "done" };
  if (day.hour < cfg.hourDhaka) return { ...stats, skipped: "early" };

  const snap = (await store.loadSnapshots(["all"])).get("all") ?? [];
  const digests = ((await store.loadDigests()) ?? {}).items ?? [];
  const stories = buildEdition({ items: snap, digests, cfg, now });
  stats.stories = stories.length;
  if (stories.length < cfg.minStories) return { ...stats, skipped: "thin" };

  const edition = { date: day.date, label: day.label, generatedAt: now, stories };
  await store.saveDaily({ items: [edition, ...editions].slice(0, cfg.keep), updatedAt: now });
  return { ...stats, created: true };
}
