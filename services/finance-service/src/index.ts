import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { PrismaClient } from '@finwise/db-schema';
import jwt from 'jsonwebtoken';

const app = Fastify({ logger: true });
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

await app.register(cors, { origin: true });
await app.register(helmet);

// ── Auth middleware helper ─────────────────────────────────────────────────────

function getUserId(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { sub: string };
    return payload.sub;
  } catch {
    return null;
  }
}

// ── Seed default categories ───────────────────────────────────────────────────

const DEFAULT_CATEGORIES = [
  { key: 'food', name: 'Еда и рестораны', icon: '🍕', color: '#FF6B6B', type: 'expense' },
  { key: 'transport', name: 'Транспорт', icon: '🚗', color: '#4ECDC4', type: 'expense' },
  { key: 'shopping', name: 'Покупки', icon: '🛍️', color: '#45B7D1', type: 'expense' },
  { key: 'entertainment', name: 'Развлечения', icon: '🎬', color: '#96CEB4', type: 'expense' },
  { key: 'health', name: 'Здоровье', icon: '💊', color: '#FFEAA7', type: 'expense' },
  { key: 'housing', name: 'Жильё', icon: '🏠', color: '#DDA0DD', type: 'expense' },
  { key: 'utilities', name: 'Коммунальные', icon: '💡', color: '#98D8C8', type: 'expense' },
  { key: 'education', name: 'Образование', icon: '📚', color: '#F7DC6F', type: 'expense' },
  { key: 'travel', name: 'Путешествия', icon: '✈️', color: '#85C1E9', type: 'expense' },
  { key: 'other_expense', name: 'Другое', icon: '📦', color: '#BDC3C7', type: 'expense' },
  { key: 'salary', name: 'Зарплата', icon: '💼', color: '#2ECC71', type: 'income' },
  { key: 'freelance', name: 'Фриланс', icon: '💻', color: '#27AE60', type: 'income' },
  { key: 'investment', name: 'Инвестиции', icon: '📈', color: '#1ABC9C', type: 'income' },
  { key: 'gift', name: 'Подарки', icon: '🎁', color: '#F39C12', type: 'income' },
  { key: 'other_income', name: 'Другой доход', icon: '💰', color: '#16A085', type: 'income' },
];

// Seed categories on startup
async function seedCategories() {
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { id: cat.key },
      create: { id: cat.key, ...cat, isSystem: true },
      update: {},
    });
  }
}

// ── Transactions ──────────────────────────────────────────────────────────────

app.get('/transactions', async (req: any, reply: any) => {
  const userId = getUserId(req.headers.authorization);
  if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

  const { type, limit = '50', offset = '0', dateFrom, dateTo } = req.query as Record<string, string>;

  const where: any = { userId };
  if (type) where.type = type;
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = dateFrom;
    if (dateTo) where.date.lte = dateTo;
  }

  const transactions = await prisma.transaction.findMany({
    where,
    include: { category: true, account: true },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: parseInt(limit),
    skip: parseInt(offset),
  });

  return reply.send({ data: transactions });
});

app.post('/transactions', async (req: any, reply: any) => {
  const userId = getUserId(req.headers.authorization);
  if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

  const { accountId, categoryId, type, amount, description, date } = req.body;

  // Get default account if not specified
  const account = accountId
    ? await prisma.account.findFirst({ where: { id: accountId, userId } })
    : await prisma.account.findFirst({ where: { userId, isDefault: true } });

  if (!account) return reply.status(400).send({ error: 'Account not found' });

  const tx = await prisma.transaction.create({
    data: {
      userId,
      accountId: account.id,
      categoryId: categoryId || null,
      type,
      amount: parseFloat(amount),
      description,
      date: date ?? new Date().toISOString().split('T')[0],
    },
    include: { category: true, account: true },
  });

  // Update account balance
  const balanceDelta = type === 'income' ? tx.amount : type === 'expense' ? -tx.amount : 0;
  await prisma.account.update({
    where: { id: account.id },
    data: { balance: { increment: balanceDelta } },
  });

  // Update budget spent
  if (categoryId && type === 'expense') {
    const today = new Date().toISOString().split('T')[0] ?? '';
    const budget = await prisma.budget.findFirst({
      where: {
        userId,
        categoryId,
        startDate: { lte: today },
        endDate: { gte: today },
      },
    });
    if (budget) {
      await prisma.budget.update({
        where: { id: budget.id },
        data: { spent: { increment: tx.amount } },
      });
    }
  }

  // Update streak
  await updateStreak(userId);

  return reply.status(201).send({ data: tx });
});

