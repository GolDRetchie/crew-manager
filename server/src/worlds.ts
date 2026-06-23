import { Router, Request, Response } from 'express';
import { prisma } from './prisma';
import { requireAdmin } from './auth';

const router = Router();

// ---------------------------------------------------------------------------
// Hulpfuncties
// ---------------------------------------------------------------------------

// Genereert een joincode als "ABC-123".
function genCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '0123456789';
  let a = '';
  for (let i = 0; i < 3; i++) a += letters[Math.floor(Math.random() * letters.length)];
  let b = '';
  for (let i = 0; i < 3; i++) b += digits[Math.floor(Math.random() * digits.length)];
  return a + '-' + b;
}

async function uniekeCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = genCode();
    const bestaat = await prisma.world.findUnique({ where: { joinCode: code } });
    if (!bestaat) return code;
  }
  // extreem onwaarschijnlijk; val terug op iets met een tijdstempel
  return genCode() + '-' + Date.now().toString().slice(-3);
}

// Sorteert leden tot een klassement: punten, dan doelsaldo, dan gescoord, dan naam.
function sorteerStand(leden: any[]): any[] {
  return [...leden].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const dsA = a.goalsFor - a.goalsAgainst;
    const dsB = b.goalsFor - b.goalsAgainst;
    if (dsB !== dsA) return dsB - dsA;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.crewName.localeCompare(b.crewName);
  });
}

// Round-robin kalender (iedereen speelt één keer tegen elkaar).
// Geeft een lijst { day, homeId, awayId } terug.
function maakKalender(ids: string[]): { day: number; homeId: string; awayId: string }[] {
  const spelers = [...ids];
  if (spelers.length < 2) return [];
  if (spelers.length % 2 !== 0) spelers.push('__BYE__'); // oneven? voeg een "vrije" toe
  const n = spelers.length;
  const rondes = n - 1;
  const helft = n / 2;
  const arr = [...spelers];
  const kalender: { day: number; homeId: string; awayId: string }[] = [];

  for (let r = 0; r < rondes; r++) {
    for (let i = 0; i < helft; i++) {
      const thuis = arr[i];
      const uit = arr[n - 1 - i];
      if (thuis !== '__BYE__' && uit !== '__BYE__') {
        // wissel thuis/uit per ronde, eerlijker
        if (r % 2 === 0) kalender.push({ day: r + 1, homeId: thuis, awayId: uit });
        else kalender.push({ day: r + 1, homeId: uit, awayId: thuis });
      }
    }
    // roteer alle posities behalve de eerste
    const vast = arr[0];
    const rest = arr.slice(1);
    const laatste = rest.pop() as string;
    rest.unshift(laatste);
    arr.splice(0, arr.length, vast, ...rest);
  }
  return kalender;
}

async function startBudget(): Promise<number> {
  const s = await prisma.globalSettings.upsert({
    where: { id: 'global' },
    update: {},
    create: { id: 'global' },
  });
  return s.startingFunds;
}

// ---------------------------------------------------------------------------
// SPELER-ENDPOINTS
// ---------------------------------------------------------------------------

// Open werelden waar je nog aan mee kunt doen.
router.get('/', async (_req: Request, res: Response) => {
  const worlds = await prisma.world.findMany({
    where: { status: 'open' },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { memberships: true } } },
  });
  res.json({
    worlds: worlds.map((w) => ({
      id: w.id,
      name: w.name,
      difficulty: w.difficulty,
      maxPlayers: w.maxPlayers,
      players: w._count.memberships,
      status: w.status,
    })),
  });
});

