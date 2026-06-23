import { Router, Request, Response } from 'express';
import { prisma } from './prisma';

const router = Router();

// Publieke (ingelogde) lees-toegang tot de globale instellingen.
// Handig om bv. een broadcast-bericht of de onderhoudsmodus in de app te tonen.
router.get('/', async (_req: Request, res: Response) => {
  const s = await prisma.globalSettings.upsert({
    where: { id: 'global' },
    update: {},
    create: { id: 'global' },
  });
  res.json({
    settings: {
      registrationOpen: s.registrationOpen,
      maintenanceMode: s.maintenanceMode,
      broadcast: s.broadcast,
      startingFunds: s.startingFunds,
    },
  });
});

export default router;