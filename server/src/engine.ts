"use strict";

/* ====================================================================
   engine.ts — de gedeelde wedstrijdmotor voor online leagues (brok 4)

   Plek:  server/src/engine.ts   (naast online.ts, market.ts)

   Wat hij doet (1-op-1 geport uit game-league.js / game-tournament.js):
   - 30-dagen eilandenkalender: gewone speeldagen, navy-dagen (marine),
     rustdagen en op dag 30 de Laugh Tale Grand Tournament (top 8).
   - kracht = kapitein × conditie + bemanning × conditie  (condFactor 0.6–1.0)
   - uitslag met ±22% ruis -> W/L (geen gelijkspel)
   - per gevecht: +1/+1/+1 groei, -12 conditie; +3,5M winst / +3M verlies; 3 pt/win
   - rustdag: volledige conditie terug
   - dag 0 = voorbereidingsdag (geen wedstrijd — bouw je crew op de markt)

   Mount in index.ts:   app.use("/api/online", engineRouter)
                        (zelfde auth-middleware ervoor als bij online.ts/market.ts)
   Aangeroepen door:    online.ts closeAndFill -> buildSeasonCalendar(worldId)
                        scheduler.ts          -> syncAllActiveWorlds()

   ── Aannames die ik maakte waar single-player het niet hard vastlegde
   1. NAVY-DAGEN tellen NIET mee in de ranglijst: je vecht tegen de admiraal
      voor inkomen + groei + conditieverlies, maar winst/verlies levert geen
      competitiepunten op. De admiraal schaalt mee met de league (gemiddelde
      crew-kracht) en wordt per navy-dag zwaarder.
   2. KRACHT telt voorlopig ÁLLE bemanningsleden mee (max 13). Zodra de
      opstelling (9 dek + 4 bank) er is, beperk ik dit tot het dek.
   ==================================================================== */

import { Router, Request, Response } from "express";
import { prisma } from "./prisma";
import { tickWorldDay } from "./market";
import { bumpMissions } from "./missions";

/* ---- kalender ---- */
const TOTAL_DAYS = 30;
const REST_DAYS  = new Set([6, 12, 18, 24, 29]);
const NAVY_DAYS  = [7, 15, 20, 27];                 // index -> oplopende admiraal-zwaarte
const NAVY_RAMP  = [0.85, 1.0, 1.10, 1.25];
const FINAL_DAY  = 30;

/* ---- regels (uit game-league.js) ---- */
const WIN_PTS         = 3;
const WIN_INCOME      = 3_500_000;
const LOSS_INCOME     = 3_000_000;
const FIGHT_COND_COST = 12;
const STAT_CAP        = 99;
const NOISE           = 0.22;                        // ±22% ruis op de uitslag

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

/* ---- opstelling: alleen de 9 op het dek vechten (met rol-bonus) ---- */
const DECK_ROLES = ["Swordsman", "Sniper", "Chef", "Doctor", "Archaeologist",
                    "Shipwright", "Musician", "Navigator", "Helmsman"];
const FIT_BONUS     = 1.10;   // lid staat in z'n eigen rol
const FIT_OFF       = 0.90;   // off-role (kleine malus)
const BENCH_RECOVER = 20;     // bankleden herstellen conditie per speeldag (cap 100)

function fitMult(member: SquadM, role: string): number {
  if (member.role === role || (Array.isArray(member.altRoles) && member.altRoles.indexOf(role) >= 0)) return FIT_BONUS;
  if (member.role === "Crewmate") return 1.0;
  return FIT_OFF;
}
// de (max 9) dek-leden: uit de opgeslagen opstelling, anders de 9 sterkste in hun eigen rol
function deckOf(m: Mem): { role: string; member: SquadM }[] {
  const lu = m.lineup;
  if (lu && lu.deck){
    const byName = new Map(m.squad.map(s => [s.name, s] as [string, SquadM]));
    const out: { role: string; member: SquadM }[] = [];
    for (const role of DECK_ROLES){ const nm = lu.deck[role]; const mem = nm ? byName.get(nm) : undefined; if (mem) out.push({ role, member: mem }); }
    return out;
  }
  return m.squad.slice().sort((a, b) => (b.p + b.d + b.s) - (a.p + a.d + a.s)).slice(0, 9).map(s => ({ role: s.role, member: s }));
}