// De werelden waar JIJ in zit, met je positie.
router.get('/mine', async (req: Request, res: Response) => {
  const memberships = await prisma.worldMembership.findMany({
    where: { userId: req.user!.id },
    include: { world: { include: { memberships: true } } },
    orderBy: { joinedAt: 'desc' },
  });

  const result = memberships.map((m) => {
    const stand = sorteerStand(m.world.memberships);
    const rank = stand.findIndex((x) => x.id === m.id) + 1;
    return {
      worldId: m.world.id,
      name: m.world.name,
      status: m.world.status,
      currentDay: m.world.currentDay,
      totalDays: m.world.totalDays,
      crewName: m.crewName,
      rank,
      players: m.world.memberships.length,
    };
  });
  res.json({ worlds: result });
});

// Gedeelde join-logica (gebruikt door /:id/join én /join-by-code).
// Geeft een { status, body } terug die de route zo doorstuurt.
async function doJoin(worldId: string, userId: string, crewNameInput: any) {
  const world = await prisma.world.findUnique({
    where: { id: worldId },
    include: { _count: { select: { memberships: true } } },
  });
  if (!world) return { status: 404, body: { error: 'World not found.' } };
  if (world.status !== 'open') return { status: 400, body: { error: 'This world is no longer open to join.' } };
  if (world._count.memberships >= world.maxPlayers) return { status: 400, body: { error: 'This world is full.' } };

  const al = await prisma.worldMembership.findUnique({
    where: { worldId_userId: { worldId: world.id, userId } },
  });
  if (al) return { status: 409, body: { error: 'You already joined this world.' } };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const crewName = String(crewNameInput ?? '').trim() || ((user?.username ?? 'My') + "'s Crew");

  const membership = await prisma.worldMembership.create({
    data: { worldId: world.id, userId, crewName, funds: await startBudget() },
  });
  return { status: 201, body: { membership: { id: membership.id, worldId: world.id, crewName } } };
}

// Meedoen aan een wereld via id.
router.post('/:id/join', async (req: Request, res: Response) => {
  const r = await doJoin(req.params.id, req.user!.id, req.body?.crewName);
  res.status(r.status).json(r.body);
});

// Meedoen via een joincode (bv. "ABC-123").
router.post('/join-by-code', async (req: Request, res: Response) => {
  const code = String(req.body?.code ?? '').trim().toUpperCase();
  if (!code) { res.status(400).json({ error: 'Enter a join code.' }); return; }
  const world = await prisma.world.findUnique({ where: { joinCode: code } });
  if (!world) { res.status(404).json({ error: 'No world found for that code.' }); return; }
  const r = await doJoin(world.id, req.user!.id, req.body?.crewName);
  res.status(r.status).json({ ...r.body, worldId: world.id });
});

// Een wereld verlaten (alleen zolang die nog niet gestart is).
router.post('/:id/leave', async (req: Request, res: Response) => {
  const world = await prisma.world.findUnique({ where: { id: req.params.id } });
  if (!world) { res.status(404).json({ error: 'World not found.' }); return; }
  if (world.status !== 'open') { res.status(400).json({ error: 'You can only leave a world before it starts.' }); return; }
  await prisma.worldMembership.deleteMany({ where: { worldId: world.id, userId: req.user!.id } });
  res.json({ ok: true });
});

// Detail van één wereld (met stand en of jij meedoet).
router.get('/:id', async (req: Request, res: Response) => {
  const world = await prisma.world.findUnique({
    where: { id: req.params.id },
    include: { memberships: true },
  });
  if (!world) { res.status(404).json({ error: 'World not found.' }); return; }
  const mij = world.memberships.find((m) => m.userId === req.user!.id);
  res.json({
    world: {
      id: world.id,
      name: world.name,
      status: world.status,
      difficulty: world.difficulty,
      currentDay: world.currentDay,
      totalDays: world.totalDays,
      players: world.memberships.length,
      maxPlayers: world.maxPlayers,
      joinCode: world.joinCode,
      isMember: !!mij,
      myMembershipId: mij ? mij.id : null,
    },
  });
});

