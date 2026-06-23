"use strict";

/* ====================================================================
   lineup.ts — opstelling (generieke dek-posities + bank) voor online leagues

   STAP 4b verwerkt:
   - deck is nu een GENERIEKE LIJST van namen: { deck: [naam|null x N], bench: [...] }.
     Rol-positie telt niet meer; een lid mag op elke dekplek staan.
   - Dek-grootte volgt het schip: deck = min(cap, 9).
   - Bank is altijd beschikbaar (rust): bench = max(BENCH_MIN, cap - 9).
   - Oude opstellingen met deck: { role: naam } worden automatisch ingelezen
     en omgezet naar de nieuwe lijst (backward-compat, geen migratie nodig).

   Plek:  server/src/lineup.ts
   Mount in index.ts:   app.use("/api/online", lineupRouter)
   ==================================================================== */

import { Router, Request, Response } from "express";
import { prisma } from "./prisma";
import { bumpMissions } from "./missions";
import { SHIP_TIERS, rosterCapForTier } from "./config/shipTiers";

// rol-volgorde, alleen nog gebruikt om oude rol-objecten in te lezen
const DECK_ROLES = ["Swordsman", "Sniper", "Chef", "Doctor", "Archaeologist",
                    "Shipwright", "Musician", "Navigator", "Helmsman"];
const MAX_DECK   = 9;     // maximaal 9 vechten
const BENCH_MIN  = 2;     // altijd minstens 2 bankplekken (ook op een dinghy)

function uid(req: Request): string {
  const id = (req as any).user?.id ?? (req as any).userId ?? (req as any).auth?.userId;
  if (!id) throw Object.assign(new Error("Niet ingelogd."), { status: 401 });
  return id;
}
async function myMembership(worldId: string, userId: string){
  return prisma.worldMembership.findFirst({ where: { worldId, userId }, include: { squad: true } });
}

function deckSize(cap: number){ return Math.min(cap, MAX_DECK); }
function benchSize(cap: number){ return Math.max(BENCH_MIN, cap - MAX_DECK); }

/* lees dek-namen uit beide formaten (nieuw = array, oud = rol-object) */
function namesFromDeck(rawDeck: any): string[] {
  if (Array.isArray(rawDeck)) return rawDeck.filter(Boolean);
  if (rawDeck && typeof rawDeck === "object") return DECK_ROLES.map(r => rawDeck[r]).filter(Boolean);
  return [];
}

/* opschonen + automatisch aanvullen op basis van wie je nu bezit + je tier */
function reconcile(raw: any, owned: string[], cap: number){
  const dN = deckSize(cap), bN = benchSize(cap);
  const ownedSet = new Set(owned);
  const seen = new Set<string>();
  const keep = (list: any[]) => {
    const out: string[] = [];
    for (const n of list){ if (n && ownedSet.has(n) && !seen.has(n)){ out.push(n); seen.add(n); } }
    return out;
  };

  const deckIn  = keep(namesFromDeck(raw && raw.deck));
  const benchIn = keep(Array.isArray(raw && raw.bench) ? raw.bench : []);

  // dek: vaste lengte dN, vul met de eerste dN dek-namen
  const deck: (string | null)[] = new Array(dN).fill(null);
  for (let i = 0; i < dN && i < deckIn.length; i++) deck[i] = deckIn[i];
  const overflow = deckIn.slice(dN);   // wat niet meer op een kleiner dek past

  // bank: vaste lengte bN
  const bench: (string | null)[] = new Array(bN).fill(null);
  let bi = 0;
  const placeBench = (n: string) => { while (bi < bN && bench[bi]) bi++; if (bi < bN){ bench[bi] = n; return true; } return false; };
  for (const n of benchIn) placeBench(n);
  for (const n of overflow) placeBench(n);

  // resterende eigen leden: eerst lege dekplek, anders bank
  const placed = new Set<string>([...deck, ...bench].filter(Boolean) as string[]);
  for (const name of owned){
    if (placed.has(name)) continue;
    const di = deck.indexOf(null);
    if (di >= 0){ deck[di] = name; placed.add(name); continue; }
    if (placeBench(name)){ placed.add(name); }
    // geen plek meer (zou niet voorkomen, posities >= cap) -> blijft ongeplaatst
  }
  return { deck, bench };
}

function shipView(m: any){
  return {
    shipTier: m.shipTier,
    tierName: SHIP_TIERS[(m.shipTier as 1|2|3)]?.name ?? SHIP_TIERS[1].name,
    rosterCap: rosterCapForTier(m.shipTier),
    hullColor: m.hullColor, deckColor: m.deckColor, sailColor: m.sailColor,
    trimColor: m.trimColor, jollyRoger: m.jollyRoger, figurehead: m.figurehead,
  };
}

const router = Router();

/* GET de opstelling + je crew (gereconcilieerd) */
router.get("/leagues/:id/lineup", async (req: Request, res: Response) => {
  try {
    const me = await myMembership(req.params.id, uid(req));
    if (!me) return res.status(403).json({ error: "Je zit niet in deze league." });
    bumpMissions(uid(req), req.params.id, "viewCrew").catch(() => {});

    const cap    = rosterCapForTier(me.shipTier);
    const owned  = me.squad.map(s => s.name);
    const lineup = reconcile(me.lineup, owned, cap);
    await prisma.worldMembership.update({ where: { id: me.id }, data: { lineup: lineup as any } });

    res.json({
      crewName: me.crewName, captain: me.captain,
      captainStats: { p: me.capP, d: me.capD, s: me.capS, cond: me.capCond },
      rosterCap: cap,
      ship: shipView(me),
      squad: me.squad.map(s => ({ name: s.name, role: s.role, altRoles: s.altRoles, p: s.p, d: s.d, s: s.s, cond: s.cond })),
      lineup,
    });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* POST de opstelling opslaan: { lineup: { deck:[...], bench:[...] } } */
router.post("/leagues/:id/lineup", async (req: Request, res: Response) => {
  try {
    const me = await myMembership(req.params.id, uid(req));
    if (!me) return res.status(403).json({ error: "Je zit niet in deze league." });

    const cap   = rosterCapForTier(me.shipTier);
    const owned = me.squad.map(s => s.name);
    const incoming = req.body?.lineup || {};
    // reconcile valideert zelf: alleen eigen leden, dedupe, juiste lengtes
    const lineup = reconcile({ deck: incoming.deck, bench: incoming.bench }, owned, cap);

    await prisma.worldMembership.update({ where: { id: me.id }, data: { lineup: lineup as any } });
    bumpMissions(uid(req), req.params.id, "viewCrew").catch(() => {});
    res.json({ ok: true, lineup });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

export const lineupRouter = router;
export default router;