function crewStrength(m: Mem): number {
  let s = bounty(m.capP + m.capD + m.capS) * condFactor(m.capCond);
  for (const { role, member } of deckOf(m)) s += bounty(member.p + member.d + member.s) * condFactor(member.cond) * fitMult(member, role);
  return s;
}
function crewBountyRaw(m: Mem): number {            // zonder conditie — voor toernooi-seeding/tiebreak
  let s = bounty(m.capP + m.capD + m.capS);
  for (const q of m.squad) s += bounty(q.p + q.d + q.s);
  return s;
}
/* ±22% ruis, hoogste wint — vanuit a's perspectief (zoals `outcome` in SP) */
function outcome(sa: number, sb: number): "W" | "L" {
  const na = sa * (1 + (Math.random() * 2 - 1) * NOISE);
  const nb = sb * (1 + (Math.random() * 2 - 1) * NOISE);
  return na >= nb ? "W" : "L";
}
/* cosmetische KO-score voor de fixtures-weergave */
function makeScore(){
  const w = 2 + Math.floor(Math.random() * 3);              // 2..4
  const l = Math.max(0, Math.min(w - 1, Math.floor(Math.random() * w)));
  return { w, l };
}

/* ---- crews laden (met kapitein-stats + bemanning) ---- */
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

/* ---- uitslag toepassen op één crew ---- */
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
/* alleen inkomen — voor de navy-dag, die niet meetelt in de ranglijst */
async function grantIncome(memId: string, won: boolean){
  await prisma.worldMembership.update({
    where: { id: memId },
    data: { funds: { increment: won ? WIN_INCOME : LOSS_INCOME } },
  });
}
/* speeldag-effect: kapitein + de 9 dek-leden vechten (groei + -12 conditie),
   de bank rust en herstelt conditie (+20, cap 100) */
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
  const deck = [...new Set(deckOf(m).map(x => x.member.name))];   // namen op het dek

  if (deck.length){
    // dek: +1/+1/+1 (cap 99) + -12 conditie (floor 0)
    await prisma.squadMember.updateMany({ where: { membershipId: m.id, name: { in: deck }, p: { lt: STAT_CAP } }, data: { p: { increment: 1 } } });
    await prisma.squadMember.updateMany({ where: { membershipId: m.id, name: { in: deck }, d: { lt: STAT_CAP } }, data: { d: { increment: 1 } } });
    await prisma.squadMember.updateMany({ where: { membershipId: m.id, name: { in: deck }, s: { lt: STAT_CAP } }, data: { s: { increment: 1 } } });
    await prisma.squadMember.updateMany({ where: { membershipId: m.id, name: { in: deck } }, data: { cond: { decrement: FIGHT_COND_COST } } });
    await prisma.squadMember.updateMany({ where: { membershipId: m.id, cond: { lt: 0 } }, data: { cond: 0 } });
    // bank: herstelt conditie, groeit niet
    await prisma.squadMember.updateMany({ where: { membershipId: m.id, name: { notIn: deck } }, data: { cond: { increment: BENCH_RECOVER } } });
  } else {
    // niemand gekocht -> alleen de kapitein vocht; niets te doen voor de bemanning
  }
  await prisma.squadMember.updateMany({ where: { membershipId: m.id, cond: { gt: 100 } }, data: { cond: 100 } });
}

/* ====================================================================
   Dagen oplossen
   ==================================================================== */

/* gewone speeldag: crew-vs-crew uit de kalender (Match-rijen) */
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

/* navy-dag: elke crew vecht tegen een admiraal die met de league meeschaalt.
   Telt NIET mee in de ranglijst — alleen inkomen + groei + conditieverlies. */