// Klassement van een wereld.
router.get('/:id/standings', async (req: Request, res: Response) => {
  const leden = await prisma.worldMembership.findMany({
    where: { worldId: req.params.id },
    include: { user: { select: { username: true } } },
  });
  const stand = sorteerStand(leden).map((m, i) => ({
    rank: i + 1,
    membershipId: m.id,
    crewName: m.crewName,
    username: m.user?.username ?? (m.isBot ? "AI" : "Manager"),    played: m.played,
    won: m.won,
    drawn: m.drawn,
    lost: m.lost,
    goalsFor: m.goalsFor,
    goalsAgainst: m.goalsAgainst,
    points: m.points,
    isMe: m.userId === req.user!.id,
  }));
  res.json({ standings: stand });
});

// Wedstrijdkalender (optioneel filteren op ?day=).
router.get('/:id/fixtures', async (req: Request, res: Response) => {
  const day = req.query.day ? Number(req.query.day) : undefined;
  const where: any = { worldId: req.params.id };
  if (day && Number.isFinite(day)) where.day = day;
  const matches = await prisma.match.findMany({
    where,
    orderBy: [{ day: 'asc' }],
    include: {
      home: { select: { crewName: true } },
      away: { select: { crewName: true } },
    },
  });
  res.json({
    fixtures: matches.map((m) => ({
      id: m.id,
      day: m.day,
      home: m.home.crewName,
      away: m.away.crewName,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      played: m.played,
    })),
  });
});

// ---------------------------------------------------------------------------
// ADMIN-ENDPOINTS
// ---------------------------------------------------------------------------

// Alle werelden (voor het admin-dashboard).
router.get('/admin/all', requireAdmin, async (_req: Request, res: Response) => {
  const worlds = await prisma.world.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { memberships: true } } },
  });
  res.json({
    worlds: worlds.map((w) => ({
      id: w.id,
      name: w.name,
      status: w.status,
      difficulty: w.difficulty,
      players: w._count.memberships,
      maxPlayers: w.maxPlayers,
      joinCode: w.joinCode,
      currentDay: w.currentDay,
      totalDays: w.totalDays,
    })),
  });
});

// Nieuwe wereld aanmaken.
router.post('/', requireAdmin, async (req: Request, res: Response) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) { res.status(400).json({ error: 'World name is required.' }); return; }
  const difficulty = ['easy', 'normal', 'hard'].includes(req.body?.difficulty) ? req.body.difficulty : 'normal';
  let maxPlayers = Math.round(Number(req.body?.maxPlayers));
  if (!Number.isFinite(maxPlayers)) maxPlayers = 16;
  maxPlayers = Math.max(2, Math.min(32, maxPlayers));

  const world = await prisma.world.create({
    data: { name, difficulty, maxPlayers, joinCode: await uniekeCode() },
  });
  res.status(201).json({ world });
});

// Een wereld starten: kalender genereren en status op "active" zetten.
router.post('/:id/start', requireAdmin, async (req: Request, res: Response) => {
  const world = await prisma.world.findUnique({
    where: { id: req.params.id },
    include: { memberships: true },
  });
  if (!world) { res.status(404).json({ error: 'World not found.' }); return; }
  if (world.status !== 'open') { res.status(400).json({ error: 'This world has already started.' }); return; }
  if (world.memberships.length < 2) { res.status(400).json({ error: 'Need at least 2 players to start.' }); return; }

  const ids = world.memberships.map((m) => m.id);
  const kalender = maakKalender(ids);
  const totalDays = kalender.length ? Math.max(...kalender.map((k) => k.day)) : 0;

  await prisma.$transaction([
    prisma.match.createMany({
      data: kalender.map((k) => ({ worldId: world.id, day: k.day, homeId: k.homeId, awayId: k.awayId })),
    }),
    prisma.world.update({
      where: { id: world.id },
      data: { status: 'active', currentDay: 1, totalDays },
    }),
  ]);

  res.json({ ok: true, totalDays, matches: kalender.length });
});

// Een wereld verwijderen.
router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    await prisma.world.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'World not found.' });
  }
});

export default router;