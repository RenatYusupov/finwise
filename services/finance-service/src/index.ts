import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fjwt from '@fastify/jwt';
import { PrismaClient } from '@finwise/db-schema';

// ── Startup validation ────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET ?? '';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3004';
if (!JWT_SECRET) {
  console.error('[finance-service] FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

// ── App setup ─────────────────────────────────────────────────────────────────

const app = Fastify({ logger: true });
const prisma = new PrismaClient();

await app.register(cors, { origin: true });
await app.register(helmet);
await app.register(fjwt, { secret: JWT_SECRET });

// ── Auth middleware ───────────────────────────────────────────────────────────

interface JwtPayload {
  sub: string; // telegramId as string
  firstName: string;
  lastName: string | null;
  username: string | null;
}

async function getTelegramId(req: any, reply: any): Promise<bigint | null> {
  const authHeader: string | undefined = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Unauthorized' });
    return null;
  }
  try {
    const payload = await req.jwtVerify() as JwtPayload;
    return BigInt(payload.sub);
  } catch {
    reply.status(401).send({ error: 'Invalid or expired token' });
    return null;
  }
}

// ── Notification helper ───────────────────────────────────────────────────────

async function maybeSendBudgetAlert(telegramId: bigint, category: string): Promise<void> {
  try {
    const budgets = await prisma.finBudget.findMany({ where: { telegramId, category } });
    if (budgets.length === 0) return;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const aggregate = await prisma.finTransaction.aggregate({
      where: {
        telegramId,
        category,
        type: 'expense',
        date: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
    });

    const spent = aggregate._sum.amount ?? 0;
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    for (const budget of budgets) {
      const percentage = budget.limit > 0 ? Math.round((spent / budget.limit) * 100) : 0;
      if (percentage < 80) continue;

      const threshold = percentage >= 100 ? 100 : 80;
      if (threshold === 80 && budget.notified80Month === monthKey) continue;
      if (threshold === 100 && budget.notified100Month === monthKey) continue;

      await fetch(`${NOTIFICATION_SERVICE_URL}/notify/budget-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId: telegramId.toString(),
          categoryName: category,
          spent,
          limit: budget.limit,
          percentage: threshold,
        }),
      }).catch(() => {});

      await prisma.finBudget.update({
        where: { id: budget.id },
        data: threshold === 100
          ? { notified100Month: monthKey }
          : { notified80Month: monthKey },
      }).catch(() => {});
    }
  } catch (err) {
    app.log.warn({ err, telegramId: telegramId.toString(), category }, 'Budget alert check failed');
  }
}

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', async (_req: any, reply: any) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return reply.send({ status: 'ok', service: 'finance-service', db: 'connected' });
  } catch {
    return reply.status(503).send({ status: 'error', service: 'finance-service', db: 'disconnected' });
  }
});

// ── Transactions ──────────────────────────────────────────────────────────────

app.get('/transactions', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const { from, to, category, type, limit = '50', offset = '0' } = req.query as Record<string, string>;

  const where: any = { telegramId };
  if (type) where.type = type;
  if (category) where.category = category;
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = new Date(to + 'T23:59:59.999Z');
  }

  const parsedLimit = Math.min(parseInt(limit, 10) || 50, 1000);
  const parsedOffset = parseInt(offset, 10) || 0;

  const [transactions, total] = await Promise.all([
    prisma.finTransaction.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: parsedLimit,
      skip: parsedOffset,
    }),
    prisma.finTransaction.count({ where }),
  ]);

  return reply.send({ data: transactions, total, limit: parsedLimit, offset: parsedOffset });
});

app.post('/transactions', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const { id, amount, type, category, description, date, userCorrected, requiresUserInput } = req.body ?? {};

  if (!amount || parseFloat(amount) <= 0) return reply.status(400).send({ error: 'amount must be positive' });
  if (!type || !['expense', 'income'].includes(type)) return reply.status(400).send({ error: 'type must be expense or income' });

  const tx = await prisma.finTransaction.create({
    data: {
      ...(id ? { id } : {}),
      telegramId,
      amount: parseFloat(amount),
      type,
      category: category ?? 'other_exp',
      description: description ?? '',
      date: date ? new Date(date) : new Date(),
      userCorrected: userCorrected ?? false,
      requiresUserInput: requiresUserInput ?? false,
    },
  });

  if (tx.type === 'expense') {
    void maybeSendBudgetAlert(telegramId, tx.category);
  }

  return reply.status(201).send({ data: tx });
});

app.put('/transactions/:id', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const existing = await prisma.finTransaction.findFirst({ where: { id: req.params.id, telegramId } });
  if (!existing) return reply.status(404).send({ error: 'Not found' });

  const { amount, type, category, description, date, userCorrected } = req.body ?? {};
  if (amount !== undefined && parseFloat(amount) <= 0) return reply.status(400).send({ error: 'amount must be positive' });

  const updated = await prisma.finTransaction.update({
    where: { id: existing.id },
    data: {
      ...(amount !== undefined ? { amount: parseFloat(amount) } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(date !== undefined ? { date: new Date(date) } : {}),
      ...(userCorrected !== undefined ? { userCorrected } : {}),
    },
  });

  return reply.send({ data: updated });
});

app.delete('/transactions/:id', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const existing = await prisma.finTransaction.findFirst({ where: { id: req.params.id, telegramId } });
  if (!existing) return reply.status(404).send({ error: 'Not found' });

  await prisma.finTransaction.delete({ where: { id: existing.id } });
  return reply.send({ data: { success: true } });
});

// POST /transactions/bulk — upsert up to 500 transactions
app.post('/transactions/bulk', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const { transactions } = req.body ?? {};
  if (!Array.isArray(transactions)) return reply.status(400).send({ error: 'transactions must be an array' });
  if (transactions.length > 500) return reply.status(400).send({ error: 'Maximum 500 transactions per bulk request' });

  let imported = 0;
  let skipped = 0;

  const BATCH = 50;
  for (let i = 0; i < transactions.length; i += BATCH) {
    const batch = transactions.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (tx: any) => {
        if (!tx.amount || parseFloat(tx.amount) <= 0) { skipped++; return; }
        try {
          await prisma.finTransaction.upsert({
            where: { id: tx.id ?? '' },
            create: {
              ...(tx.id ? { id: tx.id } : {}),
              telegramId,
              amount: parseFloat(tx.amount),
              type: tx.type ?? 'expense',
              category: tx.category ?? 'other_exp',
              description: tx.description ?? '',
              date: tx.date ? new Date(tx.date) : new Date(),
              userCorrected: tx.userCorrected ?? false,
              requiresUserInput: tx.requiresUserInput ?? false,
            },
            update: {
              amount: parseFloat(tx.amount),
              type: tx.type ?? 'expense',
              category: tx.category ?? 'other_exp',
              description: tx.description ?? '',
              date: tx.date ? new Date(tx.date) : new Date(),
              userCorrected: tx.userCorrected ?? false,
            },
          });
          imported++;
        } catch {
          skipped++;
        }
      })
    );
  }

  return reply.send({ data: { imported, skipped } });
});

// ── Budgets ───────────────────────────────────────────────────────────────────

app.get('/budgets', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const budgets = await prisma.finBudget.findMany({ where: { telegramId }, orderBy: { createdAt: 'desc' } });
  return reply.send({ data: budgets });
});

app.post('/budgets', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const { id, category, limit, period } = req.body ?? {};
  if (!category || !limit) return reply.status(400).send({ error: 'category and limit are required' });

  const budget = await prisma.finBudget.upsert({
    where: { id: id ?? '' },
    create: { ...(id ? { id } : {}), telegramId, category, limit: parseFloat(limit), period: period ?? 'month' },
    update: { category, limit: parseFloat(limit), period: period ?? 'month' },
  });

  return reply.status(201).send({ data: budget });
});

app.put('/budgets/:id', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const existing = await prisma.finBudget.findFirst({ where: { id: req.params.id, telegramId } });
  if (!existing) return reply.status(404).send({ error: 'Not found' });

  const { category, limit, period } = req.body ?? {};
  const updated = await prisma.finBudget.update({
    where: { id: existing.id },
    data: {
      ...(category !== undefined ? { category } : {}),
      ...(limit !== undefined ? { limit: parseFloat(limit) } : {}),
      ...(period !== undefined ? { period } : {}),
    },
  });

  return reply.send({ data: updated });
});

app.delete('/budgets/:id', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const existing = await prisma.finBudget.findFirst({ where: { id: req.params.id, telegramId } });
  if (!existing) return reply.status(404).send({ error: 'Not found' });

  await prisma.finBudget.delete({ where: { id: existing.id } });
  return reply.send({ data: { success: true } });
});

// ── Goals ─────────────────────────────────────────────────────────────────────

app.get('/goals', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const goals = await prisma.finGoal.findMany({ where: { telegramId }, orderBy: { createdAt: 'desc' } });
  return reply.send({ data: goals });
});

app.post('/goals', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const { id, title, targetAmount, currentAmount, deadline, categoryId } = req.body ?? {};
  if (!title || !targetAmount) return reply.status(400).send({ error: 'title and targetAmount are required' });

  const goal = await prisma.finGoal.upsert({
    where: { id: id ?? '' },
    create: {
      ...(id ? { id } : {}),
      telegramId,
      title,
      targetAmount: parseFloat(targetAmount),
      currentAmount: parseFloat(currentAmount ?? 0),
      deadline: deadline ? new Date(deadline) : null,
      categoryId: categoryId ?? null,
    },
    update: {
      title,
      targetAmount: parseFloat(targetAmount),
      currentAmount: parseFloat(currentAmount ?? 0),
      deadline: deadline ? new Date(deadline) : null,
      categoryId: categoryId ?? null,
    },
  });

  return reply.status(201).send({ data: goal });
});

app.put('/goals/:id', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const existing = await prisma.finGoal.findFirst({ where: { id: req.params.id, telegramId } });
  if (!existing) return reply.status(404).send({ error: 'Not found' });

  const { title, targetAmount, currentAmount, deadline, categoryId } = req.body ?? {};
  const updated = await prisma.finGoal.update({
    where: { id: existing.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(targetAmount !== undefined ? { targetAmount: parseFloat(targetAmount) } : {}),
      ...(currentAmount !== undefined ? { currentAmount: parseFloat(currentAmount) } : {}),
      ...(deadline !== undefined ? { deadline: deadline ? new Date(deadline) : null } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
    },
  });

  return reply.send({ data: updated });
});

app.delete('/goals/:id', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const existing = await prisma.finGoal.findFirst({ where: { id: req.params.id, telegramId } });
  if (!existing) return reply.status(404).send({ error: 'Not found' });

  await prisma.finGoal.delete({ where: { id: existing.id } });
  return reply.send({ data: { success: true } });
});

// ── Recurring Payments ────────────────────────────────────────────────────────

app.get('/recurring-payments', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const payments = await prisma.finRecurringPayment.findMany({ where: { telegramId }, orderBy: { createdAt: 'desc' } });
  return reply.send({ data: payments });
});

app.post('/recurring-payments', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const { id, label, amount, dayOfMonth, category, active, confidence, lastSeen } = req.body ?? {};
  if (!label || !amount) return reply.status(400).send({ error: 'label and amount are required' });

  const payment = await prisma.finRecurringPayment.upsert({
    where: { id: id ?? '' },
    create: {
      ...(id ? { id } : {}),
      telegramId,
      label,
      amount: parseFloat(amount),
      dayOfMonth: parseInt(dayOfMonth ?? 1, 10),
      category: category ?? 'other_exp',
      active: active ?? true,
      confidence: parseFloat(confidence ?? 0.5),
      lastSeen: lastSeen ? new Date(lastSeen) : new Date(),
    },
    update: {
      label,
      amount: parseFloat(amount),
      dayOfMonth: parseInt(dayOfMonth ?? 1, 10),
      category: category ?? 'other_exp',
      active: active ?? true,
      confidence: parseFloat(confidence ?? 0.5),
      lastSeen: lastSeen ? new Date(lastSeen) : new Date(),
    },
  });

  return reply.status(201).send({ data: payment });
});

app.put('/recurring-payments/:id', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const existing = await prisma.finRecurringPayment.findFirst({ where: { id: req.params.id, telegramId } });
  if (!existing) return reply.status(404).send({ error: 'Not found' });

  const { label, amount, dayOfMonth, category, active, confidence } = req.body ?? {};
  const updated = await prisma.finRecurringPayment.update({
    where: { id: existing.id },
    data: {
      ...(label !== undefined ? { label } : {}),
      ...(amount !== undefined ? { amount: parseFloat(amount) } : {}),
      ...(dayOfMonth !== undefined ? { dayOfMonth: parseInt(dayOfMonth, 10) } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(active !== undefined ? { active } : {}),
      ...(confidence !== undefined ? { confidence: parseFloat(confidence) } : {}),
    },
  });

  return reply.send({ data: updated });
});

app.delete('/recurring-payments/:id', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const existing = await prisma.finRecurringPayment.findFirst({ where: { id: req.params.id, telegramId } });
  if (!existing) return reply.status(404).send({ error: 'Not found' });

  await prisma.finRecurringPayment.delete({ where: { id: existing.id } });
  return reply.send({ data: { success: true } });
});

// ── Sync ──────────────────────────────────────────────────────────────────────

// GET /sync — return all user data in one request
// ── Routes: Export (TASK-021) ─────────────────────────────────────────────────

app.get('/export', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const format = (req.query as any)?.format ?? 'json';

  try {
    const [transactions, goals, budgets, recurringPayments] = await Promise.all([
      prisma.finTransaction.findMany({ where: { telegramId }, orderBy: { date: 'desc' } }),
      prisma.finGoal.findMany({ where: { telegramId } }),
      prisma.finBudget.findMany({ where: { telegramId } }),
      prisma.finRecurringPayment.findMany({ where: { telegramId } }),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      telegramId: telegramId.toString(),
      transactions: transactions.map((t) => ({
        id: t.id,
        date: t.date,
        type: t.type,
        amount: Number(t.amount),
        categoryId: t.categoryId,
        description: t.description,
      })),
      goals: goals.map((g) => ({
        id: g.id,
        name: g.name,
        targetAmount: Number(g.targetAmount),
        currentAmount: Number(g.currentAmount),
        deadline: g.deadline,
      })),
      budgets: budgets.map((b) => ({
        id: b.id,
        categoryId: b.categoryId,
        limit: Number(b.limit),
        period: b.period,
      })),
      recurringPayments: recurringPayments.map((p) => ({
        id: p.id,
        label: p.label,
        amount: Number(p.amount),
        frequency: p.frequency,
        nextDate: p.nextDate,
      })),
    };

    if (format === 'csv') {
      const headers = ['date', 'type', 'amount', 'categoryId', 'description'];
      const rows = exportData.transactions.map((t) =>
        [t.date, t.type, t.amount, t.categoryId, `"${(t.description ?? '').replace(/"/g, '""')}"`].join(',')
      );
      const csv = [headers.join(','), ...rows].join('\n');
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="finwise_export_${new Date().toISOString().slice(0, 10)}.csv"`);
      return reply.send('\uFEFF' + csv);
    }

    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="finwise_export_${new Date().toISOString().slice(0, 10)}.json"`);
    return reply.send(exportData);
  } catch (err) {
    app.log.error({ err }, 'Export failed');
    return reply.status(500).send({ error: 'Export failed' });
  }
});

