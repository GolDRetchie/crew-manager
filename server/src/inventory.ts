"use strict";

/* ====================================================================
   inventory.ts — account-brede kaarten + toepassen op je crew

   Plek:  server/src/inventory.ts
   Mount in index.ts (mét requireAuth):
       import { inventoryRouter } from "./inventory";
       app.use("/api/inventory", requireAuth, inventoryRouter);

   Endpoints:
     GET  /api/inventory                       -> { items: [...] }
     POST /api/inventory/:itemId/apply
          role_card  body { worldId, squadMemberName }  -> rol toevoegen aan altRoles
                                                           + stat-bonus op p/d/s (rarity-schaal)
          stamina    body { worldId, squadMemberName }  -> cond ophogen (+25 / +50, cap 100)
          crew_card  body { worldId }                   -> SquadMember aanmaken
                                                           (respecteert de schip-tier roster-cap)
   Kaarten worden verbruikt (verwijderd) zodra ze succesvol zijn toegepast.
   ==================================================================== */

import { Router, Request, Response } from "express";
import { prisma } from "./prisma";
import { rosterCapForTier } from "./config/shipTiers";

// Welk stat-vak een role card opkrikt. Schuif rollen gerust tussen p/d/s.
const ROLE_STAT: Record<string, "p" | "d" | "s"> = {
  Swordsman: "p", Sniper: "p",
  Doctor: "d", Shipwright: "d", Archaeologist: "d",
  Navigator: "s", Helmsman: "s", Chef: "s", Musician: "s",
};
// De rol heeft zelf geen rarity; de rarity van de role card schaalt de bonus.
const ROLE_BONUS: Record<string, number> = { bronze: 4, silver: 8, gold: 12 };
const STAT_CAP = 99;   // role cards kappen op 99; 100-100-100 is alleen voor de tournament-winnaar
const COND_CAP = 100;  // stamina kapt op vol

function uid(req: Request): string {
  const id = (req as any).user?.id ?? (req as any).userId ?? (req as any).auth?.userId;
  if (!id) throw Object.assign(new Error("Niet ingelogd."), { status: 401 });
  return id;
}
async function pickActiveWorld(userId: string): Promise<string | null> {
  const m = await prisma.worldMembership.findFirst({
    where: { userId, world: { status: { in: ["active", "open"] } } },
    orderBy: { joinedAt: "desc" }, select: { worldId: true },
  });
  return m?.worldId ?? null;
}
async function myMembership(worldId: string, userId: string){
  return prisma.worldMembership.findFirst({ where: { worldId, userId } });
}

const router = Router();

/* GET /api/inventory -> alle (ongebruikte) kaarten */
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = uid(req);
    const items = await prisma.inventoryItem.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    res.json({ items: items.map(i => ({ id: i.id, kind: i.kind, value: i.value, rarity: i.rarity, data: i.data, createdAt: i.createdAt })) });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* POST /api/inventory/:itemId/apply */
router.post("/:itemId/apply", async (req: Request, res: Response) => {
  try {
    const userId = uid(req);
    const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.itemId } });
    if (!item || item.userId !== userId) return res.status(404).json({ error: "Kaart niet gevonden." });

    const worldId = (req.body?.worldId as string) || await pickActiveWorld(userId);
    if (!worldId) return res.status(400).json({ error: "Geen actieve league om de kaart in te gebruiken." });
    const me = await myMembership(worldId, userId);
    if (!me) return res.status(403).json({ error: "Je zit niet in deze league." });

    if (item.kind === "role_card"){
      const name = String(req.body?.squadMemberName || "").trim();
      if (!name) return res.status(400).json({ error: "Kies een crewlid om de rol op toe te passen." });
      const sm = await prisma.squadMember.findFirst({ where: { membershipId: me.id, name } });
      if (!sm) return res.status(404).json({ error: "Dit crewlid zit niet in je crew." });
      const roles = Array.isArray(sm.altRoles) ? sm.altRoles.slice() : [];
      if (sm.role === item.value || roles.includes(item.value))
        return res.status(400).json({ error: name + " kan deze rol al spelen." });
      roles.push(item.value);

      // stat-bonus: de rol bepaalt het vak (p/d/s), de rarity bepaalt de grootte
      const stat = ROLE_STAT[item.value] || null;
      const update: any = { altRoles: roles };
      let gained = 0, from = 0, to = 0;
      if (stat){
        const bonus = ROLE_BONUS[item.rarity] ?? ROLE_BONUS.bronze;
        from = (sm as any)[stat] as number;
        to = Math.min(STAT_CAP, from + bonus);
        gained = to - from;
        update[stat] = to;
      }

      await prisma.$transaction([
        prisma.squadMember.update({ where: { id: sm.id }, data: update }),
        prisma.inventoryItem.delete({ where: { id: item.id } }),
      ]);
      return res.json({ ok: true, applied: { member: name, role: item.value, rarity: item.rarity, stat, gained, from, to } });
    }

    if (item.kind === "stamina"){
      const name = String(req.body?.squadMemberName || "").trim();
      if (!name) return res.status(400).json({ error: "Kies een crewlid om de stamina op toe te passen." });
      const sm = await prisma.squadMember.findFirst({ where: { membershipId: me.id, name } });
      if (!sm) return res.status(404).json({ error: "Dit crewlid zit niet in je crew." });

      const data: any = item.data || {};
      const amount = Number(data.amount) || 25;
      const from = sm.cond;
      if (from >= COND_CAP) return res.status(400).json({ error: name + " is al volledig uitgerust." });
      const to = Math.min(COND_CAP, from + amount);
      const gained = to - from;

      await prisma.$transaction([
        prisma.squadMember.update({ where: { id: sm.id }, data: { cond: to } }),
        prisma.inventoryItem.delete({ where: { id: item.id } }),
      ]);
      return res.json({ ok: true, applied: { member: name, kind: "stamina", amount, gained, from, to } });
    }

    if (item.kind === "crew_card"){
      const cap = rosterCapForTier(me.shipTier);
      const count = await prisma.squadMember.count({ where: { membershipId: me.id } });
      if (count >= cap)
        return res.status(400).json({ error: `Je crew zit vol (${count}/${cap}). Upgrade je schip of maak plek; de kaart blijft in je inventory.` });
      const taken = await prisma.squadMember.findFirst({ where: { membership: { worldId }, name: item.value } });
      if (taken) return res.status(400).json({ error: item.value + " zit al in deze league." });
      const d: any = item.data || {};
      const member = await prisma.$transaction(async (tx) => {
        const created = await tx.squadMember.create({ data: {
          membershipId: me.id, name: item.value, role: d.role || "Crewmate",
          altRoles: Array.isArray(d.altRoles) ? d.altRoles : [],
          p: d.p ?? 5, d: d.d ?? 5, s: d.s ?? 5, cond: 100, boughtPrice: 0, isGeneric: false,
        }});
        await tx.inventoryItem.delete({ where: { id: item.id } });
        return created;
      });
      return res.json({ ok: true, applied: { member } });
    }

    return res.status(400).json({ error: "Onbekend kaarttype." });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

export const inventoryRouter = router;
export default router;