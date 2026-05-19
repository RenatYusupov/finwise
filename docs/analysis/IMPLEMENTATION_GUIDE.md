# Документация по внедрению улучшенного алгоритма "можно потратить сегодня"

## Обзор

Этот документ описывает улучшенный алгоритм вычисления дневного бюджета на основе исторических данных пользователя. Алгоритм устойчив к выбросам, персонализирован и даёт реалистичные оценки.

---

## Архитектура алгоритма

### Входные данные
```typescript
interface SpendingProfileInput {
  transactions: Transaction[];  // Все транзакции пользователя
  currentDate?: Date;           // Текущая дата (по умолчанию сегодня)
}
```

### Выходные данные
```typescript
interface SpendingProfileOutput {
  // Бюджет
  budget: number;                    // Бюджет на месяц (медиана исторических доходов)
  thisMonthIncome: number;           // Доход за текущий месяц
  
  // Расходы
  alreadySpent: number;              // Уже потрачено в этом месяце
  fixedMonthly: number;              // Постоянные расходы (медиана)
  fixedExpensesBreakdown: Record<string, number>;  // Разбивка по категориям
  
  // Остаток
  remaining: number;                // Остаток на месяц
  safeToday: number;                 // Можно потратить сегодня
  safeRestOfMonth: number;           // Можно до конца месяца
  
  // Метаданные
  daysLeft: number;                 // Дней до конца месяца
  dayOfWeek: string;                // День недели
  dayMultiplier: number;            // Множитель дня недели
  
  // Состояние
  isOverspent: boolean;             // Перерасход?
  overspentAmount: number;          // Сумма перерасхода
  
  // Отладочная информация
  monthlyIncomesRaw: number[];      // Сырые доходы за N месяцев
  monthlyIncomesFiltered: number[]; // Отфильтрованные доходы
}
```

---

## Алгоритм (пошагово)

### Шаг 1: Получение исторических доходов
```typescript
function getMonthlyIncomes(
  transactions: Transaction[],
  months: number = 6
): number[] {
  const end = new Date();
  const incomes: number[] = [];
  
  for (let i = 0; i < months; i++) {
    const monthStart = new Date(end.getFullYear(), end.getMonth() - i - 1, 1);
    const monthEnd = new Date(end.getFullYear(), end.getMonth() - i, 0);
    
    const monthIncome = transactions
      .filter(t => 
        t.type === 'income' &&
        t.date >= monthStart.toISOString() &&
        t.date <= monthEnd.toISOString()
      )
      .reduce((sum, t) => sum + t.amount, 0);
    
    if (monthIncome > 0) {
      incomes.push(monthIncome);
    }
  }
  
  return incomes;
}
```

### Шаг 2: Фильтрация выбросов (IQR метод)
```typescript
function filterOutliersIQR(
  values: number[],
  multiplier: number = 2.0
): number[] {
  if (values.length < 4) return values;
  
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  
  const lowerBound = q1 - multiplier * iqr;
  const upperBound = q3 + multiplier * iqr;
  
  return values.filter(v => v >= lowerBound && v <= upperBound);
}
```

### Шаг 3: Вычисление бюджета
```typescript
function computeBudget(
  monthlyIncomes: number[],
  outlierMultiplier: number = 2.0
): number {
  const filtered = filterOutliersIQR(monthlyIncomes, outlierMultiplier);
  
  if (filtered.length === 0) return 0;
  
  // Медиана
  const sorted = [...filtered].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
```

### Шаг 4: Обнаружение постоянных расходов
```typescript
function detectFixedExpenses(
  transactions: Transaction[],
  months: number = 3,
  varianceThreshold: number = 0.40
): Record<string, number> {
  const expenses = transactions.filter(t => t.type === 'expense');
  const end = new Date();
  const fixedExpenses: Record<string, number> = {};
  
  // Группируем по категориям
  const categoryGroups = new Map<string, number[]>();
  
  for (let i = 0; i < months; i++) {
    const monthStart = new Date(end.getFullYear(), end.getMonth() - i - 1, 1);
    const monthEnd = new Date(end.getFullYear(), end.getMonth() - i, 0);
    
    expenses
      .filter(t => 
        t.date >= monthStart.toISOString() &&
        t.date <= monthEnd.toISOString()
      )
      .forEach(t => {
        if (!categoryGroups.has(t.categoryId)) {
          categoryGroups.set(t.categoryId, []);
        }
        categoryGroups.get(t.categoryId)!.push(t.amount);
      });
  }
  
  // Анализируем каждую категорию
  categoryGroups.forEach((amounts, categoryId) => {
    const nonZero = amounts.filter(a => a > 0);
    
    // Категория должна присутствовать хотя бы в 2 из 3 месяцев
    if (nonZero.length < 2) return;
    
    // Проверяем дисперсию
    const avg = nonZero.reduce((s, a) => s + a, 0) / nonZero.length;
    const std = Math.sqrt(
      nonZero.reduce((s, a) => s + Math.pow(a - avg, 2), 0) / nonZero.length
    );
    
    if (avg > 0 && (std / avg) <= varianceThreshold) {
      // Постоянный расход — используем медиану
      const sorted = [...nonZero].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      fixedExpenses[categoryId] = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    }
  });
  
  return fixedExpenses;
}
```

