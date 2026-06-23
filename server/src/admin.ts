import { Router, Request, Response } from 'express';
import { prisma } from './prisma';

const router = Router();

function toInt(v: any): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function toStrArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x: any) => String(x).trim()).filter(Boolean);
}

function parseCharacter(body: any) {
  return {
    name: String(body?.name ?? '').trim(),
    role: String(body?.role ?? '').trim(),
    altRoles: toStrArray(body?.altRoles),
    power: toInt(body?.power),
    defense: toInt(body?.defense),
    speed: toInt(body?.speed),
    crew: String(body?.crew ?? '').trim(),
    imageUrl: body?.imageUrl ? String(body.imageUrl).trim() : null,
    attacks: toStrArray(body?.attacks),
    isCaptain: body?.isCaptain === true,
    isNavy: body?.isNavy === true,
  };
}

const publicUser = { id: true, username: true, email: true, isAdmin: true, createdAt: true };

router.get('/stats', async (_req: Request, res: Response) => {
  const [users, characters, worlds, managers, recentUsers] = await Promise.all([
    prisma.user.count(),
    prisma.character.count(),
    prisma.world.count(),
    prisma.worldMembership.count(),
    prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: publicUser }),
  ]);
  res.json({ stats: { users, characters, worlds, managers }, recentUsers });
});

// ---------------------------------------------------------------------------
// Globale instellingen (alleen admin)
// ---------------------------------------------------------------------------

router.get('/settings', async (_req: Request, res: Response) => {
  const s = await prisma.globalSettings.upsert({
    where: { id: 'global' },
    update: {},
    create: { id: 'global' },
  });
  res.json({
    settings: {
      startingFunds: s.startingFunds,
      registrationOpen: s.registrationOpen,
      maintenanceMode: s.maintenanceMode,
      broadcast: s.broadcast,
    },
  });
});

router.put('/settings', async (req: Request, res: Response) => {
  let startingFunds = Math.round(Number(req.body?.startingFunds));
  if (!Number.isFinite(startingFunds)) startingFunds = 0;
  startingFunds = Math.max(0, Math.min(2000000000, startingFunds));

  const s = await prisma.globalSettings.upsert({
    where: { id: 'global' },
    create: {
      id: 'global',
      startingFunds,
      registrationOpen: req.body?.registrationOpen !== false,
      maintenanceMode: req.body?.maintenanceMode === true,
      broadcast: String(req.body?.broadcast ?? '').slice(0, 2000),
    },
    update: {
      startingFunds,
      registrationOpen: req.body?.registrationOpen !== false,
      maintenanceMode: req.body?.maintenanceMode === true,
      broadcast: String(req.body?.broadcast ?? '').slice(0, 2000),
    },
  });
  res.json({
    settings: {
      startingFunds: s.startingFunds,
      registrationOpen: s.registrationOpen,
      maintenanceMode: s.maintenanceMode,
      broadcast: s.broadcast,
    },
  });
});

// ---------------------------------------------------------------------------
// Gebruikersbeheer
// ---------------------------------------------------------------------------

router.get('/users', async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' }, select: publicUser });
  res.json({ users });
});

router.patch('/users/:id', async (req: Request, res: Response) => {
  const isAdmin = req.body?.isAdmin === true;
  try {
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { isAdmin }, select: publicUser });
    res.json({ user });
  } catch (e) {
    res.status(404).json({ error: 'User not found.' });
  }
});

router.delete('/users/:id', async (req: Request, res: Response) => {
  if (req.params.id === req.user!.id) { res.status(400).json({ error: "You can't delete your own account here." }); return; }
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: 'User not found.' });
  }
});

// ---------------------------------------------------------------------------
// Character-beheer
// ---------------------------------------------------------------------------

router.get('/characters', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  const where: any = q
    ? { OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { crew: { contains: q, mode: 'insensitive' } },
        { role: { contains: q, mode: 'insensitive' } },
      ] }
    : {};
  const characters = await prisma.character.findMany({ where, orderBy: { name: 'asc' } });
  res.json({ characters });
});

router.post('/characters', async (req: Request, res: Response) => {
  const data = parseCharacter(req.body);
  if (!data.name) { res.status(400).json({ error: 'Name is required.' }); return; }
  if (!data.role) { res.status(400).json({ error: 'Role is required.' }); return; }
  const exists = await prisma.character.findUnique({ where: { name: data.name } });
  if (exists) { res.status(409).json({ error: 'A character with this name already exists.' }); return; }
  const character = await prisma.character.create({ data });
  res.status(201).json({ character });
});

router.put('/characters/:id', async (req: Request, res: Response) => {
  const data = parseCharacter(req.body);
  if (!data.name) { res.status(400).json({ error: 'Name is required.' }); return; }
  if (!data.role) { res.status(400).json({ error: 'Role is required.' }); return; }
  const other = await prisma.character.findUnique({ where: { name: data.name } });
  if (other && other.id !== req.params.id) { res.status(409).json({ error: 'A character with this name already exists.' }); return; }
  try {
    const character = await prisma.character.update({ where: { id: req.params.id }, data });
    res.json({ character });
  } catch (e) {
    res.status(404).json({ error: 'Character not found.' });
  }
});

router.delete('/characters/:id', async (req: Request, res: Response) => {
  try {
    await prisma.character.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: 'Character not found.' });
  }
});

export default router;