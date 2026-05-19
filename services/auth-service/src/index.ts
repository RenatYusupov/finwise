import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fjwt from '@fastify/jwt';
import { createHmac } from 'crypto';

// ── Startup validation ────────────────────────────────────────────────────────

const BOT_TOKEN = process.env.BOT_TOKEN ?? '';
const JWT_SECRET = process.env.JWT_SECRET ?? '';

if (!BOT_TOKEN) {
  console.error('[auth-service] FATAL: BOT_TOKEN environment variable is required');
  process.exit(1);
}
if (!JWT_SECRET) {
  console.error('[auth-service] FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

// ── App setup ─────────────────────────────────────────────────────────────────

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(helmet);
await app.register(fjwt, { secret: JWT_SECRET });

// ── Types ─────────────────────────────────────────────────────────────────────

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

interface JwtPayload {
  sub: string; // telegramId as string
  firstName: string;
  lastName: string | null;
  username: string | null;
}

// ── HMAC-SHA256 initData validation ───────────────────────────────────────────

/**
 * Validates Telegram Mini App initData using HMAC-SHA256.
 * Algorithm: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Returns parsed fields on success, null on failure.
 */
function validateTmaInitData(initData: string): Record<string, string> | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');

    // Build data-check-string: sorted key=value pairs joined by \n
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    // secret_key = HMAC_SHA256("WebAppData", bot_token)
    const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    // expected_hash = HMAC_SHA256(secret_key, data_check_string)
    const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (expectedHash !== hash) return null;

    const result: Record<string, string> = {};
    params.forEach((v, k) => { result[k] = v; });
    return result;
  } catch {
    return null;
  }
}

// ── Auth middleware helper ────────────────────────────────────────────────────

/**
 * Extracts and verifies JWT from Authorization header.
 * Returns payload or throws.
 */
async function authenticate(req: any, reply: any): Promise<JwtPayload> {
  const authHeader: string | undefined = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Unauthorized' });
    throw new Error('Unauthorized');
  }
  try {
    const payload = await req.jwtVerify() as JwtPayload;
    return payload;
  } catch {
    reply.status(401).send({ error: 'Invalid or expired token' });
    throw new Error('Invalid token');
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /health
app.get('/health', async (_req, reply) => {
  return reply.send({ status: 'ok', service: 'auth-service' });
});

// POST /auth/telegram — authenticate via Telegram Mini App initData
app.post<{ Body: { initData: string } }>('/auth/telegram', {
  config: { rawBody: true },
}, async (req, reply) => {
  const { initData } = req.body ?? {};

  if (!initData) {
    return reply.status(400).send({ error: 'initData required' });
  }

  if (initData.length > 10_000) {
    return reply.status(413).send({ error: 'initData too large' });
  }

  let telegramUser: TelegramUser;

  // Dev bypass: allow initData === 'dev' in development
  if (process.env.NODE_ENV === 'development' && initData === 'dev') {
    telegramUser = { id: 123456789, first_name: 'Dev', username: 'devuser' };
  } else {
    const validated = validateTmaInitData(initData);
    if (!validated) {
      return reply.status(401).send({ error: 'Invalid initData signature' });
    }

    // Check auth_date freshness (must be within 24 hours)
    const authDate = parseInt(validated['auth_date'] ?? '0', 10);
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - authDate > 86400) {
      return reply.status(400).send({ error: 'initData expired' });
    }

    try {
      telegramUser = JSON.parse(validated['user'] ?? '{}') as TelegramUser;
    } catch {
      return reply.status(400).send({ error: 'Invalid user field in initData' });
    }
  }

  if (!telegramUser?.id) {
    return reply.status(400).send({ error: 'No user in initData' });
  }

  const telegramId = String(telegramUser.id);

  // Sign JWT — sub = telegramId, user info embedded in payload
  const jwtPayload: JwtPayload = {
    sub: telegramId,
    firstName: telegramUser.first_name,
    lastName: telegramUser.last_name ?? null,
    username: telegramUser.username ?? null,
  };
  const token = app.jwt.sign(jwtPayload, { expiresIn: '7d' });

  return reply.send({
    token,
    expiresIn: 604800, // 7 days in seconds
    user: {
      telegramId: telegramUser.id,
      firstName: telegramUser.first_name,
      lastName: telegramUser.last_name,
      username: telegramUser.username,
    },
  });
});

// GET /auth/me — return current user from JWT
app.get('/auth/me', async (req, reply) => {
  let payload: JwtPayload;
  try {
    payload = await authenticate(req, reply);
  } catch {
    return; // reply already sent by authenticate()
  }

  return reply.send({
    telegramId: parseInt(payload.sub, 10),
    firstName: payload.firstName,
    lastName: payload.lastName,
    username: payload.username,
  });
});

// ── Legacy endpoint alias (backward compat with existing ai-service) ──────────

// POST /auth/tma — alias for /auth/telegram
app.post<{ Body: { initData: string } }>('/auth/tma', async (req, reply) => {
  return reply.redirect(307, '/auth/telegram');
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.AUTH_SERVICE_PORT ?? '3001', 10);

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[auth-service] Running on port ${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
