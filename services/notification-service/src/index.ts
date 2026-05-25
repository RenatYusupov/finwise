import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cron from 'node-cron';

const app = Fastify({ logger: true });

const BOT_TOKEN = process.env.BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN ?? '';
const FINANCE_SERVICE_URL = process.env.FINANCE_SERVICE_URL ?? 'http://localhost:3002';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:3003';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? 'finwise-internal';
const PORT = parseInt(process.env.NOTIFICATION_SERVICE_PORT ?? '3004', 10);

if (!BOT_TOKEN) {
  console.error('[notification-service] FATAL: BOT_TOKEN environment variable is required');
  process.exit(1);
}

await app.register(cors, { origin: true });
await app.register(helmet);

// ── Types ─────────────────────────────────────────────────────────────────────

interface BudgetAlertPayload {
  telegramId: string;
  categoryName: string;
  spent: number;
  limit: number;
  percentage: number;
}

interface RecurringReminderPayload {
  telegramId: string;
  label: string;
  amount: number;
}

interface WeeklyReportPayload {
  telegramId: string;
  text: string;
}

type NotificationType = 'budget_alert' | 'recurring_reminder' | 'weekly_report' | 'test';

// ── Notification settings helper (TASK-020) ──────────────────────────────────

interface UserNotifSettings {
  budgetAlerts: boolean;
  recurringReminders: boolean;
  weeklyReport: boolean;
  aiInsights: boolean;
}

/** Fetch user notification settings from finance-service.
 *  Returns all-enabled defaults if the request fails (fail-open). */