app.delete('/transactions/:id', async (req: any, reply: any) => {
  const userId = getUserId(req.headers.authorization);
  if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

  const tx = await prisma.transaction.findFirst({
    where: { id: req.params.id, userId },
  });
  if (!tx) return reply.status(404).send({ error: 'Not found' });

  await prisma.transaction.delete({ where: { id: tx.id } });

  // Reverse balance
  const balanceDelta = tx.type === 'income' ? -tx.amount : tx.type === 'expense' ? tx.amount : 0;
  await prisma.account.update({
    where: { id: tx.accountId },
    data: { balance: { increment: balanceDelta } },
  });

  return reply.send({ data: { success: true } });
});

// ── Categories ────────────────────────────────────────────────────────────────

app.get('/categories', async (req: any, reply: any) => {
  const userId = getUserId(req.headers.authorization);
  if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

  const { type } = req.query as { type?: string };
  const where: any = { OR: [{ isSystem: true }, { userId }] };
  if (type && type !== 'transfer') where.type = { in: [type, 'both'] };

  const categories = await prisma.category.findMany({ where, orderBy: { name: 'asc' } });
  return reply.send({ data: categories });
});

// ── Accounts ──────────────────────────────────────────────────────────────────

app.get('/accounts', async (req: any, reply: any) => {
  const userId = getUserId(req.headers.authorization);
  if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

  const accounts = await prisma.account.findMany({ where: { userId } });
  return reply.send({ data: accounts });
});

// ── Goals ─────────────────────────────────────────────────────────────────────

app.get('/goals', async (req: any, reply: any) => {
  const userId = getUserId(req.headers.authorization);
  if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

  const { status, limit } = req.query as { status?: string; limit?: string };
  const where: any = { userId };
  if (status) where.status = status;

  const goals = await prisma.goal.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit ? parseInt(limit) : undefined,
  });
  return reply.send({ data: goals });
});

app.get('/goals/:id', async (req: any, reply: any) => {
  const userId = getUserId(req.headers.authorization);
  if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

  const goal = await prisma.goal.findFirst({ where: { id: req.params.id, userId } });
  if (!goal) return reply.status(404).send({ error: 'Not found' });
  return reply.send({ data: goal });
});

app.post('/goals', async (req: any, reply: any) => {
  const userId = getUserId(req.headers.authorization);
  if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

  const { name, icon, targetAmount, deadline } = req.body;
  const goal = await prisma.goal.create({
    data: { userId, name, icon, targetAmount: parseFloat(targetAmount), deadline: deadline ? new Date(deadline) : null },
  });
  return reply.status(201).send({ data: goal });
});

app.post('/goals/:id/deposit', async (req: any, reply: any) => {
  const userId = getUserId(req.headers.authorization);
  if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

  const { amount } = req.body;
  const goal = await prisma.goal.findFirst({ where: { id: req.params.id, userId } });
  if (!goal) return reply.status(404).send({ error: 'Not found' });

  const updated = await prisma.goal.update({
    where: { id: goal.id },
    data: {
      currentAmount: { increment: parseFloat(amount) },
      status: goal.currentAmount + parseFloat(amount) >= goal.targetAmount ? 'completed' : 'active',
    },
  });
  return reply.send({ data: updated });
});

// ── Budgets ───────────────────────────────────────────────────────────────────

