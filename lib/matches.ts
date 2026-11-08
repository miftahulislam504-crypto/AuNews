import manual from "@/config/matches.json";
import settings from "@/config/settings.json";
import { teamEn } from "./teamNames";

// "দ্রুত" পেজের ম্যাচ: আজকের ফলাফল, চলমান খেলা ও আসন্ন ম্যাচ (ক্রিকেট + ফুটবল)। খেলার সব লেখা ইংরেজিতে।
// ডেটার উৎস (যেটির key আছে সেটি চলে; কোনোটিই না থাকলে config/matches.json এর হাতে-দেওয়া তালিকা):
//   ফুটবল — football-data.org (ফ্রি key: FOOTBALL_DATA_KEY)    ক্রিকেট — cricketdata.org (ফ্রি key: CRICAPI_KEY)
export type Sport = "football" | "cricket";
export type MatchState = "live" | "result" | "upcoming";

export interface Match {
  id: string;
  sport: Sport;
  state: MatchState;
  competition: string;
  home: string;
  away: string;
  homeScore: string | null;
  awayScore: string | null;
  note: string;
  startsAt: number; // ms
}

export interface MatchesData {
  matches: Match[];
  updatedAt: number;
  sources: { football: boolean; cricket: boolean; manual: boolean };
}

const HOUR = 3600000;
const DAY = 86400000;
type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// ঢাকার (UTC+6) আজকের শুরু
export function dhakaDayStart(now: number): number {
  return Math.floor((now + 6 * HOUR) / DAY) * DAY - 6 * HOUR;
}
const utcYmd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function fetchJson(url: string, headers: Record<string, string>, revalidate: number): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal, next: { revalidate } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- ফুটবল (football-data.org v4) ----------
const COMP_EN: Record<string, string> = {
  WC: "World Cup", EC: "European Championship", CL: "Champions League", PL: "Premier League", PD: "La Liga", SA: "Serie A", BL1: "Bundesliga",
  FL1: "Ligue 1", DED: "Eredivisie", PPL: "Primeira Liga", ELC: "Championship", BSA: "Brasileirão Série A",
};
const FD_LIVE = new Set(["IN_PLAY", "PAUSED", "LIVE"]);
const FD_DONE = new Set(["FINISHED", "AWARDED"]);
const FD_UPCOMING = new Set(["SCHEDULED", "TIMED"]);

export function parseFootball(data: unknown): Match[] {
  const out: Match[] = [];
  for (const raw of arr(o(data).matches)) {
    const m = o(raw);
    const status = str(m.status);
    const state: MatchState | null = FD_LIVE.has(status) ? "live" : FD_DONE.has(status) ? "result" : FD_UPCOMING.has(status) ? "upcoming" : null;
    const startsAt = Date.parse(str(m.utcDate));
    const home = o(m.homeTeam);
    const away = o(m.awayTeam);
    if (!state || Number.isNaN(startsAt) || !str(home.name) || !str(away.name)) continue; // স্থগিত/বাতিল/দল-অজানা বাদ
    const ft = o(o(m.score).fullTime);
    const pens = o(o(m.score).penalties);
    const hs = num(ft.home);
    const as = num(ft.away);
    const ph = num(pens.home);
    const pa = num(pens.away);
    let note = "";
    if (state === "live") note = status === "PAUSED" ? "Half Time" : "Live";
    else if (state === "result") note = ph !== null && pa !== null ? `Full Time (Pens ${ph}–${pa})` : "Full Time";
    const comp = o(m.competition);
    out.push({
      id: `fb${num(m.id) ?? `${startsAt}${str(home.name)}`}`,
      sport: "football",
      state,
      competition: COMP_EN[str(comp.code)] ?? str(comp.name),
      home: teamEn(str(home.shortName), str(home.name)),
      away: teamEn(str(away.shortName), str(away.name)),
      homeScore: state === "upcoming" || hs === null ? null : String(hs),
      awayScore: state === "upcoming" || as === null ? null : String(as),
      note,
      startsAt,
    });
  }
  return out;
}

async function footballMatches(now: number): Promise<Match[] | null> {
  const key = process.env.FOOTBALL_DATA_KEY;
  if (!key) return null;
  const comps = settings.matches?.football?.competitions ?? [];
  const day = dhakaDayStart(now);
  const url =
    `https://api.football-data.org/v4/matches?dateFrom=${utcYmd(day - DAY)}&dateTo=${utcYmd(day + 3 * DAY)}` +
    (comps.length ? `&competitions=${comps.join(",")}` : "");
  const d = await fetchJson(url, { "X-Auth-Token": key }, 300);
  return d ? parseFootball(d) : [];
}

// ---------- ক্রিকেট (cricketdata.org / CricAPI) ----------
function cricketNote(status: string, state: MatchState): string {
  const s = status.trim();
  const won = s.match(/^(.+?) won by (\d+) (runs?|wkts?|wickets?)/i);
  if (won) return `${won[1]} won by ${won[2]} ${/^r/i.test(won[3]) ? (won[2] === "1" ? "run" : "runs") : won[2] === "1" ? "wicket" : "wickets"}`;
  if (/\btied?\b/i.test(s)) return "Match Tied";
  if (/no result/i.test(s)) return "No Result";
  if (/abandon/i.test(s)) return "Abandoned";
  if (/\bdraw/i.test(s)) return "Draw";
  if (state === "live") return "Live";
  if (state === "upcoming") return "";
  return s; // অচেনা ধাঁচ: API-র ইংরেজি লেখাই যেমন আছে তেমন
}