async function getUserNotifSettings(telegramId: string): Promise<UserNotifSettings> {
  const defaults: UserNotifSettings = {
    budgetAlerts: true,
    recurringReminders: true,
    weeklyReport: true,
    aiInsights: true,
  };
  try {
    const res = await fetch(`${FINANCE_SERVICE_URL}/internal/notification-settings/${telegramId}`, {
      headers: { 'x-internal-secret': INTERNAL_SECRET },
    });
    if (!res.ok) return defaults;
    const { data } = await res.json() as { data: UserNotifSettings };
    return { ...defaults, ...data };
  } catch {
    return defaults;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(amount);
}

function buildBudgetAlertMessage(payload: BudgetAlertPayload): string {
  const threshold = payload.percentage >= 100 ? '100%' : '80%';
  const emoji = payload.percentage >= 100 ? '🚨' : '⚠️';
  return `${emoji} Вы потратили ${threshold} бюджета на ${payload.categoryName}: ${formatCurrency(payload.spent)} из ${formatCurrency(payload.limit)}`;
}

function buildRecurringReminderMessage(payload: RecurringReminderPayload): string {
  return `📅 Через 3 дня ожидается платёж: ${payload.label} ~${formatCurrency(payload.amount)}`;
}

function buildWeeklyReportMessage(payload: WeeklyReportPayload): string {
  return `📊 Еженедельный отчёт FinWise\n\n${payload.text}`;
}

async function sendTelegramMessage(telegramId: string, text: string, type: NotificationType, attempt = 1): Promise<void> {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramId, text, parse_mode: 'HTML' }),
    });

    if (response.status === 403) {
      app.log.warn({ telegramId, type, status: 403, attempt }, 'Notification blocked by user');
      return;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram API ${response.status}: ${body}`);
    }

    app.log.info({ telegramId, type, sentAt: new Date().toISOString(), status: 'sent', attempt }, 'Notification sent');
  } catch (err) {
    app.log.error({ telegramId, type, attempt, err }, 'Notification send failed');
    if (attempt >= 3) return;

    // Retry after 5 minutes, max 3 attempts.
    setTimeout(() => {
      sendTelegramMessage(telegramId, text, type, attempt + 1).catch((retryErr) => {
        app.log.error({ telegramId, type, retryErr }, 'Notification retry failed');
      });
    }, 5 * 60_000);
  }
}

// ── API Routes ────────────────────────────────────────────────────────────────

app.get('/health', async (_req: any, reply: any) => {
  return reply.send({ status: 'ok', service: 'notification-service' });
});

app.post('/notify/budget-alert', async (req: any, reply: any) => {
  const payload = req.body as BudgetAlertPayload;
  if (!payload?.telegramId || !payload.categoryName || !payload.limit) {
    return reply.status(400).send({ error: 'telegramId, categoryName and limit are required' });
  }

  // Check user notification preferences (TASK-020)
  const settings = await getUserNotifSettings(payload.telegramId);
  if (!settings.budgetAlerts) {
    app.log.info({ telegramId: payload.telegramId }, 'Budget alert suppressed by user settings');
    return reply.send({ data: { queued: false, suppressed: true } });
  }

  const text = buildBudgetAlertMessage(payload);
  await sendTelegramMessage(payload.telegramId, text, 'budget_alert');
  return reply.send({ data: { queued: true } });
});

app.post('/notify/test', async (req: any, reply: any) => {
  if (process.env.NODE_ENV !== 'development') {
    return reply.status(403).send({ error: 'Test notifications are only available in development' });
  }

  const { telegramId, text } = req.body as { telegramId?: string; text?: string };
  if (!telegramId) return reply.status(400).send({ error: 'telegramId required' });

  await sendTelegramMessage(telegramId, text ?? '✅ Тестовое уведомление FinWise', 'test');
  return reply.send({ data: { sent: true } });
});

// ── Cron jobs ─────────────────────────────────────────────────────────────────

// Daily at 10:00 UTC — recurring payment reminders (TASK-020).
// Finance-service must expose GET /users/active with upcoming recurring payments
// for this cron to send real reminders. Until then it logs and exits gracefully.
cron.schedule('0 10 * * *', async () => {
  app.log.info({ FINANCE_SERVICE_URL }, 'Recurring payment reminder cron started');
  try {
    const res = await fetch(`${FINANCE_SERVICE_URL}/users/active`, {
      headers: { 'x-internal-secret': INTERNAL_SECRET },
    });
    if (!res.ok) {
      app.log.warn('Could not fetch active users for recurring reminders');
      return;
    }
    const { users } = await res.json() as { users: Array<{ telegramId: string; upcomingPayments?: Array<{ label: string; amount: number }> }> };
    for (const user of users) {
      const settings = await getUserNotifSettings(user.telegramId);
      if (!settings.recurringReminders) continue;
      for (const payment of user.upcomingPayments ?? []) {
        await sendTelegramMessage(
          user.telegramId,
          buildRecurringReminderMessage({ telegramId: user.telegramId, label: payment.label, amount: payment.amount }),
          'recurring_reminder'
        );
      }
    }
  } catch (err) {
    app.log.error({ err }, 'Recurring reminder cron failed');
  }
}, { timezone: 'UTC' });

// Weekly report: Sundays at 18:00 UTC (TASK-019).
cron.schedule('0 18 * * 0', async () => {
  app.log.info({ FINANCE_SERVICE_URL, AI_SERVICE_URL }, 'Weekly report cron started');

  try {
    // Fetch active users from finance-service
    const usersRes = await fetch(`${FINANCE_SERVICE_URL}/users/active`, {
      headers: { 'x-internal-secret': process.env.INTERNAL_SECRET ?? 'finwise-internal' },
    });

    if (!usersRes.ok) {
      app.log.warn('Could not fetch active users for weekly report');
      return;
    }

    const { users } = await usersRes.json() as { users: Array<{ telegramId: string; weeklyData: any }> };

    for (const user of users) {
      try {
        // Check user notification preferences before sending (TASK-020)
        const settings = await getUserNotifSettings(user.telegramId);
        if (!settings.weeklyReport) {
          app.log.info({ telegramId: user.telegramId }, 'Weekly report suppressed by user settings');
          continue;
        }

        // Get AI-generated weekly summary
        const summaryRes = await fetch(`${AI_SERVICE_URL}/ai/weekly-summary`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': process.env.INTERNAL_SECRET ?? 'finwise-internal',
          },
          body: JSON.stringify({ telegramId: user.telegramId, weeklyData: user.weeklyData }),
        });

        if (summaryRes.ok) {
          const { message } = await summaryRes.json() as { message: string };
          if (message) {
            await sendTelegramMessage(user.telegramId, message, 'weekly_report');
          }
        } else {
          // Fallback: plain text report
          const wd = user.weeklyData;
          const fallback = `📊 <b>Итоги недели FinWise</b>\n\nРасходы: ${wd?.totalExpenses ?? 0} ₽\nДоходы: ${wd?.totalIncome ?? 0} ₽\nТранзакций: ${wd?.transactionCount ?? 0}`;
          await sendTelegramMessage(user.telegramId, fallback, 'weekly_report');
        }
      } catch (userErr) {
        app.log.error({ telegramId: user.telegramId, userErr }, 'Failed to send weekly report to user');
      }
    }
  } catch (err) {
    app.log.error({ err }, 'Weekly report cron failed');
  }
}, { timezone: 'UTC' });

// ── API: Manual weekly report trigger (for testing) ───────────────────────────

app.post('/notify/weekly-report', async (req: any, reply: any) => {
  const { telegramId, weeklyData } = req.body as { telegramId?: string; weeklyData?: any };
  if (!telegramId) return reply.status(400).send({ error: 'telegramId required' });

  try {
    // Try AI summary first
    const summaryRes = await fetch(`${AI_SERVICE_URL}/ai/weekly-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SECRET ?? 'finwise-internal',
      },
      body: JSON.stringify({ telegramId, weeklyData: weeklyData ?? {} }),
    });

    let message: string;
    if (summaryRes.ok) {
      const data = await summaryRes.json() as { message: string };
      message = data.message || buildWeeklyReportMessage({ telegramId, text: 'Нет данных за неделю' });
    } else {
      message = buildWeeklyReportMessage({ telegramId, text: 'Нет данных за неделю' });
    }

    await sendTelegramMessage(telegramId, message, 'weekly_report');
    return reply.send({ data: { sent: true } });
  } catch (err) {
    app.log.error({ err }, 'Manual weekly report failed');
    return reply.status(500).send({ error: 'Failed to send weekly report' });
  }
});

// Internal helper for future cron expansion.
export async function sendRecurringReminder(payload: RecurringReminderPayload): Promise<void> {
  await sendTelegramMessage(payload.telegramId, buildRecurringReminderMessage(payload), 'recurring_reminder');
}

export async function sendWeeklyReport(payload: WeeklyReportPayload): Promise<void> {
  await sendTelegramMessage(payload.telegramId, buildWeeklyReportMessage(payload), 'weekly_report');
}

// ── Start ─────────────────────────────────────────────────────────────────────

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[notification-service] Running on port ${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
