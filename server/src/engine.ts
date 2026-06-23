"use strict";

/* ====================================================================
   engine.ts — de gedeelde wedstrijdmotor voor online leagues

   STAP 4a + 4b verwerkt:
   - Rol-positie telt niet meer mee in het gevecht. Iedereen op het dek
     vecht op 1,00; wie conditie < 80 heeft vecht op 0,90 (condMult).
   - FIGHT_COND_COST = 6 (conditie per gevecht). Bank = volledig hersteld
     (cond -> 100) in één speeldag.
   - De opstelling slaat het dek nu op als GENERIEKE LIJST: lineup.deck is
     een array van namen (posities zonder rol). Oude opstellingen met
     deck: { role: naam } worden automatisch ingelezen (backward-compat).

   Mount in index.ts:   app.use("/api/online", engineRouter)
   ==================================================================== */

import { Router, Request, Response } from "express";
import { prisma } from "./prisma";
import { tickWorldDay } from "./market";
import { bumpMissions } from "./missions";

/* ---- kalender ---- */
const TOTAL_DAYS = 30;
const REST_DAYS  = new Set([6, 12, 18, 24, 29]);
const NAVY_DAYS  = [7, 15, 20, 27];
const NAVY_RAMP  = [0.85, 1.0, 1.10, 1.25];
const FINAL_DAY  = 30;

/* ---- regels ---- */
const WIN_PTS         = 3;
const WIN_INCOME      = 3_500_000;
const LOSS_INCOME     = 3_000_000;
const FIGHT_COND_COST = 6;            // conditie per gevecht (training kost 3, zie training.ts)
const STAT_CAP        = 99;
const NOISE           = 0.22;         // ±22% ruis op de uitslag

type DayType = "prep" | "normal" | "navy" | "rest" | "final";
export function islandType(day: number): DayType {
  if (day <= 0)          return "prep";
  if (day === FINAL_DAY) return "final";
  if (REST_DAYS.has(day)) return "rest";
  if (NAVY_DAYS.includes(day)) return "navy";
  return "normal";
}

/* ---- kracht / bounty ---- */
type SquadM = { name: string; role: string; altRoles: string[]; p: number; d: number; s: number; cond: number };
type Mem = {
  id: string; crewName?: string; captain?: string; points?: number;
  capP: number; capD: number; capS: number; capCond: number;
  lineup?: any; userId?: string | null;
  squad: SquadM[];
};
function condFactor(cond: number){ const c = Math.max(0, Math.min(100, cond ?? 100)); return 0.6 + 0.4 * (c / 100); }
function bounty(sum: number){ return Math.max(1, sum) * 1_000_000; }

/* ---- conditie-regel (vervangt de oude rol-fit) ---- */
const COND_THRESHOLD = 80;    // onder deze conditie vecht een lid verzwakt
const TIRED_MULT     = 0.90;  // < 80 conditie = 0,90; anders 1,00 (rol-positie telt niet meer)
function condMult(member: SquadM): number {
  return (member.cond < COND_THRESHOLD) ? TIRED_MULT : 1.0;
}

/* ---- generieke opstelling: alleen wie op het dek staat vecht ---- */
const DECK_ROLES = ["Swordsman", "Sniper", "Chef", "Doctor", "Archaeologist",
                    "Shipwright", "Musician", "Navigator", "Helmsman"];

/* lees de dek-namen uit beide formaten:
   nieuw -> deck: [naam, naam, ...]      (generieke posities)
   oud   -> deck: { role: naam, ... }    (rol-sleutels; backward-compat) */
function deckNames(lu: any): string[] {
  if (!lu) return [];
  const d = lu.deck;
  if (Array.isArray(d)) return d.filter(Boolean);
  if (d && typeof d === "object") return DECK_ROLES.map(r => d[r]).filter(Boolean);
  return [];
}
/* de (max 9) dek-leden uit de opstelling; anders de 9 sterksten als fallback */
function deckOf(m: Mem): SquadM[] {
  const byName = new Map(m.squad.map(s => [s.name, s] as [string, SquadM]));
  const names = deckNames(m.lineup);
  if (names.length){
    const out: SquadM[] = [];
    for (const nm of names){ const mem = byName.get(nm); if (mem) out.push(mem); }
    return out.slice(0, 9);
  }
  return m.squad.slice().sort((a, b) => (b.p + b.d + b.s) - (a.p + a.d + a.s)).slice(0, 9);
}

