/**
 * PostImportWizard — 4-step wizard shown after bank statement import.
 *
 * Step 1: Category clarification  (existing ClarifyCategoryStep, re-used here)
 * Step 2: Income review            — confirm detected salary budget
 * Step 3: Recurring payments       — confirm / dismiss auto-detected mandatory payments
 * Step 4: Historical spending      — 3-month category breakdown (no "other")
 * Step 5: Budget setup             — propose per-category limits, user edits & saves
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useFinanceStore,
  EXPENSE_CATEGORIES,
  detectRecurringPayments,
  type Transaction,
  type RecurringPayment,
} from '@/features/finance/store';
import { formatCurrency } from '@/shared/utils/format';

// ─── Shared helpers ────────────────────────────────────────────────────────────

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2 : (s[m] ?? 0);
}

function iqrFilter(sorted: number[]): number[] {
  if (sorted.length < 4) return sorted;
  const q1 = sorted[Math.floor(sorted.length / 4)]!;
  const q3 = sorted[Math.floor((3 * sorted.length) / 4)]!;
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const result = sorted.filter((v) => v >= lo && v <= hi);
  return result.length > 0 ? result : sorted;
}

function classifyPlatvedDay(description: string): 'MAIN' | 'ADVANCE' | 'EXTRA' {
  const m = description.match(/от\s+(\d{2})\.(\d{2})\.(\d{4})/i);
  if (!m) return 'MAIN';
  const day = parseInt(m[1]!, 10);
  if (day >= 1 && day <= 10) return 'MAIN';
  if (day >= 15 && day <= 25) return 'ADVANCE';
  return 'EXTRA';
}

function computeSalaryBudget(transactions: Transaction[]): number {
  const salaryTxs = transactions.filter(
    (t) => t.type === 'income' && t.categoryId === 'salary',
  );
  if (salaryTxs.length === 0) return 0;
  const budgetTxs = salaryTxs.filter((t) => {
    const isPlatved = /плат\.вед\./i.test(t.description);
    if (!isPlatved) return true;
    return classifyPlatvedDay(t.description) !== 'EXTRA';
  });
  if (budgetTxs.length === 0) return 0;
  const byMonth = new Map<string, number>();
  for (const tx of budgetTxs) {
    const d = new Date(tx.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + tx.amount);
  }
  const amounts = Array.from(byMonth.values()).sort((a, b) => a - b);
  return Math.round(median(iqrFilter(amounts)));
}

// ─── Step progress bar ─────────────────────────────────────────────────────────

function StepHeader({
  step,
  total,
  title,
  subtitle,
}: {
  step: number;
  total: number;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400 font-medium">Шаг {step} из {total}</span>
        <span className="text-xs font-semibold text-purple-500">{Math.round((step / total) * 100)}%</span>
      </div>
      <div className="flex gap-1 mb-4">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ background: i < step ? '#6C63FF' : '#E5E7EB' }}
          />
        ))}
      </div>
      <h2 className="text-lg font-bold text-gray-900 leading-tight">{title}</h2>
      {subtitle && <p className="text-sm text-gray-400 mt-0.5 leading-snug">{subtitle}</p>}
    </div>
  );
}

// ─── Step 1: Category clarification ───────────────────────────────────────────

const CLARIFY_EXPENSE_CATS = [
  { id: 'food', icon: '🍔', name: 'Еда' },
  { id: 'cafe', icon: '☕', name: 'Кафе' },
  { id: 'transport', icon: '🚗', name: 'Транспорт' },
  { id: 'shopping', icon: '🛍️', name: 'Покупки' },
  { id: 'health', icon: '💊', name: 'Здоровье' },
  { id: 'entertainment', icon: '🎮', name: 'Развлечения' },
  { id: 'sport', icon: '🏋️', name: 'Спорт' },
  { id: 'beauty', icon: '💄', name: 'Красота' },
  { id: 'home', icon: '🏠', name: 'Дом' },
  { id: 'education', icon: '📚', name: 'Учёба' },
  { id: 'travel', icon: '✈️', name: 'Путешествия' },
  { id: 'other_exp', icon: '💸', name: 'Другое' },
];

const CLARIFY_INCOME_CATS = [
  { id: 'salary', icon: '💼', name: 'Зарплата' },
  { id: 'freelance', icon: '💻', name: 'Фриланс' },
  { id: 'gift', icon: '🎁', name: 'Подарок' },
  { id: 'investment', icon: '📈', name: 'Инвестиции' },
  { id: 'cashback', icon: '💳', name: 'Кэшбэк' },
  { id: 'other_inc', icon: '💰', name: 'Другое' },
];

function StepClarify({
  txIds,
  totalSteps,
  onDone,
}: {
  txIds: string[];
  totalSteps: number;
  onDone: () => void;
}) {
  const { transactions, updateTransaction } = useFinanceStore();
  const [index, setIndex] = useState(0);

  const queue = txIds
    .map((id) => transactions.find((t) => t.id === id))
    .filter(Boolean) as Transaction[];

  if (queue.length === 0 || index >= queue.length) {
    setTimeout(onDone, 0);
    return null;
  }

  const tx = queue[index]!;
  const cats = tx.type === 'income' ? CLARIFY_INCOME_CATS : CLARIFY_EXPENSE_CATS;
  const progress = index + 1;
  const total = queue.length;

  const pick = (categoryId: string) => {
    updateTransaction(tx.id, { categoryId });
    if (index + 1 >= queue.length) onDone();
    else setIndex((i) => i + 1);
  };

  const skip = () => {
    if (index + 1 >= queue.length) onDone();
    else setIndex((i) => i + 1);
  };

  const date = new Date(tx.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const amountStr = tx.amount.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽';

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={tx.id}
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -40 }}
        transition={{ duration: 0.22 }}
      >
        <StepHeader
          step={1}
          total={totalSteps}
          title="Уточните категории"
          subtitle={`${progress} из ${total} транзакций`}
        />

        <div
          className="rounded-2xl p-4 mb-5"
          style={{ background: 'linear-gradient(135deg, #F0EEFF, #E8E4FF)' }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-800 text-sm leading-snug truncate">
                {tx.description || 'Без описания'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{date}</div>
            </div>
            <div
              className="text-lg font-bold flex-shrink-0"
              style={{ color: tx.type === 'income' ? '#10B981' : '#EF4444' }}
            >
              {tx.type === 'income' ? '+' : '−'}{amountStr}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {cats.map((cat) => (
            <motion.button
              key={cat.id}
              whileTap={{ scale: 0.93 }}
              onClick={() => pick(cat.id)}
              className="flex flex-col items-center gap-1 py-3 rounded-2xl text-center haptic"
              style={{
                background: tx.categoryId === cat.id ? '#6C63FF' : '#F3F4F6',
                color: tx.categoryId === cat.id ? '#fff' : '#374151',
              }}
            >
              <span className="text-xl leading-none">{cat.icon}</span>
              <span className="text-xs font-medium leading-tight">{cat.name}</span>
            </motion.button>
          ))}
        </div>

        <button onClick={skip} className="w-full py-2 text-xs text-gray-400 haptic">
          Пропустить →
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Step 2: Income review ─────────────────────────────────────────────────────

function StepIncome({
  totalSteps,
  onDone,
}: {
  totalSteps: number;
  onDone: () => void;
}) {
  const { transactions } = useFinanceStore();

  const salaryBudget = useMemo(() => computeSalaryBudget(transactions), [transactions]);

  // Monthly salary breakdown: last 6 months
  const monthlyBreakdown = useMemo(() => {
    const salaryTxs = transactions.filter(
      (t) => t.type === 'income' && t.categoryId === 'salary',
    );
    const byMonth = new Map<string, number>();
    for (const tx of salaryTxs) {
      const d = new Date(tx.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + tx.amount);
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6)
      .map(([month, amount]) => {
        const [year, mon] = month.split('-');
        const d = new Date(parseInt(year!), parseInt(mon!) - 1, 1);
        const label = d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
        return { label, amount };
      });
  }, [transactions]);

  const maxAmount = Math.max(...monthlyBreakdown.map((m) => m.amount), 1);

  if (salaryBudget === 0) {
    // No salary detected — skip this step
    setTimeout(onDone, 0);
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.22 }}
    >
      <StepHeader
        step={2}
        total={totalSteps}
        title="Ваш доход"
        subtitle="Мы рассчитали бюджет на основе истории зарплат"
      />

      {/* Salary budget card */}
      <div
        className="rounded-2xl p-4 mb-4 text-white"
        style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #9B59B6 100%)' }}
      >
        <div className="text-purple-200 text-xs font-medium mb-1">💼 Ежемесячный бюджет</div>
        <div className="text-3xl font-bold mb-1">{formatCurrency(salaryBudget)}</div>
        <div className="text-purple-200 text-xs">
          Медиана зарплатных поступлений с IQR-фильтром аномалий
        </div>
      </div>

      {/* Monthly chart */}
      {monthlyBreakdown.length > 0 && (
        <div className="bg-white rounded-2xl p-4 mb-4" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="text-xs font-bold text-gray-700 mb-3">📊 По месяцам</div>
          <div className="space-y-2">
            {monthlyBreakdown.map(({ label, amount }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="text-xs text-gray-400 w-12 flex-shrink-0">{label}</div>
                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(amount / maxAmount) * 100}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="h-2 rounded-full"
                    style={{ background: 'linear-gradient(90deg, #6C63FF, #9B59B6)' }}
                  />
                </div>
                <div className="text-xs font-semibold text-gray-700 w-20 text-right flex-shrink-0">
                  {formatCurrency(amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        className="rounded-2xl p-3 mb-5 text-xs text-blue-700 leading-relaxed"
        style={{ background: '#EFF6FF', border: '1px solid rgba(59,130,246,0.2)' }}
      >
        💡 Бюджет рассчитан по дате <strong>получения</strong> зарплаты, а не начисления.
        Нерегулярные выплаты (задолженности, бонусы) исключены.
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onDone}
        className="w-full py-3.5 text-white rounded-2xl font-bold text-sm haptic"
        style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)' }}
      >
        Понятно, продолжить →
      </motion.button>
    </motion.div>
  );
}

// ─── Step 3: Recurring payments ────────────────────────────────────────────────

function StepRecurring({
  totalSteps,
  onDone,
}: {
  totalSteps: number;
  onDone: () => void;
}) {
  const { transactions, recurringPayments, addRecurringPayment, updateRecurringPayment, runDetectRecurringPayments } =
    useFinanceStore();

  // Run detection once on mount
  const [detected] = useState<RecurringPayment[]>(() => {
    const candidates = detectRecurringPayments(transactions, recurringPayments);
    return candidates;
  });

  const [decisions, setDecisions] = useState<Record<string, 'confirm' | 'dismiss' | null>>(
    () => Object.fromEntries(detected.map((p) => [p.id, null])),
  );

  const allDecided = detected.length === 0 || Object.values(decisions).every((d) => d !== null);

  const toggle = (id: string, decision: 'confirm' | 'dismiss') => {
    setDecisions((prev) => ({
      ...prev,
      [id]: prev[id] === decision ? null : decision,
    }));
  };

  const handleDone = () => {
    // Add confirmed candidates to store
    for (const p of detected) {
      const decision = decisions[p.id];
      if (decision === 'confirm') {
        const entry: Omit<RecurringPayment, 'id' | 'createdAt'> = {
          label: p.label,
          amountMedian: p.amountMedian,
          dayOfMonth: p.dayOfMonth,
          source: 'auto',
          confidence: p.confidence,
          confirmedByUser: true,
          dismissedByUser: false,
        };
        if (p.lastSeenAt) entry.lastSeenAt = p.lastSeenAt;
        addRecurringPayment(entry);
      } else if (decision === 'dismiss') {
        const entry: Omit<RecurringPayment, 'id' | 'createdAt'> = {
          label: p.label,
          amountMedian: p.amountMedian,
          dayOfMonth: p.dayOfMonth,
          source: 'auto',
          confidence: p.confidence,
          confirmedByUser: false,
          dismissedByUser: true,
        };
        if (p.lastSeenAt) entry.lastSeenAt = p.lastSeenAt;
        addRecurringPayment(entry);
      }
    }
    // Also run store detection to merge any remaining
    runDetectRecurringPayments();
    onDone();
  };

  if (detected.length === 0) {
    // No candidates — skip
    setTimeout(onDone, 0);
    return null;
  }

  const confidenceLabel = (c: RecurringPayment['confidence']) =>
    c === 'high' ? '🟢 Высокая' : c === 'medium' ? '🟡 Средняя' : '🔴 Низкая';

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.22 }}
    >
      <StepHeader
        step={3}
        total={totalSteps}
        title="Регулярные платежи"
        subtitle="Мы нашли повторяющиеся списания. Отметьте обязательные — они будут зарезервированы в бюджете."
      />

      <div className="space-y-3 mb-5">
        {detected.map((p) => {
          const decision = decisions[p.id];
          return (
            <motion.div
              key={p.id}
              layout
              className="bg-white rounded-2xl p-4"
              style={{
                boxShadow: 'var(--shadow-card)',
                border: decision === 'confirm'
                  ? '2px solid #6C63FF'
                  : decision === 'dismiss'
                  ? '2px solid #E5E7EB'
                  : '2px solid transparent',
                opacity: decision === 'dismiss' ? 0.5 : 1,
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 text-sm leading-snug line-clamp-2">
                    {p.label}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">~{p.dayOfMonth}-го числа</span>
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-400">{confidenceLabel(p.confidence)}</span>
                  </div>
                </div>
                <div className="text-base font-bold text-gray-900 flex-shrink-0">
                  {formatCurrency(p.amountMedian)}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => toggle(p.id, 'confirm')}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold haptic transition-all"
                  style={{
                    background: decision === 'confirm' ? '#6C63FF' : '#F0EEFF',
                    color: decision === 'confirm' ? '#fff' : '#6C63FF',
                  }}
                >
                  ✅ Обязательный
                </button>
                <button
                  onClick={() => toggle(p.id, 'dismiss')}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold haptic transition-all"
                  style={{
                    background: decision === 'dismiss' ? '#F3F4F6' : '#F9FAFB',
                    color: decision === 'dismiss' ? '#6B7280' : '#9CA3AF',
                  }}
                >
                  ✕ Не нужен
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {!allDecided && (
        <div className="text-xs text-center text-gray-400 mb-3">
          Отметьте каждый платёж или нажмите «Пропустить»
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onDone}
          className="flex-1 py-3 rounded-2xl font-semibold text-sm haptic"
          style={{ background: '#F0EEFF', color: '#6C63FF' }}
        >
          Пропустить
        </button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleDone}
          className="flex-1 py-3 text-white rounded-2xl font-bold text-sm haptic"
          style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)' }}
        >
          Сохранить →
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Step 4: Historical spending ───────────────────────────────────────────────

interface CatSpend {
  id: string;
  icon: string;
  name: string;
  color: string;
  monthly: number; // median of last 3 months
  months: number;  // how many months it appeared
}

function computeHistoricalSpending(transactions: Transaction[]): CatSpend[] {
  const now = new Date();
  const histMonths: { start: string; end: string }[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = d.toISOString();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
    histMonths.push({ start, end });
  }

  const monthlyCatSpend: Map<string, number>[] = histMonths.map(({ start, end }) => {
    const m = new Map<string, number>();
    transactions
      .filter((t) => t.type === 'expense' && t.date >= start && t.date <= end)
      .forEach((t) => m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amount));
    return m;
  });

  const allCats = new Set<string>();
  monthlyCatSpend.forEach((m) => m.forEach((_, k) => allCats.add(k)));

  const results: CatSpend[] = [];

  for (const catId of allCats) {
    // Skip "other" categories — they're noise
    if (catId === 'other_exp' || catId === 'other_inc') continue;

    const catDef = EXPENSE_CATEGORIES.find((c) => c.id === catId);
    if (!catDef) continue;

    const monthTotals = monthlyCatSpend.map((m) => m.get(catId) ?? 0);
    const presentMonths = monthTotals.filter((v) => v > 0).length;
    if (presentMonths === 0) continue;

    const med = Math.round(median(monthTotals.filter((v) => v > 0)));
    if (med < 500) continue; // skip tiny amounts

    results.push({
      id: catId,
      icon: catDef.icon,
      name: catDef.name,
      color: catDef.color,
      monthly: med,
      months: presentMonths,
    });
  }

  return results.sort((a, b) => b.monthly - a.monthly);
}

function StepHistoricalSpending({
  totalSteps,
  onDone,
  onSpendingData,
}: {
  totalSteps: number;
  onDone: () => void;
  onSpendingData: (data: CatSpend[]) => void;
}) {
  const { transactions } = useFinanceStore();

  const spending = useMemo(() => computeHistoricalSpending(transactions), [transactions]);
  const totalMonthly = spending.reduce((s, c) => s + c.monthly, 0);
  const maxAmount = Math.max(...spending.map((c) => c.monthly), 1);

  const handleNext = () => {
    onSpendingData(spending);
    onDone();
  };

  if (spending.length === 0) {
    setTimeout(() => { onSpendingData([]); onDone(); }, 0);
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.22 }}
    >
      <StepHeader
        step={4}
        total={totalSteps}
        title="Ваши траты по категориям"
        subtitle="Медиана за последние 3 месяца"
      />

      {/* Total */}
      <div
        className="rounded-2xl p-3 mb-4 flex items-center justify-between"
        style={{ background: '#F0EEFF' }}
      >
        <span className="text-sm font-semibold text-purple-700">Итого в месяц</span>
        <span className="text-base font-bold text-purple-900">{formatCurrency(totalMonthly)}</span>
      </div>

      {/* Category bars */}
      <div className="space-y-2.5 mb-5">
        {spending.map((cat) => (
          <div key={cat.id} className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0"
              style={{ background: cat.color + '20' }}
            >
              {cat.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-700">{cat.name}</span>
                <span className="text-xs font-bold text-gray-800">{formatCurrency(cat.monthly)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(cat.monthly / maxAmount) * 100}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut', delay: 0.05 }}
                  className="h-1.5 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {cat.months === 3 ? 'Каждый месяц' : `${cat.months} из 3 мес.`}
              </div>
            </div>
          </div>
        ))}
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleNext}
        className="w-full py-3.5 text-white rounded-2xl font-bold text-sm haptic"
        style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)' }}
      >
        Сформировать бюджет →
      </motion.button>
    </motion.div>
  );
}

// ─── Step 5: Budget setup ──────────────────────────────────────────────────────

function StepBudget({
  totalSteps,
  spendingData,
  onDone,
}: {
  totalSteps: number;
  spendingData: CatSpend[];
  onDone: () => void;
}) {
  const salaryBudget = useMemo(
    () => computeSalaryBudget(useFinanceStore.getState().transactions),
    [],
  );

  // Pre-fill limits from historical spending medians
  const [limits, setLimits] = useState<Record<string, string>>(
    () => Object.fromEntries(spendingData.map((c) => [c.id, String(c.monthly)])),
  );

  const totalLimit = spendingData.reduce((s, c) => {
    const v = parseFloat(limits[c.id] ?? '0');
    return s + (isNaN(v) ? 0 : v);
  }, 0);

  const overBudget = salaryBudget > 0 && totalLimit > salaryBudget;

  const handleSave = () => {
    useFinanceStore.setState((s) => {
      const newBudgets = spendingData
        .filter((c) => {
          const v = parseFloat(limits[c.id] ?? '0');
          return !isNaN(v) && v > 0;
        })
        .map((c) => ({
          id: `budget_${c.id}_${Date.now()}`,
          categoryId: c.id,
          limit: parseFloat(limits[c.id]!),
          spent: 0,
          period: 'month' as const,
        }));
      // Keep budgets for categories not in this set
      const existingOther = s.budgets.filter(
        (b) => !spendingData.some((c) => c.id === b.categoryId),
      );
      return { budgets: [...existingOther, ...newBudgets] };
    });
    onDone();
  };

  if (spendingData.length === 0) {
    setTimeout(onDone, 0);
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.22 }}
    >
      <StepHeader
        step={totalSteps}
        total={totalSteps}
        title="Ваш бюджет по категориям"
        subtitle="Отредактируйте лимиты — мы предзаполнили их по вашей истории трат"
      />

      {/* Budget vs salary warning */}
      {salaryBudget > 0 && (
        <div
          className="rounded-2xl p-3 mb-4 flex items-center justify-between"
          style={{
            background: overBudget ? '#FFF5F5' : '#F0FFF8',
            border: `1px solid ${overBudget ? 'rgba(255,71,87,0.2)' : 'rgba(0,200,150,0.2)'}`,
          }}
        >
          <div>
            <div className="text-xs font-semibold" style={{ color: overBudget ? '#FF4757' : '#00C896' }}>
              {overBudget ? '⚠️ Лимиты превышают бюджет' : '✅ Лимиты в рамках бюджета'}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              Бюджет: {formatCurrency(salaryBudget)} / Лимиты: {formatCurrency(totalLimit)}
            </div>
          </div>
          <div
            className="text-sm font-bold"
            style={{ color: overBudget ? '#FF4757' : '#00C896' }}
          >
            {overBudget ? '+' : ''}{formatCurrency(totalLimit - salaryBudget)}
          </div>
        </div>
      )}

      {/* Editable category limits */}
      <div className="space-y-2.5 mb-5">
        {spendingData.map((cat) => (
          <div key={cat.id} className="bg-white rounded-2xl p-3.5 flex items-center gap-3" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: cat.color + '20' }}
            >
              {cat.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-gray-700 mb-1">{cat.name}</div>
              <div className="text-xs text-gray-400">
                История: {formatCurrency(cat.monthly)}/мес
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <input
                type="number"
                inputMode="numeric"
                value={limits[cat.id] ?? ''}
                onChange={(e) =>
                  setLimits((prev) => ({ ...prev, [cat.id]: e.target.value }))
                }
                className="w-24 text-right text-sm font-bold text-gray-800 rounded-xl px-2 py-1.5 border border-gray-200 focus:outline-none focus:border-purple-400"
                style={{ fontSize: '16px' /* prevent iOS zoom */ }}
                placeholder="0"
              />
              <span className="text-xs text-gray-400">₽</span>
            </div>
          </div>
        ))}
      </div>

      {/* Total */}
      <div
        className="rounded-2xl p-3 mb-5 flex items-center justify-between"
        style={{ background: '#F0EEFF' }}
      >
        <span className="text-sm font-semibold text-purple-700">Итого лимитов</span>
        <span className="text-base font-bold text-purple-900">{formatCurrency(totalLimit)}</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onDone}
          className="flex-1 py-3 rounded-2xl font-semibold text-sm haptic"
          style={{ background: '#F0EEFF', color: '#6C63FF' }}
        >
          Пропустить
        </button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSave}
          className="flex-1 py-3 text-white rounded-2xl font-bold text-sm haptic"
          style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)' }}
        >
          Сохранить бюджет ✓
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Main PostImportWizard export ──────────────────────────────────────────────