function inningsScore(team: string, scores: unknown[]): string | null {
  const t = team.toLowerCase();
  const parts: string[] = [];
  for (const raw of scores) {
    const sc = o(raw);
    if (!str(sc.inning).toLowerCase().startsWith(t)) continue;
    const r = num(sc.r);
    if (r === null) continue;
    const w = num(sc.w);
    const ov = num(sc.o);
    parts.push(`${r}${w !== null ? `/${w}` : ""}${ov !== null ? ` (${ov})` : ""}`);
  }
  return parts.length ? parts.join(" & ") : null;
}

export function parseCricket(data: unknown, featured: string[]): Match[] {
  const want = featured.map((f) => f.toLowerCase());
  const out: Match[] = [];
  for (const raw of arr(o(data).data)) {
    const m = o(raw);
    const teams = arr(m.teams).map(str).filter(Boolean);
    if (teams.length < 2) continue;
    if (want.length && !teams.some((t) => want.some((w) => t.toLowerCase().includes(w)))) continue;
    const gmt = str(m.dateTimeGMT);
    const startsAt = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(gmt) ? gmt : `${gmt}Z`);
    if (Number.isNaN(startsAt)) continue;
    const state: MatchState = m.matchEnded === true ? "result" : m.matchStarted === true ? "live" : "upcoming";
    const scores = arr(m.score);
    out.push({
      id: `cr${str(m.id) || `${startsAt}${teams[0]}`}`,
      sport: "cricket",
      state,
      competition: str(m.matchType).toUpperCase(),
      home: teamEn(teams[0]),
      away: teamEn(teams[1]),
      homeScore: state === "upcoming" ? null : inningsScore(teams[0], scores),
      awayScore: state === "upcoming" ? null : inningsScore(teams[1], scores),
      note: cricketNote(str(m.status), state),
      startsAt,
    });
  }
  return out;
}

async function cricketMatches(): Promise<Match[] | null> {
  const key = process.env.CRICAPI_KEY;
  if (!key) return null;
  // ফ্রি প্ল্যানে দিনে ১০০ কল; ২০ মিনিটের ক্যাশে দিনে ~৭২
  const d = await fetchJson(`https://api.cricapi.com/v1/currentMatches?apikey=${encodeURIComponent(key)}&offset=0`, {}, 1200);
  return d ? parseCricket(d, settings.matches?.cricket?.featuredTeams ?? []) : [];
}

// ---------- হাতে দেওয়া তালিকা ----------
export function parseManual(data: unknown, now: number): Match[] {
  const out: Match[] = [];
  for (const raw of arr(o(data).matches)) {
    const m = o(raw);
    const sport = str(m.sport);
    const startsAt = Date.parse(str(m.startsAt));
    if ((sport !== "football" && sport !== "cricket") || Number.isNaN(startsAt) || !str(m.home) || !str(m.away)) continue;
    if (startsAt < now - 2 * DAY || startsAt > now + 3 * DAY) continue;
    const st = str(m.state);
    const state: MatchState = st === "live" || st === "result" || st === "upcoming" ? st : startsAt > now ? "upcoming" : "result";
    out.push({
      id: `mn${startsAt}${str(m.home)}${str(m.away)}`,
      sport,
      state,
      competition: str(m.competition),
      home: teamEn(str(m.home)),
      away: teamEn(str(m.away)),
      homeScore: str(m.homeScore) || null,
      awayScore: str(m.awayScore) || null,
      note: str(m.note),
      startsAt,
    });
  }
  return out;
}

// আজকের (ঢাকা) ফলাফল; রাত ১২টা–৬টায় আগের দিনের রাতের ম্যাচও ধরে
export function selectMatches(all: Match[], now: number, caps: { football: [number, number]; cricket: [number, number] }): Match[] {
  const day = dhakaDayStart(now);
  const resultsFrom = now - day < 6 * HOUR ? day - DAY : day;
  const seen = new Set<string>();
  const uniq = all.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  const out: Match[] = [];
  for (const sport of ["football", "cricket"] as const) {
    const mine = uniq.filter((m) => m.sport === sport);
    const [maxRes, maxUp] = caps[sport];
    out.push(...mine.filter((m) => m.state === "live").sort((a, b) => a.startsAt - b.startsAt));
    out.push(...mine.filter((m) => m.state === "result" && m.startsAt >= resultsFrom).sort((a, b) => b.startsAt - a.startsAt).slice(0, maxRes));
    out.push(...mine.filter((m) => m.state === "upcoming" && m.startsAt >= now - HOUR && m.startsAt <= now + 3 * DAY).sort((a, b) => a.startsAt - b.startsAt).slice(0, maxUp));
  }
  return out;
}

export async function getMatches(): Promise<MatchesData | null> {
  const cfg = settings.matches;
  if (!cfg?.enabled) return null;
  const now = Date.now();
  const [fb, cr] = await Promise.all([footballMatches(now).catch(() => null), cricketMatches().catch(() => null)]);
  const man = parseManual(manual, now);
  const matches = selectMatches([...(fb ?? []), ...(cr ?? []), ...man], now, {
    football: [cfg.football?.maxResults ?? 8, cfg.football?.maxUpcoming ?? 6],
    cricket: [cfg.cricket?.maxResults ?? 8, cfg.cricket?.maxUpcoming ?? 6],
  });
  return { matches, updatedAt: now, sources: { football: fb !== null, cricket: cr !== null, manual: man.length > 0 } };
}