function crewStrength(m: Mem): number {
  let s = bounty(m.capP + m.capD + m.capS) * condFactor(m.capCond);
  for (const member of deckOf(m)) s += bounty(member.p + member.d + member.s) * condMult(member);
  return s;
}
function crewBountyRaw(m: Mem): number {
  let s = bounty(m.capP + m.capD + m.capS);
  for (const q of m.squad) s += bounty(q.p + q.d + q.s);
  return s;
}
function outcome(sa: number, sb: number): "W" | "L" {
  const na = sa * (1 + (Math.random() * 2 - 1) * NOISE);
  const nb = sb * (1 + (Math.random() * 2 - 1) * NOISE);
  return na >= nb ? "W" : "L";
}
function makeScore(){
  const w = 2 + Math.floor(Math.random() * 3);
  const l = Math.max(0, Math.min(w - 1, Math.floor(Math.random() * w)));
  return { w, l };
}

/* ---- crews laden ---- */
async function loadMems(worldId: string, ids?: string[]): Promise<Map<string, Mem>> {
  const rows = await prisma.worldMembership.findMany({
    where: ids ? { worldId, id: { in: ids } } : { worldId },
    select: {
      id: true, crewName: true, captain: true, points: true,
      capP: true, capD: true, capS: true, capCond: true,
      lineup: true, userId: true,
      squad: { select: { name: true, role: true, altRoles: true, p: true, d: true, s: true, cond: true } },
    },
  });
  const map = new Map<string, Mem>();
  rows.forEach(r => map.set(r.id, r as unknown as Mem));
  return map;
}

/* ---- uitslag toepassen ---- */
async function applyResult(memId: string, won: boolean){
  await prisma.worldMembership.update({
    where: { id: memId },
    data: {
      played:  { increment: 1 },
      won:     won ? { increment: 1 } : undefined,
      lost:    won ? undefined : { increment: 1 },
      points:  won ? { increment: WIN_PTS } : undefined,
      funds:   { increment: won ? WIN_INCOME : LOSS_INCOME },
    },
  });
}
async function grantIncome(memId: string, won: boolean){
  await prisma.worldMembership.update({
    where: { id: memId },
    data: { funds: { increment: won ? WIN_INCOME : LOSS_INCOME } },
  });
}
/* speeldag-effect: kapitein + dek-leden vechten (groei + −6 conditie),
   de bank rust volledig uit (cond -> 100) */
async function applyFight(m: Mem){
  await prisma.worldMembership.update({
    where: { id: m.id },
    data: {
      capP: Math.min(STAT_CAP, m.capP + 1),
      capD: Math.min(STAT_CAP, m.capD + 1),
      capS: Math.min(STAT_CAP, m.capS + 1),
      capCond: Math.max(0, m.capCond - FIGHT_COND_COST),
    },
  });
  const deck = [...new Set(deckOf(m).map(x => x.name))];   // namen op het dek

  if (deck.length){
    await prisma.squadMember.updateMany({ where: { membershipId: m.id, name: { in: deck }, p: { lt: STAT_CAP } }, data: { p: { increment: 1 } } });
    await prisma.squadMember.updateMany({ where: { membershipId: m.id, name: { in: deck }, d: { lt: STAT_CAP } }, data: { d: { increment: 1 } } });
    await prisma.squadMember.updateMany({ where: { membershipId: m.id, name: { in: deck }, s: { lt: STAT_CAP } }, data: { s: { increment: 1 } } });
    await prisma.squadMember.updateMany({ where: { membershipId: m.id, name: { in: deck } }, data: { cond: { decrement: FIGHT_COND_COST } } });
    await prisma.squadMember.updateMany({ where: { membershipId: m.id, cond: { lt: 0 } }, data: { cond: 0 } });
    // bank (alles wat niet op het dek staat): volledig uitgerust in één beurt
    await prisma.squadMember.updateMany({ where: { membershipId: m.id, name: { notIn: deck } }, data: { cond: 100 } });
  } else {
    // niemand op het dek -> alleen de kapitein vocht; rest van de crew rust uit
    await prisma.squadMember.updateMany({ where: { membershipId: m.id }, data: { cond: 100 } });
  }
  await prisma.squadMember.updateMany({ where: { membershipId: m.id, cond: { gt: 100 } }, data: { cond: 100 } });
}

