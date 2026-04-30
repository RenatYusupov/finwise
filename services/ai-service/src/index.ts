import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { PrismaClient } from '@finwise/db-schema';
import jwt from 'jsonwebtoken';
import axios from 'axios';

const app = Fastify({ logger: true });
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const YANDEX_GPT_API_KEY = process.env.YANDEX_GPT_API_KEY ?? '';
const YANDEX_GPT_FOLDER_ID = process.env.YANDEX_GPT_FOLDER_ID ?? '';
const YANDEX_GPT_MODEL = process.env.YANDEX_GPT_MODEL ?? 'yandexgpt-lite';

await app.register(cors, { origin: true });
await app.register(helmet);

// ── Auth helper ───────────────────────────────────────────────────────────────

function getUserId(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { sub: string };
    return payload.sub;
  } catch {
    return null;
  }
}

// ── YandexGPT client ──────────────────────────────────────────────────────────

interface YandexGptMessage {
  role: 'system' | 'user' | 'assistant';
  text: string;
}

async function callYandexGpt(messages: YandexGptMessage[]): Promise<string> {
  // If no API key configured, return mock response
  if (!YANDEX_GPT_API_KEY || !YANDEX_GPT_FOLDER_ID) {
    return getMockResponse(messages[messages.length - 1]?.text ?? '');
  }

  try {
    const response = await axios.post(
      'https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
      {
        modelUri: `gpt://${YANDEX_GPT_FOLDER_ID}/${YANDEX_GPT_MODEL}`,
        completionOptions: {
          stream: false,
          temperature: 0.6,
          maxTokens: 1000,
        },
        messages,
      },
      {
        headers: {
          Authorization: `Api-Key ${YANDEX_GPT_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.result.alternatives[0]?.message?.text ?? 'Не удалось получить ответ';
  } catch (err) {
    app.log.error('YandexGPT error:', err);
    return 'Извини, сейчас не могу ответить. Попробуй позже.';
  }
}

function getMockResponse(userMessage: string): string {
  const lower = userMessage.toLowerCase();
  if (lower.includes('трат') || lower.includes('расход')) {
    return 'По твоим данным, основные расходы идут на еду (35%) и транспорт (20%). Рекомендую установить бюджет на развлечения — там есть потенциал для экономии.';
  }
  if (lower.includes('сэконом') || lower.includes('сохран')) {
    return 'Отличный вопрос! Вот 3 способа сэкономить: 1) Готовь дома 3-4 раза в неделю вместо кафе, 2) Используй кэшбэк карты, 3) Планируй крупные покупки заранее.';
  }
  if (lower.includes('накоп') || lower.includes('цел')) {
    return 'Для быстрого накопления используй правило 50/30/20: 50% на необходимое, 30% на желания, 20% на сбережения. При твоём доходе это позволит накопить цель за 8 месяцев.';
  }
  if (lower.includes('анализ') || lower.includes('месяц')) {
    return 'За этот месяц ты потратил на 12% меньше, чем в прошлом — отличный результат! Самая большая статья расходов — еда. Доходы стабильны. Норма сбережений: 18%.';
  }
  return 'Я анализирую твои финансы и готов помочь с любым вопросом о бюджете, расходах или накоплениях. Что тебя интересует?';
}

// ── System prompt builder ─────────────────────────────────────────────────────

async function buildSystemPrompt(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const today = now.toISOString().split('T')[0] ?? '';

  const transactions = await prisma.transaction.findMany({
    where: { userId, date: { gte: monthStart, lte: today } },
    include: { category: true },
    take: 50,
  });

  const totalIncome = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const goals = await prisma.goal.findMany({ where: { userId, status: 'active' }, take: 3 });

  return `Ты — персональный финансовый советник по имени Финн. Ты помогаешь пользователю управлять личными финансами.

Данные пользователя:
- Имя: ${user?.firstName ?? 'Пользователь'}
- Ежемесячный доход: ${user?.monthlyIncome ? `${user.monthlyIncome} ₽` : 'не указан'}
- Тип дохода: ${user?.incomeType === 'regular' ? 'регулярный' : 'нерегулярный'}

Финансы за текущий месяц:
- Доходы: ${totalIncome.toFixed(0)} ₽
- Расходы: ${totalExpenses.toFixed(0)} ₽
- Сбережения: ${(totalIncome - totalExpenses).toFixed(0)} ₽

Активные цели:
${goals.map((g) => `- ${g.name}: ${g.currentAmount}/${g.targetAmount} ₽`).join('\n') || '- нет активных целей'}

Правила:
1. Отвечай на русском языке
2. Будь конкретным и давай практические советы
3. Используй данные пользователя в ответах
4. Соблюдай 152-ФЗ — не передавай данные третьим лицам
5. Будь дружелюбным и мотивирующим`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /ai/chat — get chat history
app.get('/ai/chat', async (req: any, reply: any) => {
  const userId = getUserId(req.headers.authorization);
  if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

  const messages = await prisma.aiMessage.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  return reply.send({ data: messages });
});

// POST /ai/chat — send message
app.post('/ai/chat', async (req: any, reply: any) => {
  const userId = getUserId(req.headers.authorization);
  if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

  const { message } = req.body as { message: string };
  if (!message?.trim()) return reply.status(400).send({ error: 'Message required' });

  // Save user message
  await prisma.aiMessage.create({
    data: { userId, role: 'user', content: message },
  });

  // Get recent history for context
  const history = await prisma.aiMessage.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const systemPrompt = await buildSystemPrompt(userId);

  const gptMessages: YandexGptMessage[] = [
    { role: 'system', text: systemPrompt },
    ...history.reverse().map((m) => ({
      role: m.role as 'user' | 'assistant',
      text: m.content,
    })),
  ];

  const assistantResponse = await callYandexGpt(gptMessages);

  // Save assistant response
  const saved = await prisma.aiMessage.create({
    data: { userId, role: 'assistant', content: assistantResponse },
  });

  return reply.send({ data: saved });
});

// GET /ai/insights — get AI insights
app.get('/ai/insights', async (req: any, reply: any) => {
  const userId = getUserId(req.headers.authorization);
  if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

  // Return existing unread insights or generate new ones
  let insights = await prisma.aiInsight.findMany({
    where: { userId, isRead: false },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  if (insights.length === 0) {
    // Generate insights based on spending data
    insights = await generateInsights(userId);
  }

  return reply.send({ data: insights });
});

// POST /ai/insights/:id/read — mark insight as read
app.post('/ai/insights/:id/read', async (req: any, reply: any) => {
  const userId = getUserId(req.headers.authorization);
  if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

  await prisma.aiInsight.updateMany({
    where: { id: req.params.id, userId },
    data: { isRead: true },
  });

  return reply.send({ data: { success: true } });
});

// ── Insight generator ─────────────────────────────────────────────────────────

async function generateInsights(userId: string) {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const today = now.toISOString().split('T')[0] ?? '';

  const transactions = await prisma.transaction.findMany({
    where: { userId, date: { gte: monthStart, lte: today } },
    include: { category: true },
  });

  const totalExpenses = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const user = await prisma.user.findUnique({ where: { id: userId } });

  const insightsToCreate = [];

  // Check if spending is high relative to income
  if (user?.monthlyIncome && totalExpenses > user.monthlyIncome * 0.8) {
    insightsToCreate.push({
      userId,
      type: 'spending_alert',
      title: 'Расходы превышают 80% дохода',
      description: `В этом месяце ты потратил ${totalExpenses.toFixed(0)} ₽, что составляет ${Math.round((totalExpenses / user.monthlyIncome) * 100)}% от дохода. Рекомендую пересмотреть бюджет.`,
      priority: 'high',
    });
  }

  // Check goals progress
  const goals = await prisma.goal.findMany({ where: { userId, status: 'active' } });
  for (const goal of goals) {
    const progress = (goal.currentAmount / goal.targetAmount) * 100;
    if (progress >= 80) {
      insightsToCreate.push({
        userId,
        type: 'goal_progress',
        title: `Цель "${goal.name}" почти достигнута!`,
        description: `Ты накопил ${Math.round(progress)}% от цели. Осталось всего ${(goal.targetAmount - goal.currentAmount).toFixed(0)} ₽!`,
        priority: 'medium',
      });
    }
  }

  // Default tip if no insights
  if (insightsToCreate.length === 0) {
    insightsToCreate.push({
      userId,
      type: 'saving_tip',
      title: 'Совет по экономии',
      description: 'Попробуй правило 24 часов: перед любой незапланированной покупкой подожди сутки. Это помогает избежать импульсивных трат.',
      priority: 'low',
    });
  }

  const created = await prisma.aiInsight.createMany({ data: insightsToCreate });
  return prisma.aiInsight.findMany({
    where: { userId, isRead: false },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.AI_SERVICE_PORT ?? '3003');

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`AI service running on port ${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
