import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from 'jsonwebtoken';

const app = Fastify({ logger: true });
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? '';
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.1-8b-instant';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

await app.register(cors, { origin: true });
await app.register(helmet);

// ── Auth helper ───────────────────────────────────────────────────────────────

function getTelegramId(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { sub: string; telegramId?: string };
    // Support both sub (telegramId) and explicit telegramId field
    return payload.telegramId ?? payload.sub ?? null;
  } catch {
    return null;
  }
}

// ── Rate limiter (in-memory, per telegramId) ──────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20; // requests per window
const RATE_WINDOW_MS = 60_000; // 1 minute

function checkRateLimit(telegramId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(telegramId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(telegramId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap.entries()) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}, 5 * 60_000);

// ── Groq client ───────────────────────────────────────────────────────────────

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callGroq(
  messages: GroqMessage[],
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  if (!GROQ_API_KEY) {
    return getMockResponse(messages[messages.length - 1]?.content ?? '');
  }

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
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
    return 'Для быстрого накопления используй правило 50/30/20: 50% на необходимое, 30% на желания, 20% на сбережения.';
  }
  return 'Я анализирую твои финансы и готов помочь с любым вопросом о бюджете, расходах или накоплениях. Что тебя интересует?';
}

// ── Category constants ────────────────────────────────────────────────────────

const VALID_CATEGORY_IDS = new Set([
  'food', 'transport', 'shopping', 'health', 'entertainment',
  'cafe', 'sport', 'beauty', 'home', 'education', 'travel', 'other_exp',
  'salary', 'freelance', 'gift', 'investment', 'cashback', 'other_inc',
]);