/* ====================================================================
   Dagen oplossen
   ==================================================================== */
async function resolveNormalDay(worldId: string, day: number){
  const matches = await prisma.match.findMany({ where: { worldId, day, played: false } });
  if (!matches.length) return;
  const ids = new Set<string>(); matches.forEach(m => { ids.add(m.homeId); ids.add(m.awayId); });
  const mems = await loadMems(worldId, [...ids]);
  for (const mt of matches){
    const H = mems.get(mt.homeId), A = mems.get(mt.awayId);
    if (!H || !A) continue;
    const homeWon = outcome(crewStrength(H), crewStrength(A)) === "W";
    const sc = makeScore();
    await prisma.match.update({ where: { id: mt.id }, data: {
      homeScore: homeWon ? sc.w : sc.l, awayScore: homeWon ? sc.l : sc.w, played: true,
    }});
    await applyResult(mt.homeId, homeWon);
    await applyResult(mt.awayId, !homeWon);
    await applyFight(H);
    await applyFight(A);
    const winner = homeWon ? H : A;
      if (winner.userId) bumpMissions(winner.userId, worldId, "matchWin").catch(() => {});
  }
}

async function resolveNavyDay(worldId: string, day: number){
  const idx  = NAVY_DAYS.indexOf(day);
  const mems = await loadMems(worldId);
  const arr  = [...mems.values()];
  if (!arr.length) return;
  const avg     = arr.reduce((a, m) => a + crewStrength(m), 0) / arr.length;
  const admiral = avg * (NAVY_RAMP[idx] ?? 1.0);
  for (const m of arr){
    const won = outcome(crewStrength(m), admiral) === "W";
    await grantIncome(m.id, won);
    await applyFight(m);
  }
}

async function resolveRestDay(worldId: string){
  await prisma.worldMembership.updateMany({ where: { worldId }, data: { capCond: 100 } });
  await prisma.squadMember.updateMany({ where: { membership: { worldId } }, data: { cond: 100 } });
}

/* ====================================================================
   Dag 30 — Laugh Tale Grand Tournament (top 8, single-elimination)
   ==================================================================== */
async function runTournament(worldId: string){
  const mems = [...(await loadMems(worldId)).values()];
  const sorted = mems.slice().sort((a, b) => (b.points! - a.points!) || (crewBountyRaw(b) - crewBountyRaw(a)));
  const seeds  = sorted.slice(0, 8).map(m => m.id);
  while (seeds.length < 8) seeds.push("");

  const nameOf = (id: string) => mems.find(m => m.id === id)?.crewName || "—";
  const strOf  = (id: string) => { const m = mems.find(x => x.id === id); return m ? crewStrength(m) : 0; };

  let round: [string, string][] = [
    [seeds[0], seeds[7]], [seeds[3], seeds[4]], [seeds[2], seeds[5]], [seeds[1], seeds[6]],
  ];
  const rounds: { a: string; an: string; b: string; bn: string; w: string; wn: string }[][] = [];
  let champion = "";
  while (true){
    const resolved = round.map(([a, b]) => {
      const w = (a && b) ? (outcome(strOf(a), strOf(b)) === "W" ? a : b) : (a || b);
      return { a, an: nameOf(a), b, bn: nameOf(b), w, wn: nameOf(w) };
    });
    rounds.push(resolved);
    if (resolved.length === 1){ champion = resolved[0].w; break; }
    const winners = resolved.map(m => m.w);
    const next: [string, string][] = [];
    for (let i = 0; i < winners.length; i += 2) next.push([winners[i], winners[i + 1]]);
    round = next;
  }

  const bracket = {
    seeds: seeds.map((id, i) => ({ id, name: nameOf(id), seed: i + 1 })),
    rounds,
    champion: { id: champion, name: nameOf(champion) },
  };
  await prisma.world.update({ where: { id: worldId }, data: { bracket: bracket as any, status: "finished" } });
}