app.get('/budgets', async (req: any, reply: any) => {
  const userId = getUserId(req.headers.authorization);
  if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

  const today = new Date().toISOString().split('T')[0] ?? '';
  const budgets = await prisma.budget.findMany({
    where: { userId, startDate: { lte: today }, endDate: { gte: today } },
    include: { category: true },
  });
  return reply.send({ data: budgets });
});

// ── Analytics ─────────────────────────────────────────────────────────────────

app.get('/analytics/summary', async (req: any, reply: any) => {
  const userId = getUserId(req.headers.authorization);
  if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

  const { period = 'month' } = req.query as { period?: string };
  const now = new Date();
  let dateFrom: string;

  if (period === 'month') {
    dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  } else if (period === '3months') {
    const d = new Date(now); d.setMonth(d.getMonth() - 3);
    dateFrom = d.toISOString().split('T')[0] ?? '';
  } else {
    dateFrom = `${now.getFullYear()}-01-01`;
  }

  const dateTo = now.toISOString().split('T')[0] ?? '';

  const transactions = await prisma.transaction.findMany({
    where: { userId, date: { gte: dateFrom, lte: dateTo } },
    include: { category: true },
  });

  const totalIncome = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const netSavings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

  // Category breakdown
  const categoryMap = new Map<string, { categoryId: string; categoryName: string; icon: string; color: string; amount: number }>();
  for (const tx of transactions.filter((t) => t.type === 'expense')) {
    const key = tx.categoryId ?? 'other';
    const existing = categoryMap.get(key);
    if (existing) {
      existing.amount += tx.amount;
    } else {
      categoryMap.set(key, {
        categoryId: key,
        categoryName: tx.category?.name ?? 'Другое',
        icon: tx.category?.icon ?? '📦',
        color: tx.category?.color ?? '#BDC3C7',
        amount: tx.amount,
      });
    }
  }

  const categoryBreakdown = Array.from(categoryMap.values())
    .sort((a, b) => b.amount - a.amount)
    .map((c) => ({ ...c, percentage: totalExpenses > 0 ? (c.amount / totalExpenses) * 100 : 0 }));

  return reply.send({
    data: {
      totalIncome,
      totalExpenses,
      netSavings,
      savingsRate,
      categoryBreakdown,
      period,
      dateFrom,
      dateTo,
    },
  });
});

// ── Gamification ──────────────────────────────────────────────────────────────

app.get('/gamification/streak', async (req: any, reply: any) => {
  const userId = getUserId(req.headers.authorization);
  if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

  const streak = await prisma.userStreak.findUnique({ where: { userId } });
  return reply.send({ data: streak ?? { currentStreak: 0, longestStreak: 0, level: 1, xp: 0 } });
});

app.get('/gamification/achievements', async (req: any, reply: any) => {
  const userId = getUserId(req.headers.authorization);
  if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

  const all = await prisma.achievement.findMany();
  const userAchs = await prisma.userAchievement.findMany({ where: { userId } });
  const unlockedMap = new Map(userAchs.map((ua) => [ua.achievementId, ua.unlockedAt]));

  const result = all.map((ach) => ({
    ...ach,
    unlockedAt: unlockedMap.get(ach.id) ?? null,
  }));

  return reply.send({ data: result });
});

// ── Streak helper ─────────────────────────────────────────────────────────────

async function updateStreak(userId: string) {
  const today = new Date().toISOString().split('T')[0] ?? '';
  const streak = await prisma.userStreak.findUnique({ where: { userId } });

  if (!streak) return;

  const lastActivity = streak.lastActivityAt?.toISOString().split('T')[0];
  if (lastActivity === today) return; // Already updated today

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0] ?? '';

  const newStreak = lastActivity === yesterdayStr ? streak.currentStreak + 1 : 1;
  const newLongest = Math.max(newStreak, streak.longestStreak);
  const newXp = streak.xp + 10;
  const newLevel = Math.floor(newXp / 100) + 1;

  await prisma.userStreak.update({
    where: { userId },
    data: {
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastActivityAt: new Date(),
      xp: newXp,
      level: newLevel,
    },
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.FINANCE_SERVICE_PORT ?? '3002');

try {
  await seedCategories();
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Finance service running on port ${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