### Шаг 5: Множители дней недели
```typescript
const DAY_OF_WEEK_MULTIPLIERS: Record<string, number> = {
  'Sunday': 1.3,      // Самый дорогой день
  'Monday': 1.1,
  'Tuesday': 1.15,
  'Wednesday': 0.9,   // Самый дешёвый день
  'Thursday': 1.0,
  'Friday': 1.0,
  'Saturday': 1.0,
};

function getDayOfWeekMultiplier(date: Date): number {
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  return DAY_OF_WEEK_MULTIPLIERS[dayName] || 1.0;
}
```

### Шаг 6: Основная функция
```typescript
function computeSpendingProfileImproved(
  transactions: Transaction[],
  currentDate: Date = new Date()
): SpendingProfileOutput {
  // Параметры
  const MONTHS_FOR_BUDGET = 6;
  const OUTLIER_MULTIPLIER = 2.0;
  const VARIANCE_THRESHOLD = 0.40;
  
  // 1. Получаем доходы за последние N месяцев
  const monthlyIncomes = getMonthlyIncomes(transactions, MONTHS_FOR_BUDGET);
  
  // 2. Фильтруем выбросы
  const monthlyIncomesFiltered = filterOutliersIQR(
    monthlyIncomes,
    OUTLIER_MULTIPLIER
  );
  
  // 3. Вычисляем бюджет
  const budget = computeBudget(monthlyIncomesFiltered, OUTLIER_MULTIPLIER);
  
  // 4. Уже потрачено в этом месяце
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const alreadySpent = transactions
    .filter(t =>
      t.type === 'expense' &&
      t.date >= monthStart.toISOString() &&
      t.date <= currentDate.toISOString()
    )
    .reduce((sum, t) => sum + t.amount, 0);
  
  // 5. Постоянные расходы
  const fixedExpenses = detectFixedExpenses(
    transactions,
    3,
    VARIANCE_THRESHOLD
  );
  const fixedMonthly = Object.values(fixedExpenses).reduce((s, v) => s + v, 0);
  
  // 6. Остаток
  const remaining = Math.max(0, budget - alreadySpent);
  
  // 7. Множитель дня недели
  const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
  const dayMultiplier = getDayOfWeekMultiplier(currentDate);
  
  // 8. Можно потратить сегодня
  const daysInMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0
  ).getDate();
  const daysLeft = Math.max(1, daysInMonth - currentDate.getDate());
  const safeToday = remaining > 0
    ? (remaining / daysLeft) * dayMultiplier
    : 0;
  
  // 9. Проверка на перерасход
  const isOverspent = alreadySpent > budget && budget > 0;
  const overspentAmount = isOverspent ? alreadySpent - budget : 0;
  
  // 10. Доход за текущий месяц
  const thisMonthIncome = transactions
    .filter(t =>
      t.type === 'income' &&
      t.date >= monthStart.toISOString() &&
      t.date <= currentDate.toISOString()
    )
    .reduce((sum, t) => sum + t.amount, 0);
  
  return {
    budget,
    thisMonthIncome,
    alreadySpent,
    fixedMonthly,
    fixedExpensesBreakdown: fixedExpenses,
    remaining,
    safeToday,
    safeRestOfMonth: remaining,
    daysLeft,
    dayOfWeek,
    dayMultiplier,
    isOverspent,
    overspentAmount,
    monthlyIncomesRaw: monthlyIncomes,
    monthlyIncomesFiltered,
  };
}
```

---

## Параметры алгоритма