/* ====================================================================
   Eén dag vooruit + synchronisatie
   ==================================================================== */
const busy = new Set<string>();

export async function advanceWorldDay(worldId: string){
  if (busy.has(worldId)) return { skipped: true };
  busy.add(worldId);
  try {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world || world.status !== "active") return { status: world?.status };
    const cur  = world.currentDay ?? 0;
    const next = cur + 1;
    if (next > TOTAL_DAYS) return { status: "finished" };

    await prisma.world.update({ where: { id: worldId }, data: { currentDay: next } });
    const type = islandType(next);
    if      (type === "normal") await resolveNormalDay(worldId, next);
    else if (type === "navy")   await resolveNavyDay(worldId, next);
    else if (type === "rest")   await resolveRestDay(worldId);
    else if (type === "final"){ await runTournament(worldId); return { day: next, type, status: "finished" }; }

    try { await tickWorldDay(worldId); } catch (e) { /* markt mag de speeldag niet blokkeren */ }
    return { day: next, type, status: "active" };
  } finally {
    busy.delete(worldId);
  }
}

export async function syncWorld(worldId: string){
  const world = await prisma.world.findUnique({ where: { id: worldId } });
  if (!world || world.status !== "active") return;
  const target = expectedDay(world.recruitsUntil, new Date());
  let guard = 0;
  while (guard++ < TOTAL_DAYS + 2){
    const w = await prisma.world.findUnique({ where: { id: worldId } });
    if (!w || w.status !== "active") break;
    if ((w.currentDay ?? 0) >= target) break;
    if ((w.currentDay ?? 0) >= TOTAL_DAYS) break;
    await advanceWorldDay(worldId);
  }
}

export async function syncAllActiveWorlds(){
  const worlds = await prisma.world.findMany({ where: { status: "active" }, select: { id: true } });
  for (const w of worlds){
    try { await syncWorld(w.id); } catch (e) { console.error("[engine] sync wereld", w.id, e); }
  }
}

/* ====================================================================
   Kalender bouwen
   ==================================================================== */
export async function buildSeasonCalendar(worldId: string){
  const members = await prisma.worldMembership.findMany({ where: { worldId }, select: { id: true } });
  const rounds  = roundRobinRounds(members.map(m => m.id));
  await prisma.match.deleteMany({ where: { worldId } });
  if (!rounds.length) return;

  const rows: any[] = [];
  for (let day = 1; day <= TOTAL_DAYS; day++){
    if (islandType(day) !== "normal") continue;
    const r = rounds[(day - 1) % rounds.length];
    for (const [home, away] of r) rows.push({ worldId, day, homeId: home, awayId: away, played: false });
  }
  if (rows.length) await prisma.match.createMany({ data: rows });
}

function roundRobinRounds(ids: string[]): [string, string][][] {
  const teams = ids.slice();
  if (teams.length < 2) return [];
  if (teams.length % 2 === 1) teams.push("__BYE__");
  const n = teams.length, R = n - 1, half = n / 2;
  const rounds: [string, string][][] = [];
  let arr = teams.slice();
  for (let r = 0; r < R; r++){
    const pairs: [string, string][] = [];
    for (let i = 0; i < half; i++){
      const h = arr[i], a = arr[n - 1 - i];
      if (h !== "__BYE__" && a !== "__BYE__") pairs.push(r % 2 === 0 ? [h, a] : [a, h]);
    }
    rounds.push(pairs);
    arr = [arr[0], ...arr.slice(2), arr[1]];
  }
  return rounds;
}