app.get('/sync', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const [transactions, budgets, goals, recurringPayments] = await Promise.all([
    prisma.finTransaction.findMany({ where: { telegramId }, orderBy: [{ date: 'desc' }], take: 1000 }),
    prisma.finBudget.findMany({ where: { telegramId } }),
    prisma.finGoal.findMany({ where: { telegramId } }),
    prisma.finRecurringPayment.findMany({ where: { telegramId } }),
  ]);

  return reply.send({ data: { transactions, budgets, goals, recurringPayments } });
});

// POST /sync — full snapshot upsert (migration from CloudStorage)
app.post('/sync', async (req: any, reply: any) => {
  const telegramId = await getTelegramId(req, reply);
  if (!telegramId) return;

  const { transactions = [], budgets = [], goals = [], recurringPayments = [] } = req.body ?? {};

  let txImported = 0;
  let txSkipped = 0;

  const TX_BATCH = 50;
  for (let i = 0; i < (transactions as any[]).length; i += TX_BATCH) {
    const batch = (transactions as any[]).slice(i, i + TX_BATCH);
    await Promise.all(
      batch.map(async (tx: any) => {
        if (!tx.id || !tx.amount || parseFloat(tx.amount) <= 0) { txSkipped++; return; }
        try {
          await prisma.finTransaction.upsert({
            where: { id: tx.id },
            create: {
              id: tx.id,
              telegramId,
              amount: parseFloat(tx.amount),
              type: tx.type ?? 'expense',
              category: tx.categoryId ?? tx.category ?? 'other_exp',
              description: tx.description ?? '',
              date: tx.date ? new Date(tx.date) : new Date(),
              userCorrected: tx.userCorrected ?? false,
              requiresUserInput: tx.requiresUserInput ?? false,
            },
            update: {
              amount: parseFloat(tx.amount),
              type: tx.type ?? 'expense',
              category: tx.categoryId ?? tx.category ?? 'other_exp',
              description: tx.description ?? '',
              date: tx.date ? new Date(tx.date) : new Date(),
              userCorrected: tx.userCorrected ?? false,
            },
          });
          txImported++;
        } catch {
          txSkipped++;
        }
      })
    );
  }

  for (const b of budgets as any[]) {
    if (!b.id) continue;
    await prisma.finBudget.upsert({
      where: { id: b.id },
      create: { id: b.id, telegramId, category: b.categoryId ?? b.category ?? 'other_exp', limit: parseFloat(b.limit ?? b.amount ?? 0), period: b.period ?? 'month' },
      update: { category: b.categoryId ?? b.category ?? 'other_exp', limit: parseFloat(b.limit ?? b.amount ?? 0), period: b.period ?? 'month' },
    }).catch(() => {});
  }

  for (const g of goals as any[]) {
    if (!g.id) continue;
    await prisma.finGoal.upsert({
      where: { id: g.id },
      create: { id: g.id, telegramId, title: g.title ?? g.name ?? 'Цель', targetAmount: parseFloat(g.targetAmount ?? 0), currentAmount: parseFloat(g.currentAmount ?? g.savedAmount ?? 0), deadline: g.deadline ? new Date(g.deadline) : null, categoryId: g.categoryId ?? null },
      update: { title: g.title ?? g.name ?? 'Цель', targetAmount: parseFloat(g.targetAmount ?? 0), currentAmount: parseFloat(g.currentAmount ?? g.savedAmount ?? 0), deadline: g.deadline ? new Date(g.deadline) : null, categoryId: g.categoryId ?? null },
    }).catch(() => {});
  }

  for (const rp of recurringPayments as any[]) {
    if (!rp.id) continue;
    await prisma.finRecurringPayment.upsert({
      where: { id: rp.id },
      create: { id: rp.id, telegramId, label: rp.label ?? rp.description ?? 'Платёж', amount: parseFloat(rp.amount ?? 0), dayOfMonth: parseInt(rp.dayOfMonth ?? rp.expectedDay ?? 1, 10), category: rp.categoryId ?? rp.category ?? 'other_exp', active: rp.active ?? true, confidence: parseFloat(rp.confidence ?? 0.5), lastSeen: rp.lastSeen ? new Date(rp.lastSeen) : new Date() },
      update: { label: rp.label ?? rp.description ?? 'Платёж', amount: parseFloat(rp.amount ?? 0), dayOfMonth: parseInt(rp.dayOfMonth ?? rp.expectedDay ?? 1, 10), category: rp.categoryId ?? rp.category ?? 'other_exp', active: rp.active ?? true, confidence: parseFloat(rp.confidence ?? 0.5), lastSeen: rp.lastSeen ? new Date(rp.lastSeen) : new Date() },
    }).catch(() => {});
  }

  return reply.send({
    data: {
      transactions: { imported: txImported, skipped: txSkipped },
      budgets: { synced: (budgets as any[]).length },
      goals: { synced: (goals as any[]).length },
      recurringPayments: { synced: (recurringPayments as any[]).length },
    },
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.FINANCE_SERVICE_PORT ?? '3002', 10);

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[finance-service] Running on port ${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
