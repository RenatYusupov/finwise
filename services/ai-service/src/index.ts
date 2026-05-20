import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';

const app = Fastify({ logger: true });

const JWT_SECRET = process.env.JWT_SECRET ?? '';
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? '';
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.1-8b-instant';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

if (!JWT_SECRET) {
  console.error('[ai-service] FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}
if (!GROQ_API_KEY) {
  console.error('[ai-service] FATAL: GROQ_API_KEY environment variable is required');
  process.exit(1);
}

await app.register(cors, { origin: true });
await app.register(helmet);

// ── Types ─────────────────────────────────────────────────────────────────────

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CategorizeInput {
  description: string;
  amount: number;
  type: 'expense' | 'income';
  bankCategory?: string;
  idx?: number;
}

interface CategorizeResult {
  category: string;
  categoryId: string;
  confidence: number;
  reasoning: string | null;
}

interface FinancialContext {
  monthlyBudget?: number;
  spentThisMonth?: number;
  safeToSpend?: number;
  topCategories?: Array<{ name: string; amount: number; percent?: number }>;
  recentTransactions?: Array<{ description: string; amount: number; type: string; category?: string; date?: string }>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function getTelegramId(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { sub: string; telegramId?: string };
    return payload.telegramId ?? payload.sub ?? null;
  } catch {
    return null;
  }
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(telegramId: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(telegramId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(telegramId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true, retryAfter: 0 };
  }
  if (entry.count >= RATE_LIMIT) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { ok: true, retryAfter: 0 };
}

function requireAuthAndRateLimit(req: any, reply: any): string | null {
  const telegramId = getTelegramId(req.headers.authorization);
  if (!telegramId) {
    reply.status(401).send({ error: 'Unauthorized' });
    return null;
  }
  const rate = checkRateLimit(telegramId);
  if (!rate.ok) {
    reply.status(429).send({ error: 'Rate limit exceeded', retryAfter: rate.retryAfter });
    return null;
  }
  return telegramId;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap.entries()) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}, 5 * 60_000);

// ── Groq client with timeout ──────────────────────────────────────────────────

async function callGroq(messages: GroqMessage[], opts: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 512,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      app.log.error(`Groq API error ${response.status}: ${errText}`);
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = (await response.json()) as { choices: { message: { content: string } }[] };
    return (data.choices?.[0]?.message?.content ?? '').trim();
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      const timeout = new Error('AI service timeout');
      (timeout as any).code = 'AI_TIMEOUT';
      throw timeout;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function sendGroqError(reply: any, err: unknown) {
  if ((err as any)?.code === 'AI_TIMEOUT') {
    return reply.status(504).send({ error: 'AI service timeout' });
  }
  return reply.status(503).send({ error: 'AI service temporarily unavailable' });
}

function extractJsonArray(content: string): unknown[] {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      for (const key of ['transactions', 'result', 'items', 'data', 'list', 'insights']) {
        if (Array.isArray(obj[key])) return obj[key] as unknown[];
      }
    }
  } catch { /* continue */ }

  const match = content.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* continue */ }
  }
  return [];
}

function extractJsonObject(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* continue */ }

  const match = content.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* continue */ }
  }
  return null;
}

// ── Category constants and cache ──────────────────────────────────────────────

const VALID_CATEGORY_IDS = new Set([
  'food', 'transport', 'shopping', 'health', 'entertainment',
  'cafe', 'sport', 'beauty', 'home', 'education', 'travel', 'other_exp',
  'salary', 'freelance', 'gift', 'investment', 'cashback', 'other_inc',
]);

const categoryCache = new Map<string, { value: CategorizeResult; expiresAt: number }>();
const CATEGORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function categorizeCacheKey(input: Pick<CategorizeInput, 'description' | 'type'>): string {
  return createHash('sha256')
    .update(`${input.description.trim().toLowerCase()}|${input.type}`)
    .digest('hex');
}

function normalizeCategory(category: string | undefined, type: 'expense' | 'income'): string {
  if (category && VALID_CATEGORY_IDS.has(category)) return category;
  return type === 'income' ? 'other_inc' : 'other_exp';
}

