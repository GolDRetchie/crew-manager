"use strict";

/* ====================================================================
   ship.ts — schip-grootte (tiers) + customisation
   Mount in index.ts:  app.use("/api/online", requireAuth, shipRouter);
   ==================================================================== */

import { Router, Request, Response } from "express";
import { prisma } from "./prisma";
import {
  SHIP_TIERS, MAX_SHIP_TIER,
  rosterCapForTier, upgradePrice,
} from "./config/shipTiers";

// kostprijs per cosmetische wijziging (binnen 10k–100k)
const COSMETIC_PRICE: Record<string, number> = {
  hullColor: 15_000, deckColor: 15_000, trimColor: 15_000, sailColor: 20_000,
  jollyRoger: 40_000, figurehead: 75_000,
};
const JOLLY_ROGERS = ["skull","cross","crown","hat","horns","patch","bandana","flame"];
const FIGUREHEADS  = ["none","lion","dragon","shark","phoenix","mermaid","ram","serpent","swan"];
const HEX = /^#[0-9a-fA-F]{6}$/;

function uid(req: Request): string {
  const id = (req as any).user?.id ?? (req as any).userId ?? (req as any).auth?.userId;
  if (!id) throw Object.assign(new Error("Niet ingelogd."), { status: 401 });
  return id;
}
async function myMembership(worldId: string, userId: string) {
  return prisma.worldMembership.findFirst({ where: { worldId, userId } });
}
async function crewHasShipwright(membershipId: string): Promise<boolean> {
  const sw = await prisma.squadMember.findFirst({
    where: { membershipId, OR: [{ role: "Shipwright" }, { altRoles: { has: "Shipwright" } }] },
    select: { id: true },
  });
  return !!sw;
}
function shipView(m: any) {
  return {
    shipTier: m.shipTier,
    tierName: SHIP_TIERS[(m.shipTier as 1|2|3)]?.name ?? SHIP_TIERS[1].name,
    rosterCap: rosterCapForTier(m.shipTier),
    hullColor: m.hullColor, deckColor: m.deckColor, sailColor: m.sailColor,
    trimColor: m.trimColor, jollyRoger: m.jollyRoger, figurehead: m.figurehead,
  };
}

const router = Router();

/* GET /api/online/ship?worldId=... */
router.get("/ship", async (req: Request, res: Response) => {
  try {
    const userId = uid(req);
    const worldId = String(req.query.worldId || "");
    if (!worldId) return res.status(400).json({ error: "worldId ontbreekt." });
    const me = await myMembership(worldId, userId);
    if (!me) return res.status(403).json({ error: "Je zit niet in deze league." });
    const crewCount = await prisma.squadMember.count({ where: { membershipId: me.id } });
    res.json({ ship: shipView(me), crewCount, cap: rosterCapForTier(me.shipTier) });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* POST /api/online/ship/upgrade  body { worldId } */
router.post("/ship/upgrade", async (req: Request, res: Response) => {
  try {
    const userId = uid(req);
    const worldId = String(req.body?.worldId || "");
    if (!worldId) return res.status(400).json({ error: "worldId ontbreekt." });
    const me = await myMembership(worldId, userId);
    if (!me) return res.status(403).json({ error: "Je zit niet in deze league." });

    const toTier = me.shipTier + 1;
    if (toTier > MAX_SHIP_TIER)
      return res.status(400).json({ error: "Je vaart al op het grootste schip." });

    const hasSW = await crewHasShipwright(me.id);
    const price = upgradePrice(toTier, hasSW);
    if (me.funds < price)
      return res.status(400).json({ error: `Niet genoeg berries. Upgrade kost ${price.toLocaleString("en-US")}.` });

    const updated = await prisma.worldMembership.update({
      where: { id: me.id },
      data: { funds: me.funds - price, shipTier: toTier },
    });

    res.json({ ok: true, ship: shipView(updated), spent: price, discounted: hasSW, funds: updated.funds });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* POST /api/online/ship/cosmetics  body { worldId, changes:{ hullColor?, ... } } */
router.post("/ship/cosmetics", async (req: Request, res: Response) => {
  try {
    const userId = uid(req);
    const worldId = String(req.body?.worldId || "");
    if (!worldId) return res.status(400).json({ error: "worldId ontbreekt." });
    const me = await myMembership(worldId, userId);
    if (!me) return res.status(403).json({ error: "Je zit niet in deze league." });

    const changes = (req.body?.changes || {}) as Record<string, string>;
    const data: any = {};
    let cost = 0;

    for (const key of Object.keys(changes)) {
      const val = changes[key];
      if (!(key in COSMETIC_PRICE)) continue;
      if (key === "jollyRoger") {
        if (!JOLLY_ROGERS.includes(val)) return res.status(400).json({ error: "Onbekende Jolly Roger." });
      } else if (key === "figurehead") {
        if (!FIGUREHEADS.includes(val)) return res.status(400).json({ error: "Onbekend boegbeeld." });
      } else {
        if (!HEX.test(val)) return res.status(400).json({ error: `Ongeldige kleur voor ${key}.` });
      }
      if ((me as any)[key] !== val) { data[key] = val; cost += COSMETIC_PRICE[key]; }
    }

    if (Object.keys(data).length === 0)
      return res.json({ ok: true, ship: shipView(me), spent: 0, funds: me.funds });
    if (me.funds < cost)
      return res.status(400).json({ error: `Niet genoeg berries. Aanpassingen kosten ${cost.toLocaleString("en-US")}.` });

    const updated = await prisma.worldMembership.update({
      where: { id: me.id },
      data: { ...data, funds: me.funds - cost },
    });
    res.json({ ok: true, ship: shipView(updated), spent: cost, funds: updated.funds });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

export const shipRouter = router;
export default router;