import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; isAdmin: boolean };
    }
  }
}

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || '';
if (!JWT_SECRET) console.warn('LET OP: JWT_SECRET ontbreekt in .env — login werkt dan niet.');

const TOKEN_GELDIGHEID = 60 * 60 * 24 * 30; // 30 dagen in seconden

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

function valideerRegistratie(body: any): string | null {
  const username = String(body?.username ?? '').trim();
  const email = String(body?.email ?? '').trim();
  const password = String(body?.password ?? '');

  if (username.length < 3 || username.length > 20) return 'Gebruikersnaam moet tussen 3 en 20 tekens zijn.';
  if (!USERNAME_REGEX.test(username)) return 'Gebruikersnaam mag alleen letters, cijfers en _ bevatten.';
  if (email.length > 254 || !EMAIL_REGEX.test(email)) return 'Voer een geldig e-mailadres in.';
  if (password.length < 8) return 'Wachtwoord moet minstens 8 tekens zijn.';
  if (password.length > 72) return 'Wachtwoord mag maximaal 72 tekens zijn.';
  return null;
}

function maakToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: TOKEN_GELDIGHEID });
}

function publiekeUser(u: { id: string; username: string; email: string; isAdmin: boolean }) {
  return { id: u.id, username: u.username, email: u.email, isAdmin: u.isAdmin };
}

router.post('/register', async (req: Request, res: Response) => {
  const fout = valideerRegistratie(req.body);
  if (fout) { res.status(400).json({ error: fout }); return; }

  const username = String(req.body.username).trim();
  const email = String(req.body.email).trim().toLowerCase();
  const password = String(req.body.password);

  if (await prisma.user.findUnique({ where: { email } })) {
    res.status(409).json({ error: 'Er bestaat al een account met dit e-mailadres.' }); return;
  }
  if (await prisma.user.findUnique({ where: { username } })) {
    res.status(409).json({ error: 'Deze gebruikersnaam is al in gebruik.' }); return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { username, email, passwordHash } });

  res.status(201).json({ token: maakToken(user.id), user: publiekeUser(user) });
});

router.post('/login', async (req: Request, res: Response) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!email || !password) { res.status(400).json({ error: 'Vul je e-mailadres en wachtwoord in.' }); return; }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: 'E-mailadres of wachtwoord onjuist.' }); return;
  }

  res.json({ token: maakToken(user.id), user: publiekeUser(user) });
});

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) { res.status(401).json({ error: 'Niet ingelogd.' }); return; }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) { res.status(401).json({ error: 'Account niet gevonden.' }); return; }
    req.user = { id: user.id, isAdmin: user.isAdmin };
    next();
  } catch {
    res.status(401).json({ error: 'Sessie verlopen of ongeldig. Log opnieuw in.' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) { res.status(403).json({ error: 'Geen toegang — alleen voor beheerders.' }); return; }
  next();
}

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) { res.status(404).json({ error: 'Account niet gevonden.' }); return; }
  res.json({ user: publiekeUser(user) });
});

export default router;