async function resolveNavyDay(worldId: string, day: number){
  const idx  = NAVY_DAYS.indexOf(day);
  const mems = await loadMems(worldId);
  const arr  = [...mems.values()];
  if (!arr.length) return;
  const avg     = arr.reduce((a, m) => a + crewStrength(m), 0) / arr.length;
  const admiral = avg * (NAVY_RAMP[idx] ?? 1.0);
  for (const m of arr){
    const won = outcome(crewStrength(m), admiral) === "W";
    await grantIncome(m.id, won);   // geen punten/record — alleen Berries
    await applyFight(m);
  }
}

/* rustdag: iedereen volledig op conditie, geen wedstrijd */
async function resolveRestDay(worldId: string){
  await prisma.worldMembership.updateMany({ where: { worldId }, data: { capCond: 100 } });
  await prisma.squadMember.updateMany({ where: { membership: { worldId } }, data: { cond: 100 } });
}

/* ====================================================================
   Dag 30 — Laugh Tale Grand Tournament (top 8, single-elimination)
   Geport uit game-tournament.js: seeding 1-8 / 4-5 / 3-6 / 2-7.
   Alle crews zitten op de server, dus de hele bracket wordt in één keer
   uitgerekend en als JSON op de wereld bewaard (frontend-viewer = aparte brok).
   ==================================================================== */
async function runTournament(worldId: string){
  const mems = [...(await loadMems(worldId)).values()];
  const sorted = mems.slice().sort((a, b) => (b.points! - a.points!) || (crewBountyRaw(b) - crewBountyRaw(a)));
  const seeds  = sorted.slice(0, 8).map(m => m.id);
  while (seeds.length < 8) seeds.push("");                  // padding (zou bij 12 crews nooit nodig zijn)

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
   Eén dag vooruit + zelfherstellende synchronisatie
   ==================================================================== */
const busy = new Set<string>();                              // simpele lock (1 server-instantie)

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

/* haal een wereld bij naar de dag die hij volgens de klok zou moeten hebben
   (werkt ook als de server even uit stond — speelt gemiste dagen netjes in) */
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
   Kalender bouwen (aangeroepen door online.ts closeAndFill)
   dag 0 = voorbereidingsdag (geen fixtures); normale dagen krijgen een
   roterende round-robin; navy/rust/finale-dagen krijgen géén Match-rijen.
   ==================================================================== */
export async function buildSeasonCalendar(worldId: string){
  const members = await prisma.worldMembership.findMany({ where: { worldId }, select: { id: true } });
  const rounds  = roundRobinRounds(members.map(m => m.id));
  await prisma.match.deleteMany({ where: { worldId } });
  if (!rounds.length) return;

  const rows: any[] = [];
  for (let day = 1; day <= TOTAL_DAYS; day++){
    if (islandType(day) !== "normal") continue;
    const r = rounds[(day - 1) % rounds.length];            // round-robin roteert over de reis
    for (const [home, away] of r) rows.push({ worldId, day, homeId: home, awayId: away, played: false });
  }
  if (rows.length) await prisma.match.createMany({ data: rows });
}

/* round-robin via de cirkel-methode -> array van (N-1) rondes met [home, away] */
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
    arr = [arr[0], ...arr.slice(2), arr[1]];                 // eerste vast, rest roteert
  }
  return rounds;
}

/* ====================================================================
   19:00 Europe/Amsterdam — hoeveel speeldag-momenten zijn er voorbij?
   (geen extra schema-veld nodig: we rekenen vanaf recruitsUntil)
   ==================================================================== */
function amsOffsetMinutes(d: Date): number {
  const ams = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Amsterdam" }));
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((ams.getTime() - utc.getTime()) / 60000);
}
function nineteenAms(y: number, m: number, day: number): Date {
  const probe = new Date(Date.UTC(y, m, day, 12, 0, 0));    // offset bepalen op het midden van de dag
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
   Route: host kan handmatig een speeldag draaien (test / vangnet).
   De echte motor draait automatisch om 19:00 via scheduler.ts.
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

/* je laatste (of dag-N) crew-vs-crew wedstrijd, met beide opstellingen — voor de battle-replay.
   navy-dagen worden (nog) niet bewaard, dus die komen hier niet terug. */
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
      deck: deckOf(m).map(x => ({ name: x.member.name, p: x.member.p, d: x.member.d, s: x.member.s })),
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