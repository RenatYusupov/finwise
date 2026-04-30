import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { PrismaClient } from '@finwise/db-schema';
import { createHmac, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';

const app = Fastify({ logger: true });
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? randomBytes(32).toString('hex');
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';

// ── Plugins ───────────────────────────────────────────────────────────────────

await app.register(cors, { origin: true });
await app.register(helmet);

// ── TMA Init Data Validation ──────────────────────────────────────────────────

function validateTmaInitData(initData: string): Record<string, string> | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (expectedHash !== hash) return null;

    const result: Record<string, string> = {};
    params.forEach((v, k) => { result[k] = v; });
    return result;
  } catch {
    return null;
  }
}

// ── JWT Helpers ───────────────────────────────────────────────────────────────

function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' });
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /auth/tma — authenticate via Telegram Mini App initData
app.post<{ Body: { initData: string } }>('/auth/tma', async (req, reply) => {
  const { initData } = req.body;

  if (!initData) {
    return reply.status(400).send({ error: 'initData required' });
  }

  // In dev mode, allow bypass
  let telegramUser: { id: number; first_name: string; last_name?: string; username?: string; photo_url?: string; language_code?: string };

  if (process.env.NODE_ENV === 'development' && initData === 'dev') {
    telegramUser = { id: 123456789, first_name: 'Dev', username: 'devuser' };
  } else {
    const validated = validateTmaInitData(initData);
    if (!validated) {
      return reply.status(401).send({ error: 'Invalid initData' });
    }
    telegramUser = JSON.parse(validated['user'] ?? '{}');
  }

  if (!telegramUser?.id) {
    return reply.status(400).send({ error: 'No user in initData' });
  }

  // Upsert user
  const user = await prisma.user.upsert({
    where: { telegramId: BigInt(telegramUser.id) },
    create: {
      telegramId: BigInt(telegramUser.id),
      firstName: telegramUser.first_name,
      lastName: telegramUser.last_name,
      username: telegramUser.username,
      photoUrl: telegramUser.photo_url,
      languageCode: telegramUser.language_code ?? 'ru',
    },
    update: {
      firstName: telegramUser.first_name,
      lastName: telegramUser.last_name,
      username: telegramUser.username,
      photoUrl: telegramUser.photo_url,
    },
  });

  const token = signToken(user.id);

  return reply.send({
    data: {
      token,
      user: {
        id: user.id,
        telegramId: user.telegramId.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        photoUrl: user.photoUrl,
        onboardingCompleted: user.onboardingCompleted,
      },
    },
  });
});

// POST /auth/onboarding — complete onboarding
app.post<{
  Headers: { authorization: string };
  Body: {
    goalType?: string;
    monthlyIncome?: number;
    incomeType?: string;
    bankId?: string;
  };
}>('/auth/onboarding', async (req, reply) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  let payload: { sub: string };
  try {
    payload = jwt.verify(token, JWT_SECRET) as { sub: string };
  } catch {
    return reply.status(401).send({ error: 'Invalid token' });
  }

  const { goalType, monthlyIncome, incomeType } = req.body;

  const user = await prisma.user.update({
    where: { id: payload.sub },
    data: {
      goalType,
      monthlyIncome,
      incomeType,
      onboardingCompleted: true,
    },
  });

  // Create default account
  await prisma.account.upsert({
    where: { id: `default-${user.id}` },
    create: {
      id: `default-${user.id}`,
      userId: user.id,
      name: 'Основной счёт',
      type: 'checking',
      currency: 'RUB',
      isDefault: true,
    },
    update: {},
  });

  // Initialize streak
  await prisma.userStreak.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  });

  return reply.send({ data: { success: true } });
});

// GET /auth/me — get current user
app.get<{ Headers: { authorization: string } }>('/auth/me', async (req, reply) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  let payload: { sub: string };
  try {
    payload = jwt.verify(token, JWT_SECRET) as { sub: string };
  } catch {
    return reply.status(401).send({ error: 'Invalid token' });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) return reply.status(404).send({ error: 'User not found' });

  return reply.send({
    data: {
      id: user.id,
      telegramId: user.telegramId.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      photoUrl: user.photoUrl,
      onboardingCompleted: user.onboardingCompleted,
    },
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.AUTH_SERVICE_PORT ?? '3001');

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Auth service running on port ${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