const SINGLE_CATEGORIZE_PROMPT = `Ты финансовый ассистент. Определи категорию одной банковской транзакции.
Верни ТОЛЬКО JSON объект: {"category":"...","confidence":0.0,"reasoning":"..."}.

Категории расходов: food, cafe, transport, shopping, health, entertainment, sport, beauty, home, education, travel, other_exp.
Категории доходов: salary, freelance, gift, investment, cashback, other_inc.

Правила:
- Учитывай description, bankCategory, type и amount.
- investment только для входящих дивидендов/процентов, не для пополнения брокерского счёта.
- Если описание пустое, верни other_exp/other_inc с confidence 0.1.
- confidence от 0 до 1.`;

const BULK_CATEGORIZE_PROMPT = `Ты финансовый ассистент. Тебе дан список банковских транзакций в JSON.
Каждая транзакция содержит idx, description, bankCategory, type, amount.
Верни ТОЛЬКО JSON массив: [{"idx":0,"categoryId":"food","confidence":0.95,"reasoning":"..."}].

Категории расходов: food, cafe, transport, shopping, health, entertainment, sport, beauty, home, education, travel, other_exp.
Категории доходов: salary, freelance, gift, investment, cashback, other_inc.

Правила:
- Учитывай сумму и категорию банка.
- investment только для входящих дивидендов/процентов.
- Никакого текста до или после JSON.`;

async function categorizeOne(input: CategorizeInput): Promise<CategorizeResult> {
  if (!input.description?.trim()) {
    const category = input.type === 'income' ? 'other_inc' : 'other_exp';
    return { category, categoryId: category, confidence: 0.1, reasoning: 'empty description' };
  }

  const key = categorizeCacheKey(input);
  const cached = categoryCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  const content = await callGroq(
    [
      { role: 'system', content: SINGLE_CATEGORIZE_PROMPT },
      { role: 'user', content: JSON.stringify(input) },
    ],
    { temperature: 0.1, maxTokens: 256 }
  );

  const parsed = extractJsonObject(content);
  const category = normalizeCategory(String(parsed?.category ?? parsed?.categoryId ?? ''), input.type);
  const confidence = Math.max(0, Math.min(1, Number(parsed?.confidence ?? 0)));
  const result: CategorizeResult = {
    category,
    categoryId: category,
    confidence,
    reasoning: typeof parsed?.reasoning === 'string' ? parsed.reasoning : null,
  };

  categoryCache.set(key, { value: result, expiresAt: Date.now() + CATEGORY_CACHE_TTL_MS });
  return result;
}

// ── Routes: Categorization ────────────────────────────────────────────────────

// POST /ai/categorize — supports TASK-007 single contract and legacy batch contract.
app.post('/ai/categorize', async (req: any, reply: any) => {
  const telegramId = requireAuthAndRateLimit(req, reply);
  if (!telegramId) return;

  const body = req.body ?? {};

  // Legacy client contract: { transactions: [...] } → { data: [{idx, categoryId}] }
  if (Array.isArray(body.transactions)) {
    const inputs = body.transactions as Array<CategorizeInput & { idx: number }>;
    const results = await Promise.all(inputs.map(async (tx) => {
      const res = await categorizeOne(tx);
      return { idx: tx.idx, categoryId: res.categoryId, confidence: res.confidence, reasoning: res.reasoning };
    }));
    return reply.send({ data: results });
  }

  const input = body as CategorizeInput;
  if (!input.type || !['expense', 'income'].includes(input.type)) {
    return reply.status(400).send({ error: 'type must be expense or income' });
  }

  try {
    const result = await categorizeOne(input);
    return reply.send(result);
  } catch (err) {
    app.log.error('Groq categorize error:', err);
    return sendGroqError(reply, err);
  }
});

