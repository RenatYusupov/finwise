import Fastify from 'fastify';
import { Telegraf } from 'telegraf';
import { Queue, Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { z } from 'zod';

const app = Fastify({ logger: true });
const prisma = new PrismaClient();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const PORT = parseInt(process.env.NOTIFICATION_SERVICE_PORT || '3004');

// Redis connection for BullMQ
const redisConnection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

// Telegraf bot instance (used only for sending messages, not for handling updates)
const bot = BOT_TOKEN ? new Telegraf(BOT_TOKEN) : null;

// ─── Notification Queues ──────────────────────────────────────────────────────

const notificationQueue = new Queue('notifications', { connection: redisConnection });
const weeklyReportQueue = new Queue('weekly-reports', { connection: redisConnection });

// ─── Notification Types ───────────────────────────────────────────────────────

interface BudgetAlertPayload {
  type: 'budget_alert';
  telegramId: string;
  categoryName: string;
  spent: number;
  limit: number;
  percentage: number;
}

interface GoalAchievedPayload {
  type: 'goal_achieved';
  telegramId: string;
  goalName: string;
  targetAmount: number;
}

interface WeeklyReportPayload {
  type: 'weekly_report';
  telegramId: string;
  userId: string;
}

interface StreakPayload {
  type: 'streak_milestone';
  telegramId: string;
  streakDays: number;
}

type NotificationPayload =
  | BudgetAlertPayload
  | GoalAchievedPayload
  | WeeklyReportPayload
  | StreakPayload;

// ─── Message Formatters ───────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(amount);
}

function buildBudgetAlertMessage(payload: BudgetAlertPayload): string {
  const emoji = payload.percentage >= 100 ? '🚨' : payload.percentage >= 80 ? '⚠️' : '📊';
  const status = payload.percentage >= 100 ? 'превышен' : `использован на ${payload.percentage}%`;

  return (
    `${emoji} *Бюджет ${status}*\n\n` +
    `Категория: *${payload.categoryName}*\n` +
    `Потрачено: ${formatCurrency(payload.spent)}\n` +
    `Лимит: ${formatCurrency(payload.limit)}\n\n` +
    (payload.percentage >= 100
      ? '❗ Вы превысили бюджет. Постарайтесь сократить расходы до конца месяца.'
      : '💡 Следите за расходами, чтобы не выйти за рамки бюджета.')
  );
}

function buildGoalAchievedMessage(payload: GoalAchievedPayload): string {
  return (
    `🎉 *Цель достигнута!*\n\n` +
    `Поздравляем! Вы накопили ${formatCurrency(payload.targetAmount)} на цель:\n` +
    `*"${payload.goalName}"*\n\n` +
    `🏆 Отличная работа! Продолжайте в том же духе и ставьте новые финансовые цели.`
  );
}

function buildStreakMessage(payload: StreakPayload): string {
  const milestoneEmoji =
    payload.streakDays >= 30
      ? '🔥🔥🔥'
      : payload.streakDays >= 14
        ? '🔥🔥'
        : '🔥';

  return (
    `${milestoneEmoji} *Серия ${payload.streakDays} дней!*\n\n` +
    `Вы ведёте учёт финансов уже ${payload.streakDays} дней подряд!\n\n` +
    `Продолжайте — финансовая дисциплина приводит к реальным результатам. 💪`
  );
}