/* ====================================================================
   19:00 Europe/Amsterdam — speeldag-momenten
   ==================================================================== */
function amsOffsetMinutes(d: Date): number {
  const ams = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Amsterdam" }));
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((ams.getTime() - utc.getTime()) / 60000);
}
function nineteenAms(y: number, m: number, day: number): Date {
  const probe = new Date(Date.UTC(y, m, day, 12, 0, 0));
  const off = amsOffsetMinutes(probe);
  return new Date(Date.UTC(y, m, day, 19, 0, 0) - off * 60000);
}
function expectedDay(recruitsUntil: Date | null, now: Date): number {
  if (!recruitsUntil) return 0;
  const startAms = new Date(new Date(recruitsUntil.getTime() - 24 * 3600 * 1000)
    .toLocaleString("en-US", { timeZone: "Europe/Amsterdam" }));
  let y = startAms.getFullYear(), m = startAms.getMonth(), d = startAms.getDate();
  let count = 0;
  for (let i = 0; i < TOTAL_DAYS + 10; i++){
    const inst = nineteenAms(y, m, d);
    if (inst > recruitsUntil && inst <= now) count++;
    const nx = new Date(Date.UTC(y, m, d) + 24 * 3600 * 1000);
    y = nx.getUTCFullYear(); m = nx.getUTCMonth(); d = nx.getUTCDate();
    if (count >= TOTAL_DAYS) break;
  }
  return Math.min(TOTAL_DAYS, count);
}

/* ====================================================================
   Routes
   ==================================================================== */
function uid(req: Request): string {
  const id = (req as any).user?.id ?? (req as any).userId ?? (req as any).auth?.userId;
  if (!id) throw Object.assign(new Error("Niet ingelogd."), { status: 401 });
  return id;
}

const router = Router();
router.post("/leagues/:id/advance", async (req: Request, res: Response) => {
  try {
    const me = uid(req);
    const world = await prisma.world.findUnique({ where: { id: req.params.id } });
    if (!world) return res.status(404).json({ error: "League bestaat niet." });
    if (world.hostId && world.hostId !== me) return res.status(403).json({ error: "Alleen de host kan handmatig vooruitspoelen." });
    if (world.status !== "active") return res.status(400).json({ error: "De league is niet actief." });
    const r = await advanceWorldDay(world.id);
    res.json(r);
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get("/leagues/:id/match", async (req: Request, res: Response) => {
  try {
    const me = uid(req);
    const myMem = await prisma.worldMembership.findFirst({ where: { worldId: req.params.id, userId: me } });
    if (!myMem) return res.status(403).json({ error: "Je zit niet in deze league." });

    const where: any = { worldId: req.params.id, played: true, OR: [{ homeId: myMem.id }, { awayId: myMem.id }] };
    if (req.query.day) where.day = Number(req.query.day);
    const match = await prisma.match.findFirst({ where, orderBy: { day: "desc" } });
    if (!match) return res.json({ none: true });

    const mems = await loadMems(req.params.id, [match.homeId, match.awayId]);
    const H = mems.get(match.homeId), A = mems.get(match.awayId);
    if (!H || !A) return res.json({ none: true });
    const iAmHome = match.homeId === myMem.id;
    const meM = iAmHome ? H : A, opM = iAmHome ? A : H;
    const myScore = (iAmHome ? match.homeScore : match.awayScore) ?? 0;
    const opScore = (iAmHome ? match.awayScore : match.homeScore) ?? 0;

    const pack = (m: Mem) => ({
      crewName: m.crewName, captain: m.captain,
      captainStats: { p: m.capP, d: m.capD, s: m.capS },
      deck: deckOf(m).map(x => ({ name: x.name, role: x.role, p: x.p, d: x.d, s: x.s })),
    });

    res.json({
      day: match.day, type: "normal",
      res: myScore >= opScore ? "W" : "L",
      myScore, opScore,
      you: pack(meM), opp: pack(opM),
      youName: meM.crewName, oppName: opM.crewName,
    });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

export const engineRouter = router;
export default router;