export function PostImportWizard({
  clarifyIds,
  onDone,
}: {
  clarifyIds: string[];
  onDone: () => void;
}) {
  type WizardStep = 'clarify' | 'income' | 'recurring' | 'history' | 'budget';

  const [step, setStep] = useState<WizardStep>(
    clarifyIds.length > 0 ? 'clarify' : 'income',
  );
  const [spendingData, setSpendingData] = useState<CatSpend[]>([]);

  // Total steps depends on whether there are transactions to clarify
  const TOTAL_STEPS = clarifyIds.length > 0 ? 5 : 4;

  const goTo = (next: WizardStep) => setStep(next);

  return (
    <AnimatePresence mode="wait">
      {step === 'clarify' && (
        <motion.div key="clarify">
          <StepClarify
            txIds={clarifyIds}
            totalSteps={TOTAL_STEPS}
            onDone={() => goTo('income')}
          />
        </motion.div>
      )}
      {step === 'income' && (
        <motion.div key="income">
          <StepIncome
            totalSteps={TOTAL_STEPS}
            onDone={() => goTo('recurring')}
          />
        </motion.div>
      )}
      {step === 'recurring' && (
        <motion.div key="recurring">
          <StepRecurring
            totalSteps={TOTAL_STEPS}
            onDone={() => goTo('history')}
          />
        </motion.div>
      )}
      {step === 'history' && (
        <motion.div key="history">
          <StepHistoricalSpending
            totalSteps={TOTAL_STEPS}
            onDone={() => goTo('budget')}
            onSpendingData={setSpendingData}
          />
        </motion.div>
      )}
      {step === 'budget' && (
        <motion.div key="budget">
          <StepBudget
            totalSteps={TOTAL_STEPS}
            spendingData={spendingData}
            onDone={onDone}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}