### Конфигурация по умолчанию
```typescript
const DEFAULT_CONFIG = {
  // Количество месяцев для анализа бюджета
  monthsForBudget: 6,
  
  // Множитель для IQR фильтрации (1.5 = стандартный, 2.0 = умеренный, 3.0 = агрессивный)
  outlierMultiplier: 2.0,
  
  // Порог дисперсии для постоянных расходов (0.40 = 40%)
  varianceThreshold: 0.40,
  
  // Множители дней недели
  dayOfWeekMultipliers: {
    'Sunday': 1.3,
    'Monday': 1.1,
    'Tuesday': 1.15,
    'Wednesday': 0.9,
    'Thursday': 1.0,
    'Friday': 1.0,
    'Saturday': 1.0,
  },
};
```

### Рекомендации по настройке

| Параметр | Консервативный | Умеренный | Агрессивный |
|----------|----------------|-----------|-------------|
| `monthsForBudget` | 12 | 6 | 3 |
| `outlierMultiplier` | 1.5 | 2.0 | 3.0 |
| `varianceThreshold` | 0.30 | 0.40 | 0.50 |

---

## Интеграция в DashboardPage.tsx

### Замена существующей функции
```typescript
// В DashboardPage.tsx

// Удаляем старую функцию computeSpendingProfile()
// Добавляем новую computeSpendingProfileImproved()

function computeSpendingProfileImproved(
  transactions: Transaction[]
): SpendingProfileOutput {
  // ... код из раздела "Шаг 6: Основная функция"
}
```

### Обновление SafeToSpendCard
```typescript
function SafeToSpendCard({ transactions }: { transactions: Transaction[] }) {
  const profile = useMemo(
    () => computeSpendingProfileImproved(transactions),
    [transactions]
  );

  if (!profile || profile.budget === 0) {
    return null; // Или fallback UI
  }

  const statusText = profile.isOverspent
    ? '🚨 Бюджет превышен в этом месяце'
    : profile.isOnTrack
    ? '✅ Ты в рамках бюджета'
    : '⚠️ Немного превышаешь план';

  const statusColor = profile.isOverspent
    ? '#FCA5A5'
    : profile.isOnTrack
    ? '#86EFAC'
    : '#FDE68A';

  const cardBg = profile.isOverspent
    ? 'linear-gradient(135deg, #7F1D1D 0%, #991B1B 100%)'
    : 'linear-gradient(135deg, #6C63FF 0%, #9B59B6 100%)';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-2xl overflow-hidden insight-pulse"
      style={{ background: cardBg }}
    >
      {/* Основная строка */}
      <div className="flex items-start justify-between p-4 pb-3">
        <div>
          <div className="text-purple-200 text-xs font-medium mb-1">
            💡 Можно потратить сегодня
          </div>
          <div className="text-white text-3xl font-bold">
            {formatCurrency(profile.safeToday)}
          </div>
          <div className="text-xs mt-1" style={{ color: statusColor }}>
            {statusText}
          </div>
          {profile.dayMultiplier !== 1.0 && (
            <div className="text-purple-300 text-xs mt-1">
              📊 {profile.dayOfWeek} (×{profile.dayMultiplier})
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-purple-200 text-xs mb-1">
            {profile.isOverspent ? 'Перерасход' : 'До конца месяца'}
          </div>
          <div className="text-white font-bold text-lg">
            {profile.isOverspent
              ? formatCurrency(profile.overspentAmount)
              : formatCurrency(profile.safeRestOfMonth)}
          </div>
          <div className="text-purple-200 text-xs">
            {profile.daysLeft} дн.
          </div>
        </div>
      </div>

      {/* Разбивка: доход / постоянные / условно-пост. */}
      <div className="flex gap-px bg-white/10 border-t border-white/10">
        <div className="flex-1 px-3 py-2 text-center">
          <div className="text-purple-300 text-xs mb-0.5">Доход</div>
          <div className="text-white text-xs font-semibold">
            {formatCurrency(profile.budget)}
          </div>
        </div>
        <div className="flex-1 px-3 py-2 text-center border-l border-white/10">
          <div className="text-purple-300 text-xs mb-0.5">Постоянные</div>
          <div className="text-white text-xs font-semibold">
            {formatCurrency(profile.fixedMonthly)}
          </div>
        </div>
        <div className="flex-1 px-3 py-2 text-center border-l border-white/10">
          <div className="text-purple-300 text-xs mb-0.5">Условно-пост.</div>
          <div className="text-white text-xs font-semibold">
            {formatCurrency(profile.alreadySpent - profile.fixedMonthly)}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
```

---

## Тестирование

