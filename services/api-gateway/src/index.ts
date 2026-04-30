import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import httpProxy from '@fastify/http-proxy';

const app = Fastify({ logger: true });

const AUTH_SERVICE = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001';
const FINANCE_SERVICE = process.env.FINANCE_SERVICE_URL ?? 'http://localhost:3002';
const AI_SERVICE = process.env.AI_SERVICE_URL ?? 'http://localhost:3003';
const NOTIFICATION_SERVICE = process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3004';

// ── Plugins ───────────────────────────────────────────────────────────────────

await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

await app.register(helmet, {
  contentSecurityPolicy: false,
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Proxy routes ──────────────────────────────────────────────────────────────

// Auth service: /api/auth/*
await app.register(httpProxy, {
  upstream: AUTH_SERVICE,
  prefix: '/api/auth',
  rewritePrefix: '/auth',
  http2: false,
});

// Finance service: /api/transactions, /api/accounts, /api/categories, /api/goals, /api/budgets, /api/analytics, /api/gamification
const financeRoutes = [
  '/api/transactions',
  '/api/accounts',
  '/api/categories',
  '/api/goals',
  '/api/budgets',
  '/api/analytics',
  '/api/gamification',
];

for (const route of financeRoutes) {
  const prefix = route.replace('/api', '');
  await app.register(httpProxy, {
    upstream: FINANCE_SERVICE,
    prefix: route,
    rewritePrefix: prefix,
    http2: false,
  });
}

// AI service: /api/ai/*
await app.register(httpProxy, {
  upstream: AI_SERVICE,
  prefix: '/api/ai',
  rewritePrefix: '/ai',
  http2: false,
});

// Notification service: /api/notifications/*
await app.register(httpProxy, {
  upstream: NOTIFICATION_SERVICE,
  prefix: '/api/notifications',
  rewritePrefix: '/notifications',
  http2: false,
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.API_GATEWAY_PORT ?? '3000');

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`API Gateway running on port ${PORT}`);
  console.log(`  → Auth:         ${AUTH_SERVICE}`);
  console.log(`  → Finance:      ${FINANCE_SERVICE}`);
  console.log(`  → AI:           ${AI_SERVICE}`);
  console.log(`  → Notification: ${NOTIFICATION_SERVICE}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