const CATEGORIZE_SYSTEM_PROMPT = `Ты финансовый ассистент. Тебе дан список банковских транзакций в формате JSON.
Каждая транзакция содержит поля: idx (индекс), description (описание из банка), bankCategory (категория банка), type (expense/income), amount (сумма в рублях).
Используй ВСЕ поля — description, bankCategory, type и amount — для определения категории.
Верни ТОЛЬКО JSON массив с полями "idx" и "categoryId".

КАТЕГОРИИ РАСХОДОВ (type=expense):
food — продукты, супермаркет, пятёрочка, магнит, вкусвилл, лента, ашан, дикси, окей, глобус, fix price
cafe — кофе, кафе, ресторан, бар, столовая, фастфуд, доставка еды, макдоналдс, kfc, бургер, пицца, суши, шаурма, самокат, яндекс еда, delivery
transport — метро, такси, автобус, электричка, ржд, поезд, бензин, азс, парковка, каршеринг, яндекс такси, uber, ситидрайв, делимобиль, аэроэкспресс
shopping — одежда, wildberries, ozon, lamoda, aliexpress, amazon, zara, h&m, uniqlo, adidas, nike, мвидео, эльдорадо, dns, ситилинк, икеа, леруа, спортмастер, декатлон, электроника
health — аптека, лекарства, врач, клиника, больница, стоматолог, лаборатория, инвитро, гемотест, helix, 36.6, горздрав, ригла, оптика
entertainment — кино, театр, концерт, netflix, spotify, яндекс плюс, apple music, youtube, steam, playstation, xbox, боулинг, музей, парк, кинопоиск, okko, иви
sport — фитнес, спортзал, gym, бассейн, йога, тренажёр, world class, x-fit, alex fitness
beauty — салон, маникюр, педикюр, парикмахер, барбер, косметика, л'этуаль, рив гош, золотое яблоко
home — аренда, жкх, коммунал, квартплата, ипотека, электричество, газ, вода, отопление, интернет, мтс, мегафон, билайн, теле2, ростелеком, ремонт, мебель
education — курсы, обучение, школа, университет, книги, литрес, skillbox, нетология, coursera, udemy, яндекс практикум, репетитор
travel — отель, авиабилет, аэропорт, booking, airbnb, туту, aviasales, путешествие, экскурсия, туризм
other_exp — всё остальное (расход), снятие наличных, банкомат, переводы физлицам без явной цели

КАТЕГОРИИ ДОХОДОВ (type=income):
salary — зарплата, аванс, оклад, премия, зачисление зарплат
freelance — фриланс, подработка, гонорар, проект
gift — подарок, дарение
investment — ТОЛЬКО реальный инвестиционный доход: дивиденды, купоны по облигациям, проценты по вкладу/депозиту
cashback — кэшбэк, возврат средств, refund
other_inc — прочие доходы, переводы от физлиц, пополнения счёта

ВАЖНЫЕ ПРАВИЛА:
- Если bankCategory = "Финансовые операции" и type=expense — это скорее всего shopping или other_exp, НЕ investment
- Если bankCategory = "Переводы" — это other_exp (расход) или other_inc (доход)
- Пополнение брокерского счёта / ИИС — это other_exp, НЕ investment
- investment только для ВХОДЯЩИХ дивидендов/процентов (type=income)

ВАЖНО: Верни ТОЛЬКО JSON массив. Никакого текста до или после. Только [...].
Пример: [{"idx":0,"categoryId":"food"},{"idx":1,"categoryId":"transport"},{"idx":2,"categoryId":"salary"}]`;

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /ai/categorize — batch categorize transactions (TASK-002 core endpoint)
app.post('/ai/categorize', async (req: any, reply: any) => {
  const telegramId = getTelegramId(req.headers.authorization);
  if (!telegramId) return reply.status(401).send({ error: 'Unauthorized' });

  if (!checkRateLimit(telegramId)) {
    return reply.status(429).send({ error: 'Rate limit exceeded. Try again in 1 minute.' });
  }

  const { transactions } = req.body as {
    transactions: Array<{
      idx: number;
      description: string;
      bankCategory: string;
      type: 'expense' | 'income';
      amount: number;
    }>;
  };

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return reply.status(400).send({ error: 'transactions array required' });
  }

  // Process in batches of 30
  const BATCH_SIZE = 30;
  const results: Array<{ idx: number; categoryId: string }> = [];

  for (let b = 0; b < transactions.length; b += BATCH_SIZE) {
    const batch = transactions.slice(b, b + BATCH_SIZE);
    // Re-index within batch for Groq
    const payload = batch.map((tx, i) => ({
      idx: i,
      description: tx.description,
      bankCategory: tx.bankCategory,
      type: tx.type,
      amount: tx.amount,
    }));

    try {
      const content = await callGroq(
        [
          { role: 'system', content: CATEGORIZE_SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        { temperature: 0.1, maxTokens: 1024 }
      );

      let arr: { idx: number; categoryId: string }[] = [];
      // 3-strategy JSON extraction
      try {
        arr = JSON.parse(content);
      } catch {
        const match = content.match(/\[[\s\S]*\]/);
        if (match) {
          try { arr = JSON.parse(match[0]); } catch { /* skip */ }
        }
      }

      for (const item of arr) {
        if (
          typeof item.idx === 'number' &&
          item.idx >= 0 &&
          item.idx < batch.length &&
          VALID_CATEGORY_IDS.has(item.categoryId)
        ) {
          // Map batch-local idx back to original idx
          const origIdx = batch[item.idx]!.idx;
          results.push({ idx: origIdx, categoryId: item.categoryId });
        }
      }
    } catch (err) {
      app.log.error('Groq categorize batch error:', err);
      // Return partial results — client handles missing entries gracefully
    }
  }

  return reply.send({ data: results });
});

// POST /ai/chat — send message, get AI response
app.post('/ai/chat', async (req: any, reply: any) => {
  const telegramId = getTelegramId(req.headers.authorization);
  if (!telegramId) return reply.status(401).send({ error: 'Unauthorized' });

  if (!checkRateLimit(telegramId)) {
    return reply.status(429).send({ error: 'Rate limit exceeded. Try again in 1 minute.' });
  }

  const { message, context, history } = req.body as {
    message: string;
    context?: string; // financial context string built on client
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  };

  if (!message?.trim()) return reply.status(400).send({ error: 'message required' });

  const systemPrompt = `Ты FinWise — персональный финансовый советник в Telegram Mini App. Отвечай на русском языке, кратко и по делу (2-5 предложений). Используй эмодзи для наглядности. Давай конкретные советы на основе данных пользователя. Не повторяй вопрос пользователя.

${context ?? ''}`;

  const recentHistory = (history ?? []).slice(-6).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const messages: GroqMessage[] = [
    { role: 'system', content: systemPrompt },
    ...recentHistory,
    { role: 'user', content: message },
  ];

  try {
    const response = await callGroq(messages, { temperature: 0.7, maxTokens: 400 });
    return reply.send({ data: { content: response } });
  } catch (err) {
    app.log.error('Groq chat error:', err);
    return reply.status(503).send({ error: 'AI service temporarily unavailable' });
  }
});

// POST /ai/parse — parse free text into transactions
app.post('/ai/parse', async (req: any, reply: any) => {
  const telegramId = getTelegramId(req.headers.authorization);
  if (!telegramId) return reply.status(401).send({ error: 'Unauthorized' });

  if (!checkRateLimit(telegramId)) {
    return reply.status(429).send({ error: 'Rate limit exceeded. Try again in 1 minute.' });
  }

  const { text } = req.body as { text: string };
  if (!text?.trim()) return reply.status(400).send({ error: 'text required' });

  const PARSE_SYSTEM_PROMPT = `Ты финансовый ассистент. Разбери текст пользователя и верни список финансовых транзакций.

ВАЖНО: Верни ТОЛЬКО JSON массив. Никакого текста до или после. Никаких \`\`\`. Только [...].

Каждый элемент массива — объект:
- "type": "expense" или "income"
- "amount": число рублей (только цифры, не умножай ни на что)
- "categoryId": одна из категорий ниже
- "description": 1-4 слова на русском

КАТЕГОРИИ РАСХОДОВ:
food — продукты, еда, магазин, пятёрочка, вкусвилл
transport — метро, автобус, такси, бензин, парковка
shopping — одежда, wildberries, ozon, покупки
health — аптека, лекарства, врач, клиника
entertainment — кино, netflix, spotify, подписки
cafe — кофе, кафе, ресторан, обед, ужин, завтрак, перекус
sport — спортзал, фитнес, бассейн, йога
beauty — салон, маникюр, косметика
home — аренда, ЖКХ, коммуналка, интернет, ремонт
education — курсы, обучение, книги
travel — отель, авиа, путешествие
other_exp — всё остальное (расход)

КАТЕГОРИИ ДОХОДОВ:
salary — зарплата, аванс
freelance — фриланс, подработка
gift — подарок
investment — дивиденды, инвестиции
cashback — кэшбэк, возврат
other_inc — всё остальное (доход)

ПРИМЕРЫ:
Ввод: я с утра попил кофе за 500 потом пообедал за 600
Вывод: [{"type":"expense","amount":500,"categoryId":"cafe","description":"кофе"},{"type":"expense","amount":600,"categoryId":"cafe","description":"обед"}]

Ввод: купил продукты на 1500 и такси 350
Вывод: [{"type":"expense","amount":1500,"categoryId":"food","description":"продукты"},{"type":"expense","amount":350,"categoryId":"transport","description":"такси"}]

Ввод: зарплата 80000
Вывод: [{"type":"income","amount":80000,"categoryId":"salary","description":"зарплата"}]`;

  try {
    const content = await callGroq(
      [
        { role: 'system', content: PARSE_SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      { temperature: 0.1, maxTokens: 512 }
    );

    let txArray: unknown[] = [];

    // Strategy 1: entire content is a JSON array
    if (content.startsWith('[')) {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) txArray = parsed;
      } catch { /* fall through */ }
    }

    // Strategy 2: find [...] anywhere in the content
    if (txArray.length === 0) {
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed)) txArray = parsed;
        } catch { /* fall through */ }
      }
    }

    // Strategy 3: content is a JSON object wrapping the array
    if (txArray.length === 0) {
      try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const obj = parsed as Record<string, unknown>;
          for (const key of ['transactions', 'result', 'items', 'data', 'list']) {
            if (Array.isArray(obj[key])) { txArray = obj[key] as unknown[]; break; }
          }
        }
      } catch { /* fall through */ }
    }

    const validCategoryIds = VALID_CATEGORY_IDS;
    const result = txArray
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => {
        const type = item['type'] === 'income' ? 'income' : 'expense';
        const amount = Number(item['amount']);
        const rawCatId = String(item['categoryId'] ?? '');
        const categoryId = validCategoryIds.has(rawCatId)
          ? rawCatId
          : type === 'income' ? 'other_inc' : 'other_exp';
        const description = String(item['description'] ?? '').trim();
        return { type, amount, categoryId, description };
      })
      .filter((tx) => tx.amount > 0);

    return reply.send({ data: result });
  } catch (err) {
    app.log.error('Groq parse error:', err);
    return reply.status(503).send({ error: 'AI service temporarily unavailable' });
  }
});

