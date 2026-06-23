import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes, { requireAuth, requireAdmin } from './auth';
import adminRoutes from './admin';
import worldRoutes from './worlds';
import settingsRoutes from './settings';
import onlineRouter from "./online";
import { marketRouter } from "./market";
import engineRouter from './engine';
import { startScheduler } from './scheduler';
import trainingRouter from './training';
import lineupRouter from './lineup';
import achievementsRouter from "./achievements";
import { missionsRouter } from "./missions";
import { inventoryRouter } from "./inventory";
import { shipRouter } from "./ship";


const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'Crew Manager backend draait!' });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', requireAuth, requireAdmin, adminRoutes);
app.use('/api/worlds', requireAuth, worldRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/online', requireAuth, onlineRouter);
app.use('/api/online', requireAuth, marketRouter);
app.use('/api/online', requireAuth, engineRouter);
app.use('/api/online', requireAuth, trainingRouter);
app.use('/api/online', requireAuth, lineupRouter);
app.use("/api/achievements", requireAuth, achievementsRouter);   // <-- requireAuth toegevoegd (was de bug)
app.use("/api/missions", requireAuth, missionsRouter);            // NIEUW
app.use("/api/inventory", requireAuth, inventoryRouter);          // NIEUW
app.use("/api/online", requireAuth, shipRouter);                  // NIEUW (schip-tiers + cosmetics)


const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`Server luistert op http://localhost:${PORT}`);
  startScheduler();
});