// POST /ai/categorize/bulk — TASK-007 bulk contract, up to 50 tx.
app.post('/ai/categorize/bulk', async (req: any, reply: any) => {
  const telegramId = requireAuthAndRateLimit(req, reply);
  if (!telegramId) return;

  const transactions = Array.isArray(req.body?.transactions) ? req.body.transactions as CategorizeInput[] : [];
  if (transactions.length > 50) return reply.status(400).send({ error: 'Maximum 50 transactions per request' });
  if (transactions.length === 0) return reply.send({ data: [] });

  const results: Array<{ idx: number; categoryId: string; confidence: number; reasoning: string | null }> = [];
  const uncached: Array<CategorizeInput & { idx: number; cacheKey: string }> = [];

  transactions.forEach((tx, idx) => {
    const cacheKey = categorizeCacheKey(tx);
    const cached = categoryCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      results.push({ idx, categoryId: cached.value.categoryId, confidence: cached.value.confidence, reasoning: cached.value.reasoning });
    } else {
      uncached.push({ ...tx, idx, cacheKey });
    }
  });

  if (uncached.length > 0) {
    try {
      const payload = uncached.map(({ idx, description, bankCategory, type, amount }) => ({ idx, description, bankCategory, type, amount }));
      const content = await callGroq(
        [
          { role: 'system', content: BULK_CATEGORIZE_PROMPT },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        { temperature: 0.1, maxTokens: 1024 }
      );

      const parsed = extractJsonArray(content).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
      for (const item of parsed) {
        const idx = Number(item.idx);
        const original = uncached.find((tx) => tx.idx === idx);
        if (!original) continue;
        const categoryId = normalizeCategory(String(item.categoryId ?? item.category ?? ''), original.type);
        const confidence = Math.max(0, Math.min(1, Number(item.confidence ?? 0.7)));
        const reasoning = typeof item.reasoning === 'string' ? item.reasoning : null;
        const value: CategorizeResult = { category: categoryId, categoryId, confidence, reasoning };
        categoryCache.set(original.cacheKey, { value, expiresAt: Date.now() + CATEGORY_CACHE_TTL_MS });
        results.push({ idx, categoryId, confidence, reasoning });
      }

      // Fallback for any missing items.
      for (const tx of uncached) {
        if (!results.some((r) => r.idx === tx.idx)) {
          const fallback = normalizeCategory(undefined, tx.type);
          results.push({ idx: tx.idx, categoryId: fallback, confidence: 0, reasoning: null });
        }
      }
    } catch (err) {
      app.log.error('Groq bulk categorize error:', err);
      return sendGroqError(reply, err);
    }
  }

  return reply.send({ data: results.sort((a, b) => a.idx - b.idx) });
});

// ── Routes: Chat ──────────────────────────────────────────────────────────────

function buildFinancialContextText(context: string | FinancialContext | undefined): string {
  if (!context) return '';
  if (typeof context === 'string') return context;

  const parts = [
    context.monthlyBudget !== undefined ? `Месячный бюджет: ${context.monthlyBudget} ₽` : null,
    context.spentThisMonth !== undefined ? `Потрачено в этом месяце: ${context.spentThisMonth} ₽` : null,
    context.safeToSpend !== undefined ? `Можно тратить сегодня: ${context.safeToSpend} ₽` : null,
    context.topCategories?.length ? `Топ категорий: ${context.topCategories.map((c) => `${c.name}: ${c.amount} ₽`).join(', ')}` : null,
    context.recentTransactions?.length ? `Последние транзакции: ${context.recentTransactions.slice(-10).map((t) => `${t.description} ${t.amount} ₽`).join('; ')}` : null,
  ].filter(Boolean);

  return parts.join('\n');
}

app.post('/ai/chat', async (req: any, reply: any) => {
  const telegramId = requireAuthAndRateLimit(req, reply);
  if (!telegramId) return;

  const { message, messages, context, history } = req.body as {
    message?: string;
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    context?: string | FinancialContext;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  };

  const inputMessages = Array.isArray(messages)
    ? messages.slice(-20)
    : [ ...(history ?? []).slice(-19), ...(message ? [{ role: 'user' as const, content: message }] : []) ];

  if (inputMessages.length === 0 || !inputMessages.some((m) => m.role === 'user' && m.content?.trim())) {
    return reply.status(400).send({ error: 'messages or message required' });
  }

  const contextText = buildFinancialContextText(context);
  const systemPrompt = `Ты FinWise — персональный финансовый советник в Telegram Mini App.
Отвечай на русском языке, кратко и по делу (2-5 предложений). Используй конкретные суммы из контекста, если они есть.

Финансовый контекст пользователя:
${contextText || 'Контекст не передан.'}`;

  try {
    const replyText = await callGroq(
      [
        { role: 'system', content: systemPrompt },
        ...inputMessages.map((m) => ({ role: m.role, content: m.content } satisfies GroqMessage)),
      ],
      { temperature: 0.7, maxTokens: 400 }
    );
    return reply.send({ reply: replyText, data: { content: replyText } });
  } catch (err) {
    app.log.error('Groq chat error:', err);
    return sendGroqError(reply, err);
  }
});

