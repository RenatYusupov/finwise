import { Telegraf, Markup, Context } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import { message } from 'telegraf/filters';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://your-finwise-app.com';
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN || '';
const WEBHOOK_PATH = process.env.WEBHOOK_PATH || '/webhook';
const PORT = parseInt(process.env.BOT_PORT || '3005');

if (!BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const prisma = new PrismaClient();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMainKeyboard() {
  return Markup.keyboard([
    [Markup.button.webApp('💰 Открыть FinWise', WEBAPP_URL)],
  ]).resize();
}

function getInlineKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.webApp('🚀 Открыть приложение', WEBAPP_URL)],
    [
      Markup.button.callback('📊 Статистика', 'stats'),
      Markup.button.callback('❓ Помощь', 'help'),
    ],
  ]);
}

// ─── Commands ─────────────────────────────────────────────────────────────────

bot.start(async (ctx: Context) => {
  const user = ctx.from;
  if (!user) return;

  // Upsert user in DB
  try {
    await prisma.user.upsert({
      where: { telegramId: String(user.id) },
      update: {
        firstName: user.first_name,
        lastName: user.last_name || null,
        username: user.username || null,
      },
      create: {
        telegramId: String(user.id),
        firstName: user.first_name,
        lastName: user.last_name || null,
        username: user.username || null,
      },
    });
  } catch (err) {
    console.error('Failed to upsert user:', err);
  }

  const firstName = user.first_name;

  await ctx.replyWithPhoto(
    { url: 'https://i.imgur.com/placeholder-finwise-banner.png' },
    {
      caption:
        `👋 Привет, *${firstName}*\\!\n\n` +
        `Добро пожаловать в *FinWise* — твой личный финансовый помощник\\.\n\n` +
        `🎯 *Что умеет FinWise:*\n` +
        `• 📊 Учёт доходов и расходов\n` +
        `• 🤖 AI\\-консультант по финансам\n` +
        `• 🎯 Постановка и отслеживание целей\n` +
        `• 💳 Бюджетирование по категориям\n` +
        `• 🏆 Геймификация и достижения\n\n` +
        `Нажми кнопку ниже, чтобы начать\\!`,
      parse_mode: 'MarkdownV2',
      ...getInlineKeyboard(),
    }
  ).catch(() => {
    // Fallback without photo if URL fails
    ctx.reply(
      `👋 Привет, *${firstName}*!\n\n` +
      `Добро пожаловать в *FinWise* — твой личный финансовый помощник.\n\n` +
      `🎯 *Что умеет FinWise:*\n` +
      `• 📊 Учёт доходов и расходов\n` +
      `• 🤖 AI-консультант по финансам\n` +
      `• 🎯 Постановка и отслеживание целей\n` +
      `• 💳 Бюджетирование по категориям\n` +
      `• 🏆 Геймификация и достижения\n\n` +
      `Нажми кнопку ниже, чтобы начать!`,
      {
        parse_mode: 'Markdown',
        ...getInlineKeyboard(),
      }
    );
  });

  // Also set the persistent keyboard
  await ctx.reply('Используй кнопку ниже для быстрого доступа:', getMainKeyboard());
});

bot.command('app', async (ctx: Context) => {
  await ctx.reply(
    '🚀 Открыть FinWise:',
    Markup.inlineKeyboard([
      [Markup.button.webApp('💰 Открыть FinWise', WEBAPP_URL)],
    ])
  );
});

bot.command('help', async (ctx: Context) => {
  await ctx.reply(
    `❓ *Помощь по FinWise*\n\n` +
    `*Команды:*\n` +
    `/start — Начать работу с ботом\n` +
    `/app — Открыть приложение\n` +
    `/stats — Быстрая статистика\n` +
    `/help — Эта справка\n\n` +
    `*Как пользоваться:*\n` +
    `1\\. Нажми кнопку *"Открыть FinWise"* внизу экрана\n` +
    `2\\. Пройди короткую настройку\n` +
    `3\\. Начни добавлять транзакции\n` +
    `4\\. Получай AI\\-советы по финансам\n\n` +
    `По вопросам: @finwise\\_support`,
    { parse_mode: 'MarkdownV2' }
  );
});