### Unit тесты
```typescript
describe('computeSpendingProfileImproved', () => {
  it('should filter outliers correctly', () => {
    const incomes = [10000, 12000, 11000, 500000, 9000];
    const filtered = filterOutliersIQR(incomes, 2.0);
    expect(filtered).not.toContain(500000);
  });

  it('should detect fixed expenses', () => {
    const transactions = [
      // 3 месяца с похожими расходами на "home"
      { type: 'expense', categoryId: 'home', amount: 10000, date: '2026-01-15' },
      { type: 'expense', categoryId: 'home', amount: 10500, date: '2026-02-15' },
      { type: 'expense', categoryId: 'home', amount: 9500, date: '2026-03-15' },
    ];
    
    const fixed = detectFixedExpenses(transactions, 3, 0.40);
    expect(fixed['home']).toBeCloseTo(10000, 100);
  });

  it('should apply day of week multiplier', () => {
    const sunday = new Date(2026, 4, 17); // Sunday
    const wednesday = new Date(2026, 4, 20); // Wednesday
    
    const multSun = getDayOfWeekMultiplier(sunday);
    const multWed = getDayOfWeekMultiplier(wednesday);
    
    expect(multSun).toBeGreaterThan(multWed);
  });
});
```

### Интеграционные тесты
```typescript
describe('SafeToSpendCard integration', () => {
  it('should display correct values', () => {
    const transactions = [
      // Доходы
      { type: 'income', amount: 50000, date: '2026-05-01' },
      // Расходы
      { type: 'expense', amount: 10000, date: '2026-05-05' },
    ];
    
    const profile = computeSpendingProfileImproved(transactions);
    
    expect(profile.budget).toBeGreaterThan(0);
    expect(profile.safeToday).toBeGreaterThan(0);
    expect(profile.remaining).toBeGreaterThan(0);
  });
});
```

---

## Мониторинг и аналитика

### Метрики для отслеживания
```typescript
interface AnalyticsMetrics {
  // Использование алгоритма
  algorithmUsageCount: number;
  
  // Пользовательская удовлетворённость
  userSatisfactionScore: number;  // 1-5
  
  // Точность предсказаний
  predictionAccuracy: number;     // % совпадения с реальными тратами
  
  // Частота перерасхода
  overspendRate: number;          // % месяцев с перерасходом
  
  // Эффективность фильтрации
  outliersFilteredCount: number;
  outliersFilteredPercentage: number;
}
```

### A/B тестирование
```typescript
// Группа A: старый алгоритм
// Группа B: новый алгоритм

const AB_TEST_CONFIG = {
  groupA: {
    algorithm: 'legacy',
    sampleSize: 1000,
    duration: '30 days',
  },
  groupB: {
    algorithm: 'improved',
    sampleSize: 1000,
    duration: '30 days',
  },
};
```

---

## Обратная связь от пользователей

### Сбор обратной связи
```typescript
interface UserFeedback {
  userId: string;
  date: Date;
  rating: number;           // 1-5
  comment?: string;
  suggestedBudget?: number; // Пользовательский бюджет
  isHelpful: boolean;
}
```

### Вопросы для опроса
1. Насколько точен дневной бюджет? (1-5)
2. Помогает ли алгоритм контролировать расходы? (Да/Нет)
3. Хотели бы вы настроить бюджет вручную? (Да/Нет)
4. Какие категории расходов не учитываются?

---

## Будущие улучшения

### Краткосрочные (1-3 месяца)
- [ ] Добавить пользовательские настройки бюджета
- [ ] Улучшить обнаружение постоянных расходов
- [ ] Добавить объяснение множителя дня недели

### Среднесрочные (3-6 месяцев)
- [ ] Машинное обучение для персонализации
- [ ] Учёт сезонности (праздники, отпуска)
- [ ] Интеграция с целями и сбережениями

### Долгосрочные (6-12 месяцев)
- [ ] Прогнозирование на основе временных рядов
- [ ] Рекомендации по оптимизации расходов
- [ ] Интеграция с банковскими API

---

## Заключение

Улучшенный алгоритм предоставляет:
- ✅ **Реалистичные оценки** дневного бюджета
- ✅ **Устойчивость к выбросам** в доходах
- ✅ **Персонализацию** на основе истории пользователя
- ✅ **Прозрачность** вычислений
- ✅ **Гибкость** настройки параметров

Рекомендуется внедрить алгоритм с параметрами по умолчанию и собрать обратную связь от пользователей для дальнейшей оптимизации.