// ── Routes: Parse ─────────────────────────────────────────────────────────────

app.post('/ai/parse', async (req: any, reply: any) => {
  const telegramId = requireAuthAndRateLimit(req, reply);
  if (!telegramId) return;

  const { text } = req.body as { text: string };
  if (!text?.trim()) return reply.status(400).send({ error: 'text required' });

  const PARSE_SYSTEM_PROMPT = `Ты финансовый ассистент. Разбери текст пользователя и верни список финансовых транзакций.
Верни ТОЛЬКО JSON массив.
Каждый элемент: {"type":"expense|income","amount":number,"categoryId":"...","description":"..."}.
Категории расходов: food, transport, shopping, health, entertainment, cafe, sport, beauty, home, education, travel, other_exp.
Категории доходов: salary, freelance, gift, investment, cashback, other_inc.`;

  try {
    const content = await callGroq(
      [
        { role: 'system', content: PARSE_SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      { temperature: 0.1, maxTokens: 512 }
    );

    const result = extractJsonArray(content)
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => {
        const type = item.type === 'income' ? 'income' : 'expense';
        const amount = Number(item.amount);
        const categoryId = normalizeCategory(String(item.categoryId ?? ''), type);
        const description = String(item.description ?? '').trim();
        return { type, amount, categoryId, description };
      })
      .filter((tx) => tx.amount > 0);

    return reply.send({ data: result });
  } catch (err) {
    app.log.error('Groq parse error:', err);
    return sendGroqError(reply, err);
  }
});

// ── Routes: Insights ─────────────────────────────────────────────────────────

const insightsCache = new Map<string, { data: unknown[]; generatedAt: string; expiresAt: number }>();
const INSIGHTS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function buildInsightsPrompt(summary: any): string {
  return `Проанализируй финансовые данные пользователя и дай 1-5 персонализированных инсайтов.
Верни ТОЛЬКО JSON массив объектов: [{"type":"warning|tip|success","text":"..."}].

Данные:
${JSON.stringify(summary, null, 2)}`;
}

async function generateInsights(telegramId: string, summary: any): Promise<{ insights: unknown[]; generatedAt: string }> {
  const cached = insightsCache.get(telegramId);
  if (cached && Date.now() < cached.expiresAt) {
    return { insights: cached.data, generatedAt: cached.generatedAt };
  }

  const content = await callGroq(
    [{ role: 'user', content: buildInsightsPrompt(summary ?? {}) }],
    { temperature: 0.5, maxTokens: 512 }
  );

  let insights = extractJsonArray(content)
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      type: String(item.type ?? 'tip'),
      text: String(item.text ?? item.description ?? item.title ?? '').trim(),
    }))
    .filter((item) => item.text)
    .slice(0, 5);

  if (insights.length === 0) {
    insights = [{ type: 'tip', text: 'Добавьте больше транзакций, чтобы FinWise смог подготовить персональные инсайты.' }];
  }

  const generatedAt = new Date().toISOString();
  insightsCache.set(telegramId, { data: insights, generatedAt, expiresAt: Date.now() + INSIGHTS_CACHE_TTL_MS });
  return { insights, generatedAt };
}

app.get('/ai/insights', async (req: any, reply: any) => {
  const telegramId = requireAuthAndRateLimit(req, reply);
  if (!telegramId) return;

  try {
    const result = await generateInsights(telegramId, {});
    return reply.send(result);
  } catch (err) {
    app.log.error('Groq insights error:', err);
    return sendGroqError(reply, err);
  }
});

// Legacy/client-friendly POST /ai/insights with summary in body.
app.post('/ai/insights', async (req: any, reply: any) => {
  const telegramId = requireAuthAndRateLimit(req, reply);
  if (!telegramId) return;

  try {
    const result = await generateInsights(telegramId, req.body?.summary ?? req.body ?? {});
    return reply.send({ ...result, data: result.insights });
  } catch (err) {
    app.log.error('Groq insights error:', err);
    return sendGroqError(reply, err);
  }
});