async function buildWeeklyReportMessage(userId: string): Promise<string> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Fetch transactions for the past week
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: weekAgo, lte: now },
    },
    include: { category: true },
  });

  const income = transactions
    .filter((t) => t.type === 'INCOME')
    .reduce((sum, t) => sum + t.amount.toNumber(), 0);

  const expenses = transactions
    .filter((t) => t.type === 'EXPENSE')
    .reduce((sum, t) => sum + t.amount.toNumber(), 0);

  // Top expense categories
  const categoryMap = new Map<string, number>();
  transactions
    .filter((t) => t.type === 'EXPENSE')
    .forEach((t) => {
      const name = t.category?.name || 'Прочее';
      categoryMap.set(name, (categoryMap.get(name) || 0) + t.amount.toNumber());
    });

  const topCategories = Array.from(categoryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const balance = income - expenses;
  const balanceEmoji = balance >= 0 ? '📈' : '📉';

  let message =
    `📊 *Еженедельный отчёт FinWise*\n` +
    `_${formatDate(weekAgo)} — ${formatDate(now)}_\n\n` +
    `💰 Доходы: *${formatCurrency(income)}*\n` +
    `💸 Расходы: *${formatCurrency(expenses)}*\n` +
    `${balanceEmoji} Баланс: *${formatCurrency(balance)}*\n\n`;

  if (topCategories.length > 0) {
    message += `🏷 *Топ расходов:*\n`;
    topCategories.forEach(([name, amount], i) => {
      message += `${i + 1}. ${name}: ${formatCurrency(amount)}\n`;
    });
    message += '\n';
  }

  if (transactions.length === 0) {
    message += '💡 На этой неделе транзакций не было. Не забывайте вести учёт!';
  } else if (balance < 0) {
    message += '⚠️ На этой неделе расходы превысили доходы. Проверьте бюджет!';
  } else {
    message += '✅ Отличная неделя! Продолжайте следить за финансами.';
  }

  return message;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// ─── Notification Worker ──────────────────────────────────────────────────────

const notificationWorker = new Worker<NotificationPayload>(
  'notifications',
  async (job: Job<NotificationPayload>) => {
    const payload = job.data;

    if (!bot) {
      app.log.warn('Bot token not configured, skipping notification');
      return;
    }

    let message: string;

    switch (payload.type) {
      case 'budget_alert':
        message = buildBudgetAlertMessage(payload);
        break;
      case 'goal_achieved':
        message = buildGoalAchievedMessage(payload);
        break;
      case 'streak_milestone':
        message = buildStreakMessage(payload);
        break;
      case 'weekly_report':
        message = await buildWeeklyReportMessage(payload.userId);
        break;
      default:
        app.log.warn('Unknown notification type');
        return;
    }

    try {
      await bot.telegram.sendMessage(payload.telegramId, message, {
        parse_mode: 'Markdown',
      });
      app.log.info(`Notification sent to ${payload.telegramId}: ${payload.type}`);
    } catch (err: any) {
      app.log.error(`Failed to send notification to ${payload.telegramId}: ${err.message}`);
      throw err; // BullMQ will retry
    }
  },
  { connection: redisConnection, concurrency: 5 }
);

// Weekly report worker
const weeklyReportWorker = new Worker(
  'weekly-reports',
  async (job: Job) => {
    app.log.info('Processing weekly reports batch...');

    // Get all users who have notifications enabled
    const users = await prisma.user.findMany({
      where: { onboardingCompleted: true },
      select: { id: true, telegramId: true },
    });

    app.log.info(`Sending weekly reports to ${users.length} users`);

    for (const user of users) {
      await notificationQueue.add(
        'weekly_report',
        {
          type: 'weekly_report',
          telegramId: user.telegramId,
          userId: user.id,
        } as WeeklyReportPayload,
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
      );
    }
  },
  { connection: redisConnection }
);

notificationWorker.on('completed', (job) => {
  app.log.info(`Notification job ${job.id} completed`);
});

notificationWorker.on('failed', (job, err) => {
  app.log.error(`Notification job ${job?.id} failed: ${err.message}`);
});

// ─── API Routes ───────────────────────────────────────────────────────────────

// Send a notification immediately
const sendNotificationSchema = z.object({
  type: z.enum(['budget_alert', 'goal_achieved', 'streak_milestone', 'weekly_report']),
  telegramId: z.string(),
  userId: z.string().optional(),
  categoryName: z.string().optional(),
  spent: z.number().optional(),
  limit: z.number().optional(),
  percentage: z.number().optional(),
  goalName: z.string().optional(),
  targetAmount: z.number().optional(),
  streakDays: z.number().optional(),
});

app.post('/notifications/send', async (request, reply) => {
  const body = sendNotificationSchema.parse(request.body);

  await notificationQueue.add('notification', body as NotificationPayload, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });

  return reply.status(202).send({ queued: true });
});

// Schedule weekly reports (called by a cron job or scheduler)
app.post('/notifications/weekly-reports/trigger', async (_request, reply) => {
  await weeklyReportQueue.add('trigger', {}, {
    attempts: 1,
  });

  return reply.status(202).send({ triggered: true });
});

// Health check
app.get('/health', async () => {
  const redisStatus = await redisConnection.ping().then(() => 'ok').catch(() => 'error');
  return {
    status: 'ok',
    redis: redisStatus,
    bot: bot ? 'configured' : 'not configured',
    workers: {
      notifications: notificationWorker.isRunning() ? 'running' : 'stopped',
      weeklyReports: weeklyReportWorker.isRunning() ? 'running' : 'stopped',
    },
  };
});

// Queue stats
app.get('/notifications/stats', async () => {
  const [waiting, active, completed, failed] = await Promise.all([
    notificationQueue.getWaitingCount(),
    notificationQueue.getActiveCount(),
    notificationQueue.getCompletedCount(),
    notificationQueue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

async function shutdown() {
  app.log.info('Shutting down notification service...');
  await notificationWorker.close();
  await weeklyReportWorker.close();
  await notificationQueue.close();
  await weeklyReportQueue.close();
  await redisConnection.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ─── Start Server ─────────────────────────────────────────────────────────────

async function start() {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`Notification service running on port ${PORT}`);

    if (!bot) {
      app.log.warn('TELEGRAM_BOT_TOKEN not set — notifications will be logged only');
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