// GET /ai/insights — generate spending insights from client-provided data
app.post('/ai/insights', async (req: any, reply: any) => {
  const telegramId = getTelegramId(req.headers.authorization);
  if (!telegramId) return reply.status(401).send({ error: 'Unauthorized' });

  if (!checkRateLimit(telegramId)) {
    return reply.status(429).send({ error: 'Rate limit exceeded. Try again in 1 minute.' });
  }

  const { summary } = req.body as {
    summary: {
      income: number;
      expenses: number;
      savings: number;
      savingsRate: number;
      topCategories: Array<{ name: string; amount: number; percent: number }>;
    };
  };

  if (!summary) return reply.status(400).send({ error: 'summary required' });

  const prompt = `Проанализируй финансовые данные пользователя за текущий месяц и дай 2-3 конкретных инсайта.

Данные:
- Доходы: ${summary.income.toLocaleString('ru-RU')} ₽
- Расходы: ${summary.expenses.toLocaleString('ru-RU')} ₽
- Баланс: ${summary.savings.toLocaleString('ru-RU')} ₽
- Норма сбережений: ${summary.savingsRate}%
- Топ категории: ${summary.topCategories.map((c) => `${c.name} ${c.amount.toLocaleString('ru-RU')} ₽ (${c.percent}%)`).join(', ')}

Верни JSON массив из 2-3 объектов: [{"type":"spending_alert"|"saving_tip"|"goal_progress","title":"...","description":"...","priority":"high"|"medium"|"low"}]
Только JSON, никакого текста.`;

  try {
    const content = await callGroq(
      [{ role: 'user', content: prompt }],
      { temperature: 0.5, maxTokens: 512 }
    );

    let insights: unknown[] = [];
    try { insights = JSON.parse(content); } catch {
      const match = content.match(/\[[\s\S]*\]/);
      if (match) { try { insights = JSON.parse(match[0]); } catch { /* skip */ } }
    }

    return reply.send({ data: insights });
  } catch (err) {
    app.log.error('Groq insights error:', err);
    return reply.status(503).send({ error: 'AI service temporarily unavailable' });
  }
});

// Health check
app.get('/health', async (_req: any, reply: any) => {
  return reply.send({ status: 'ok', groqConfigured: !!GROQ_API_KEY });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.AI_SERVICE_PORT ?? '3003');

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`AI service running on port ${PORT} (Groq: ${GROQ_API_KEY ? 'configured' : 'mock mode'})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
