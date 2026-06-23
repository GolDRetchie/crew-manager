// ============================================================================
//  achievements.ts — account-brede achievements + captain-XP
//  Plek:  server/src/achievements.ts   (naast online.ts, engine.ts, market.ts)
//
//  Mount in index.ts, met dezelfde auth-middleware ervoor als bij online.ts:
//      import achievementsRouter from "./achievements";
//      app.use("/api/achievements", <jouw-auth>, achievementsRouter);
//  (kopieer letterlijk wat er bij jou tussen het pad en `onlineRouter` staat;
//   staat daar niets, dan staat je auth waarschijnlijk globaal vóór alle /api-routes)
//
//  Schema (al gemigreerd):  User.xp Int @default(0)  +  model UserAchievement.
//
//  Endpoints:
//    GET  /api/achievements         -> { xp, unlocked: [{ id, unlockedAt }] }
//    POST /api/achievements/check    body { worldId } -> { xp, newlyUnlocked: [ids] }
//
//  De server is leidend: hij rekent de condities uit én kent de XP per trophy.
//  De frontend-catalog (mp-achievements.js) toont alleen; de ids + XP-waarden
//  hieronder MOETEN gelijk blijven aan die in mp-achievements.js.
// ============================================================================

import { Router, Request, Response } from "express";
import { prisma } from "./prisma";

function uid(req: Request): string {
  const id = (req as any).user?.id ?? (req as any).userId ?? (req as any).auth?.userId;
  if (!id) throw Object.assign(new Error("Niet ingelogd."), { status: 401 });
  return id;
}

// ---- catalog: id -> XP (gelijk houden met de frontend) ----
const XP: Record<string, number> = {
  bounty_10m: 10, bounty_100m: 25, bounty_500m: 25, bounty_1b: 60, bounty_3b: 150,
  league_debut: 10, league_firstwin: 10, league_top4: 25, league_champ: 60, league_invincible: 150,
  crew_first: 10, crew_full: 25,
  secret_almostking: 40,
};

const ROSTER_CAP = 13;                            // "volle crew" = 13/13 (zoals lineup.ts)
const BOUNTY_TIERS: Array<[string, number]> = [   // crew-bounty drempels
  ["bounty_10m",     10_000_000],
  ["bounty_100m",   100_000_000],
  ["bounty_500m",   500_000_000],
  ["bounty_1b",   1_000_000_000],
  ["bounty_3b",   3_000_000_000],
];

// crew-bounty exact zoals engine.ts crewBountyRaw / mp-crew.js totalBounty:
//   per blok (kapitein + elk lid):  max(1, p+d+s) * 1.000.000
function bountyTerm(sum: number){ return Math.max(1, sum) * 1_000_000; }
function crewBounty(mem: { capP: number; capD: number; capS: number; squad: Array<{ p: number; d: number; s: number }> }): number {
  let b = bountyTerm(mem.capP + mem.capD + mem.capS);
  for (const q of mem.squad) b += bountyTerm(q.p + q.d + q.s);
  return b;
}

// eindstand uit de Grand Tournament-bracket (zie engine.ts runTournament):
//   bracket.champion.id  = winnaar ; laatste ronde = finale ; voorlaatste = halve finales (4 crews)
function finishInfo(bracket: any, myId: string){
  const rounds: any[] = (bracket && bracket.rounds) || [];
  const champion = !!(bracket && bracket.champion && bracket.champion.id === myId);
  let runnerUp = false, top4 = false;
  if (rounds.length){
    const final = rounds[rounds.length - 1] && rounds[rounds.length - 1][0];
    if (final){ const loser = final.w === final.a ? final.b : final.a; runnerUp = (loser === myId); }
    const semis = rounds[rounds.length - 2] || [];
    for (const m of semis){ if (m.a === myId || m.b === myId){ top4 = true; break; } }
  }
  return { champion, runnerUp, top4 };
}

// welke trophy-ids zijn op dit moment verdiend in deze league?
async function metInWorld(worldId: string, userId: string): Promise<Set<string>> {
  const met = new Set<string>();

  const mem = await prisma.worldMembership.findFirst({
    where: { worldId, userId },
    include: { squad: { select: { p: true, d: true, s: true } } },
  });
  if (!mem) return met;

  // --- bounty-ladder ---
  const cb = crewBounty(mem);
  for (const [id, th] of BOUNTY_TIERS) if (cb >= th) met.add(id);

  // --- league: meedoen + eerste winst ---
  if (mem.played >= 1) met.add("league_debut");
  if (mem.won >= 1)    met.add("league_firstwin");

  // --- crew: eerste lid + volle crew ---
  const size = mem.squad.length;
  if (size >= 1)          met.add("crew_first");
  if (size >= ROSTER_CAP) met.add("crew_full");

  // --- seizoenseinde -> Grand Tournament-uitslag ---
  const world = await prisma.world.findUnique({ where: { id: worldId } });
  if (world && world.status === "finished" && (world as any).bracket){
    const fin = finishInfo((world as any).bracket, mem.id);
    if (fin.top4)                       met.add("league_top4");
    if (fin.champion)                   met.add("league_champ");
    if (fin.champion && mem.lost === 0) met.add("league_invincible");
    if (fin.runnerUp)                   met.add("secret_almostking");
  }

  return met;
}

const router = Router();

// GET /api/achievements -> { xp, unlocked }
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = uid(req);
    const [user, rows] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { xp: true } }),
      prisma.userAchievement.findMany({ where: { userId }, select: { achievementId: true, unlockedAt: true } }),
    ]);
    res.json({
      xp: user?.xp ?? 0,
      unlocked: rows.map(r => ({ id: r.achievementId, unlockedAt: r.unlockedAt })),
    });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/achievements/check  body { worldId } -> { xp, newlyUnlocked }
router.post("/check", async (req: Request, res: Response) => {
  try {
    const userId  = uid(req);
    const worldId = (req.body && req.body.worldId) || null;

    const met = worldId ? await metInWorld(String(worldId), userId) : new Set<string>();

    const already = await prisma.userAchievement.findMany({ where: { userId }, select: { achievementId: true } });
    const have = new Set(already.map(a => a.achievementId));
    const newly = [...met].filter(id => XP[id] != null && !have.has(id));

    if (newly.length){
      const gained = newly.reduce((s, id) => s + XP[id], 0);
      await prisma.$transaction([
        prisma.userAchievement.createMany({ data: newly.map(id => ({ userId, achievementId: id })), skipDuplicates: true }),
        prisma.user.update({ where: { id: userId }, data: { xp: { increment: gained } } }),
      ]);
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } });
    res.json({ xp: user?.xp ?? 0, newlyUnlocked: newly });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

export const achievementsRouter = router;
export default router;