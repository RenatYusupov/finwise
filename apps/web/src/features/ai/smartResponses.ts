import type { FinanceState } from '../finance/store';

type StoreSnapshot = Pick<FinanceState, 'transactions' | 'goals'> & {
  summary: { income: number; expenses: number; savings: number; savingsRate: number };
  categorySpending: { category: { name: string; icon: string }; amount: number }[];
};

function fmt(n: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);
}

export function generateAiResponse(userMessage: string, store: StoreSnapshot): string {
  const msg = userMessage.toLowerCase();
  const { summary, categorySpending, goals, transactions } = store;

  // Spending analysis
  if (msg.includes('трат') || msg.includes('расход') || msg.includes('куда') || msg.includes('деньги')) {
    if (categorySpending.length === 0) {
      return '📊 У тебя пока нет расходов в этом месяце. Добавь первую трату, и я помогу проанализировать твои финансы!';
    }
    const top3 = categorySpending.slice(0, 3);
    const lines = top3.map((c, i) => `${i + 1}. ${c.category.icon} ${c.category.name} — ${fmt(c.amount)}`).join('\n');
    const totalExp = summary.expenses;
    return `📊 **Твои главные расходы в этом месяце:**\n\n${lines}\n\nВсего потрачено: ${fmt(totalExp)}\n\n${
      top3[0] ? `💡 Больше всего уходит на "${top3[0].category.name}". Попробуй установить лимит на эту категорию в разделе Бюджет.` : ''
    }`;
  }

  // Savings advice
  if (msg.includes('сэконом') || msg.includes('сберег') || msg.includes('накопить') || msg.includes('экономия')) {
    const tips = [
      '☕ Кофе с собой вместо кафе экономит ~3 000 ₽ в месяц',
      '🛒 Список покупок перед магазином снижает импульсные траты на 20%',
      '📱 Проверь подписки — часто платим за то, чем не пользуемся',
      '🏷️ Покупай продукты по акциям и используй кэшбэк карты',
      '🚇 Проездной вместо разовых билетов экономит до 30%',
    ];
    const rate = summary.savingsRate;
    const rateComment = rate >= 20
      ? `✅ Отлично! Ты сберегаешь ${rate}% дохода — это выше нормы.`
      : rate > 0
      ? `⚠️ Сейчас ты сберегаешь ${rate}% дохода. Цель — минимум 20%.`
      : `❗ В этом месяце расходы превышают доходы. Давай разберёмся!`;

    const randomTips = tips.sort(() => Math.random() - 0.5).slice(0, 3).join('\n');
    return `${rateComment}\n\n💡 **Советы по экономии:**\n${randomTips}`;
  }

  // Monthly analysis
  if (msg.includes('месяц') || msg.includes('анализ') || msg.includes('итог') || msg.includes('статистик')) {
    if (summary.income === 0 && summary.expenses === 0) {
      return '📅 В этом месяце пока нет операций. Начни добавлять доходы и расходы, чтобы я мог сделать анализ!';
    }
    const balance = summary.savings;
    const emoji = balance >= 0 ? '✅' : '❌';
    return `📅 **Анализ за текущий месяц:**\n\n💚 Доходы: ${fmt(summary.income)}\n❤️ Расходы: ${fmt(summary.expenses)}\n${emoji} Баланс: ${fmt(balance)}\n💾 Норма сбережений: ${summary.savingsRate}%\n\n${
      balance >= 0
        ? `Молодец! Ты в плюсе на ${fmt(balance)}. ${summary.savingsRate >= 20 ? 'Отличный результат!' : 'Попробуй довести норму сбережений до 20%.'}`
        : `Расходы превышают доходы на ${fmt(Math.abs(balance))}. Посмотри, где можно сократить траты.`
    }`;
  }

  // Goals
  if (msg.includes('цел') || msg.includes('накопл') || msg.includes('мечт')) {
    if (goals.length === 0) {
      return '🎯 У тебя пока нет финансовых целей. Перейди в раздел "Цели" и создай первую — это мотивирует откладывать деньги!';
    }
    const activeGoals = goals.filter((g) => g.currentAmount < g.targetAmount);
    if (activeGoals.length === 0) {
      return '🎉 Все твои цели достигнуты! Поставь новые — это поможет продолжать копить.';
    }
    const nearest = activeGoals.sort((a, b) => {
      const pa = a.targetAmount > 0 ? a.currentAmount / a.targetAmount : 0;
      const pb = b.targetAmount > 0 ? b.currentAmount / b.targetAmount : 0;
      return pb - pa;
    })[0];
    if (!nearest) return '🎯 Создай финансовую цель в разделе "Цели"!';
    const progress = Math.round((nearest.currentAmount / nearest.targetAmount) * 100);
    const remaining = nearest.targetAmount - nearest.currentAmount;
    return `🎯 **Ближайшая цель: ${nearest.icon} ${nearest.name}**\n\nПрогресс: ${progress}%\nОсталось накопить: ${fmt(remaining)}\n\n💡 Если откладывать ${fmt(Math.ceil(remaining / 6))} в месяц, достигнешь цели за 6 месяцев!`;
  }

  // Budget
  if (msg.includes('бюджет') || msg.includes('лимит') || msg.includes('план')) {
    return `📋 **Советы по бюджетированию:**\n\n🔢 Правило 50/30/20:\n• 50% — обязательные расходы (жильё, еда, транспорт)\n• 30% — желания (развлечения, кафе, покупки)\n• 20% — сбережения и инвестиции\n\n${
      summary.income > 0
        ? `При твоём доходе ${fmt(summary.income)}:\n• Обязательные: ${fmt(summary.income * 0.5)}\n• Желания: ${fmt(summary.income * 0.3)}\n• Сбережения: ${fmt(summary.income * 0.2)}`
        : 'Добавь доходы, чтобы я рассчитал твой персональный бюджет!'
    }`;
  }

  // Investment
  if (msg.includes('инвест') || msg.includes('вклад') || msg.includes('акци') || msg.includes('облигац')) {
    return `📈 **Базовые принципы инвестирования:**\n\n1. 🏦 Сначала создай подушку безопасности — 3-6 месячных расходов\n2. 📊 ОФЗ и вклады — для начинающих (низкий риск)\n3. 📱 Индексные фонды (ETF) — для долгосрочных целей\n4. ⚠️ Не инвестируй деньги, которые могут понадобиться в ближайший год\n\n💡 Начни с малого — даже 1 000 ₽ в месяц через 10 лет превратятся в значительную сумму!`;
  }

  // Greeting
  if (msg.includes('привет') || msg.includes('здравствуй') || msg.includes('добрый') || msg.includes('хай')) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
    return `${greeting}! 🦉 Я твой финансовый советник FinWise.\n\nЧем могу помочь?\n• 📊 Анализ расходов\n• 💡 Советы по экономии\n• 🎯 Помощь с целями\n• 📅 Итоги месяца\n• 📋 Планирование бюджета`;
  }

  // Help
  if (msg.includes('помог') || msg.includes('что умеешь') || msg.includes('что можешь') || msg.includes('команд')) {
    return `🦉 **Я умею:**\n\n📊 Анализировать твои расходы\n💡 Давать советы по экономии\n🎯 Помогать с финансовыми целями\n📅 Делать итоги за месяц\n📋 Планировать бюджет по правилу 50/30/20\n📈 Рассказывать об инвестициях\n\nПросто напиши вопрос своими словами!`;
  }

  // Default contextual response
  const hasData = transactions.length > 0;
  if (!hasData) {
    return `🦉 Привет! Я готов помочь с твоими финансами.\n\nПока у тебя нет данных — добавь первую операцию через кнопку "+" и я смогу делать персональный анализ!\n\nМогу рассказать про:\n• Советы по экономии\n• Правила бюджетирования\n• Основы инвестирования`;
  }

  return `🦉 Понял твой вопрос! Вот что я могу сказать:\n\nЗа этот месяц ты потратил ${fmt(summary.expenses)} при доходах ${fmt(summary.income)}.\n\n${
    summary.savingsRate >= 20
      ? `✅ Норма сбережений ${summary.savingsRate}% — отличный результат!`
      : `💡 Попробуй увеличить норму сбережений до 20% — сейчас ${summary.savingsRate}%.`
  }\n\nЗадай более конкретный вопрос, например: "Где я трачу больше всего?" или "Как сэкономить?"`;
}