// ── Routes: Budget Recommendations (TASK-016) ─────────────────────────────────

app.post('/ai/budget-recommendations', async (req: any, reply: any) => {
  const telegramId = requireAuthAndRateLimit(req, reply);
  if (!telegramId) return;

  const { categorySpending, currentBudgets, income } = req.body as {
    categorySpending?: Array<{ categoryId: string; categoryName: string; amount: number }>;
    currentBudgets?: Array<{ categoryId: string; limit: number }>;
    income?: number;
  };

  if (!categorySpending || categorySpending.length === 0) {
    return reply.status(400).send({ error: 'categorySpending required' });
  }

  const prompt = `Ты финансовый советник. Проанализируй расходы пользователя и предложи оптимальные лимиты бюджета.

Доход за месяц: ${income ? `${income} руб.` : 'не указан'}

Текущие расходы по категориям:
${categorySpending.map((c) => `- ${c.categoryName}: ${c.amount} руб.`).join('\n')}

${currentBudgets && currentBudgets.length > 0 ? `Текущие лимиты:\n${currentBudgets.map((b) => `- ${b.categoryId}: ${b.limit} руб.`).join('\n')}` : 'Лимиты не установлены.'}

Верни ТОЛЬКО JSON массив рекомендаций:
[{"categoryId":"...","categoryName":"...","recommendedLimit":number,"currentSpend":number,"reason":"...","priority":"high|medium|low"}]

Правила:
- Рекомендуй лимит = 110-120% от текущих трат (небольшой буфер)
- Для категорий с явным перерасходом — предложи снижение
- Приоритет "high" — категории с перерасходом или >30% дохода
- Максимум 5 рекомендаций, самые важные`;

  try {
    const content = await callGroq(
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, maxTokens: 600 }
    );

    const recommendations = extractJsonArray(content)
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => ({
        categoryId: String(item.categoryId ?? ''),
        categoryName: String(item.categoryName ?? item.categoryId ?? ''),
        recommendedLimit: Number(item.recommendedLimit ?? 0),
        currentSpend: Number(item.currentSpend ?? 0),
        reason: String(item.reason ?? '').trim(),
        priority: (['high', 'medium', 'low'].includes(String(item.priority)) ? item.priority : 'medium') as string,
      }))
      .filter((r) => r.categoryId && r.recommendedLimit > 0)
      .slice(0, 5);

    return reply.send({ recommendations, generatedAt: new Date().toISOString() });
  } catch (err) {
    app.log.error('Budget recommendations error:', err);
    return sendGroqError(reply, err);
  }
});

// ── Routes: Goal Plan (TASK-018) ──────────────────────────────────────────────