bot.command('stats', async (ctx: Context) => {
  const user = ctx.from;
  if (!user) return;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { telegramId: String(user.id) },
      include: {
        streak: true,
        _count: { select: { transactions: true, goals: true } },
      },
    });

    if (!dbUser || !dbUser.onboardingCompleted) {
      return ctx.reply(
        '📊 Статистика недоступна — сначала настройте приложение!',
        Markup.inlineKeyboard([
          [Markup.button.webApp('🚀 Настроить FinWise', WEBAPP_URL)],
        ])
      );
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [monthlyIncome, monthlyExpenses] = await Promise.all([
      prisma.transaction.aggregate({
        where: { userId: dbUser.id, type: 'INCOME', date: { gte: monthStart } },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { userId: dbUser.id, type: 'EXPENSE', date: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);

    const income = monthlyIncome._sum.amount?.toNumber() || 0;
    const expenses = monthlyExpenses._sum.amount?.toNumber() || 0;
    const balance = income - expenses;
    const streak = dbUser.streak?.currentStreak || 0;

    const formatCurrency = (n: number) =>
      new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);

    await ctx.reply(
      `📊 *Статистика за ${now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}*\n\n` +
      `💰 Доходы: *${formatCurrency(income)}*\n` +
      `💸 Расходы: *${formatCurrency(expenses)}*\n` +
      `${balance >= 0 ? '📈' : '📉'} Баланс: *${formatCurrency(balance)}*\n\n` +
      `📝 Транзакций: *${dbUser._count.transactions}*\n` +
      `🎯 Целей: *${dbUser._count.goals}*\n` +
      `🔥 Серия: *${streak} дней*`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.webApp('📊 Подробная аналитика', WEBAPP_URL)],
        ]),
      }
    );
  } catch (err) {
    console.error('Stats error:', err);
    await ctx.reply('Не удалось загрузить статистику. Попробуйте позже.');
  }
});

// ─── Callback Queries ─────────────────────────────────────────────────────────

bot.action('stats', async (ctx: Context) => {
  await ctx.answerCbQuery();
  // Trigger the stats command logic
  const user = ctx.from;
  if (!user) return;

  await ctx.reply(
    'Открой приложение для подробной статистики:',
    Markup.inlineKeyboard([
      [Markup.button.webApp('📊 Аналитика', WEBAPP_URL)],
    ])
  );
});

bot.action('help', async (ctx: Context) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    `❓ *Помощь*\n\n` +
    `FinWise — это личный финансовый помощник прямо в Telegram.\n\n` +
    `Используй команду /help для полного списка команд.`,
    { parse_mode: 'Markdown' }
  );
});

// ─── Message Handlers ─────────────────────────────────────────────────────────

// Handle text messages — suggest opening the app
bot.on(message('text'), async (ctx) => {
  const text = ctx.message.text.toLowerCase();

  // Simple keyword matching for common intents
  if (text.includes('расход') || text.includes('трат') || text.includes('купил')) {
    await ctx.reply(
      '💡 Добавь транзакцию в приложении:',
      Markup.inlineKeyboard([
        [Markup.button.webApp('➕ Добавить транзакцию', `${WEBAPP_URL}/transactions/add`)],
      ])
    );
  } else if (text.includes('цел') || text.includes('накопи')) {
    await ctx.reply(
      '🎯 Управляй целями в приложении:',
      Markup.inlineKeyboard([
        [Markup.button.webApp('🎯 Мои цели', `${WEBAPP_URL}/goals`)],
      ])
    );
  } else if (text.includes('бюджет') || text.includes('лимит')) {
    await ctx.reply(
      '💳 Настрой бюджет в приложении:',
      Markup.inlineKeyboard([
        [Markup.button.webApp('💳 Бюджет', `${WEBAPP_URL}/budget`)],
      ])
    );
  } else if (text.includes('совет') || text.includes('помог') || text.includes('ai') || text.includes('ии')) {
    await ctx.reply(
      '🤖 Спроси AI-консультанта:',
      Markup.inlineKeyboard([
        [Markup.button.webApp('🤖 AI-консультант', `${WEBAPP_URL}/ai-chat`)],
      ])
    );
  } else {
    await ctx.reply(
      '👋 Открой FinWise, чтобы управлять финансами:',
      Markup.inlineKeyboard([
        [Markup.button.webApp('💰 Открыть FinWise', WEBAPP_URL)],
      ])
    );
  }
});

// ─── Error Handler ────────────────────────────────────────────────────────────

bot.catch((err: unknown, ctx: Context) => {
  console.error(`Bot error for update ${ctx.updateType}:`, err);
});

// ─── Launch ───────────────────────────────────────────────────────────────────

async function launch() {
  try {
    // Set bot commands
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Начать работу с FinWise' },
      { command: 'app', description: 'Открыть приложение' },
      { command: 'stats', description: 'Быстрая статистика' },
      { command: 'help', description: 'Помощь' },
    ]);

    if (WEBHOOK_DOMAIN) {
      // Production: use webhook
      const webhookUrl = `${WEBHOOK_DOMAIN}${WEBHOOK_PATH}`;
      await bot.launch({
        webhook: {
          domain: WEBHOOK_DOMAIN,
          path: WEBHOOK_PATH,
          port: PORT,
        },
      });
      console.log(`Bot started with webhook: ${webhookUrl}`);
    } else {
      // Development: use long polling
      await bot.launch();
      console.log('Bot started with long polling');
    }

    console.log(`FinWise bot @${(await bot.telegram.getMe()).username} is running`);
  } catch (err) {
    console.error('Failed to launch bot:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.once('SIGINT', () => {
  bot.stop('SIGINT');
  prisma.$disconnect();
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  prisma.$disconnect();
});

launch();