app.post('/ai/goal-plan', async (req: any, reply: any) => {
  const telegramId = requireAuthAndRateLimit(req, reply);
  if (!telegramId) return;

  const { goal, monthlyIncome, monthlyExpenses } = req.body as {
    goal?: { name: string; targetAmount: number; currentAmount: number; deadline?: string };
    monthlyIncome?: number;
    monthlyExpenses?: number;
  };

  if (!goal) {
    return reply.status(400).send({ error: 'goal required' });
  }

  const remaining = goal.targetAmount - goal.currentAmount;
  const monthlySavings = monthlyIncome && monthlyExpenses ? monthlyIncome - monthlyExpenses : null;
  const deadlineDate = goal.deadline ? new Date(goal.deadline) : null;
  const monthsLeft = deadlineDate
    ? Math.max(1, Math.ceil((deadlineDate.getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000)))
    : null;

  const prompt = `Ты финансовый советник. Составь план достижения финансовой цели.

Цель: ${goal.name}
Целевая сумма: ${goal.targetAmount} руб.
Накоплено: ${goal.currentAmount} руб.
Осталось накопить: ${remaining} руб.
${goal.deadline ? `Дедлайн: ${goal.deadline} (осталось ~${monthsLeft} мес.)` : ''}
${monthlySavings !== null ? `Свободные средства в месяц: ~${monthlySavings} руб.` : ''}
${monthlyIncome ? `Доход: ${monthlyIncome} руб./мес.` : ''}
${monthlyExpenses ? `Расходы: ${monthlyExpenses} руб./мес.` : ''}

Верни ТОЛЬКО JSON объект:
{
  "monthlyRequired": number,
  "estimatedMonths": number,
  "feasible": boolean,
  "recommendations": [
    {"title":"...","description":"...","impact":number,"type":"save|earn|cut"}
  ],
  "summary": "краткое резюме плана"
}

Правила:
- monthlyRequired = сколько нужно откладывать в месяц
- estimatedMonths = при текущем темпе сколько месяцев
- feasible = реально ли достичь цели к дедлайну
- 3-4 конкретные рекомендации с impact в рублях
- summary — 1-2 предложения на русском`;

  try {
    const content = await callGroq(
      [{ role: 'user', content: prompt }],
      { temperature: 0.4, maxTokens: 700 }
    );

    const plan = extractJsonObject(content);
    if (!plan) {
      return reply.status(500).send({ error: 'Failed to generate plan' });
    }

    return reply.send({
      monthlyRequired: Number(plan.monthlyRequired ?? 0),
      estimatedMonths: Number(plan.estimatedMonths ?? 0),
      feasible: Boolean(plan.feasible ?? true),
      recommendations: Array.isArray(plan.recommendations) ? plan.recommendations.slice(0, 4) : [],
      summary: String(plan.summary ?? '').trim(),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    app.log.error('Goal plan error:', err);
    return sendGroqError(reply, err);
  }
});

// ── Routes: Weekly Summary (TASK-019) ─────────────────────────────────────────

app.post('/ai/weekly-summary', async (req: any, reply: any) => {
  // This endpoint is called by notification-service — auth via internal secret
  const internalSecret = req.headers['x-internal-secret'];
  if (internalSecret !== (process.env.INTERNAL_SECRET ?? 'finwise-internal')) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const { telegramId, weeklyData } = req.body as {
    telegramId: string;
    weeklyData: {
      totalExpenses: number;
      totalIncome: number;
      topCategories: Array<{ name: string; amount: number }>;
      transactionCount: number;
      previousWeekExpenses?: number;
    };
  };

  if (!telegramId || !weeklyData) {
    return reply.status(400).send({ error: 'telegramId and weeklyData required' });
  }

  const changeVsLastWeek = weeklyData.previousWeekExpenses
    ? ((weeklyData.totalExpenses - weeklyData.previousWeekExpenses) / weeklyData.previousWeekExpenses) * 100
    : null;

  const prompt = `Составь краткий еженедельный финансовый отчёт для пользователя Telegram.

Данные за неделю:
- Расходы: ${weeklyData.totalExpenses} руб.
- Доходы: ${weeklyData.totalIncome} руб.
- Транзакций: ${weeklyData.transactionCount}
- Топ категории: ${weeklyData.topCategories.map((c) => `${c.name}: ${c.amount} руб.`).join(', ')}
${changeVsLastWeek !== null ? `- Изменение vs прошлая неделя: ${changeVsLastWeek > 0 ? '+' : ''}${changeVsLastWeek.toFixed(0)}%` : ''}

Верни ТОЛЬКО JSON:
{
  "message": "текст сообщения для Telegram (с эмодзи, 3-5 строк)",
  "insight": "главный инсайт недели (1 предложение)",
  "tip": "совет на следующую неделю (1 предложение)"
}`;

  try {
    const content = await callGroq(
      [{ role: 'user', content: prompt }],
      { temperature: 0.6, maxTokens: 400 }
    );

    const result = extractJsonObject(content);
    if (!result) {
      // Fallback plain text
      const fallback = `📊 *Итоги недели*\n\nРасходы: ${weeklyData.totalExpenses} руб.\nДоходы: ${weeklyData.totalIncome} руб.\nТранзакций: ${weeklyData.transactionCount}`;
      return reply.send({ message: fallback, insight: '', tip: '' });
    }

    return reply.send({
      message: String(result.message ?? '').trim(),
      insight: String(result.insight ?? '').trim(),
      tip: String(result.tip ?? '').trim(),
    });
  } catch (err) {
    app.log.error('Weekly summary error:', err);
    return sendGroqError(reply, err);
  }
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', async (_req: any, reply: any) => {
  return reply.send({ status: 'ok', service: 'ai-service', groqConfigured: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.AI_SERVICE_PORT ?? '3003', 10);

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[ai-service] Running on port ${PORT} with Groq model ${GROQ_MODEL}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
