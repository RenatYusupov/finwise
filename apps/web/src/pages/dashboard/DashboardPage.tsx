import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { useFinanceStore, type Transaction, type RecurringPayment } from '@/features/finance/store';
import { useAuthStore } from '@/features/auth/store';
import { formatCurrency } from '@/shared/utils/format';
import { ProactiveAiInsightCard } from '@/features/analytics/AiInsightCard';

// ─── Spending Profile ─────────────────────────────────────────────────────────
//
// Algorithm v4 — Cash-flow salary budget with recurring payment reservation:
//
//   budget            = computeSalaryBudget(transactions)
//                       IQR-filtered median of monthly salary receipts
//                       (MAIN ~5th + ADVANCE ~20th; EXTRA outliers excluded)
//   alreadySpent      = all expense transactions this month (excludes transfers)
//   reservedUpcoming  = sum of confirmed recurring payments not yet paid this month
//                       (dayOfMonth > today AND no matching tx found this month)
//   remaining         = budget − alreadySpent − reservedUpcoming  (can be negative)
//   daysLeft          = daysInMonth − dayOfMonth + 1  (includes today)
//   daysAhead         = max(1, daysLeft − 1)          (days after today for safePerDay)
//   spentToday        = sum of expense transactions dated today
//   safePerDay        = remaining / daysAhead
//   safeToday         = safePerDay − spentToday        (can be negative)
//
// Key design decisions:
//   • Budget = IQR-median of salary PAYMENTS (cash flow), NOT thisMonthIncome.
//   • alreadySpent excludes type === 'transfer' (own-account moves are not spending).
//   • reservedUpcoming only counts payments confirmed by user OR added manually.
//   • "Already paid" check: if a tx within ±15% of the recurring amount exists
//     this month, the payment is considered settled and not reserved again.
//   • EXTRA payments (ПЛАТ.ВЕД. with non-standard dates) excluded from budget.
//   • IQR filter removes anomalous months (partial months, delayed batches).
//   • Fallback chain: salaryBudget → thisMonthIncome → hist median.
//   • remaining is NOT clamped to 0 — negative value = overspend, shown in UI.
//   • safeToday subtracts spentToday so the card updates as user adds transactions.

// Categories that are typically fixed (subscription-like)
const FIXED_CATS = new Set(['home', 'education']);
// Categories that are typically semi-fixed (recurring but variable)
const SEMI_FIXED_CATS = new Set(['food', 'transport', 'cafe', 'health', 'sport', 'beauty']);

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

// ─── Salary budget helpers ────────────────────────────────────────────────────

/**
 * Classify a ПЛАТ.ВЕД. payment by the day in "от DD.MM.YYYY":
 *   day  1-10  → 'MAIN'    (основная зарплата, ~5-го числа)
 *   day 15-25  → 'ADVANCE' (аванс, ~20-го числа)
 *   other      → 'EXTRA'   (задолженности, разовые — исключаем из бюджета)
 */
function classifyPlatvedDay(description: string): 'MAIN' | 'ADVANCE' | 'EXTRA' {
  const m = description.match(/от\s+(\d{2})\.(\d{2})\.(\d{4})/i);
  if (!m) return 'MAIN';
  const day = parseInt(m[1]!, 10);
  if (day >= 1 && day <= 10) return 'MAIN';
  if (day >= 15 && day <= 25) return 'ADVANCE';
  return 'EXTRA';
}

/** IQR outlier filter — removes values outside [Q1 − 1.5·IQR, Q3 + 1.5·IQR]. */
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

/**
 * Compute monthly salary budget from transaction history.
 *
 * Steps:
 *   1. Filter salary transactions (categoryId === 'salary')
 *   2. Exclude EXTRA ПЛАТ.ВЕД. (non-standard dates = arrears/bonuses)
 *   3. Group by calendar month of RECEIPT (cash flow basis)
 *   4. IQR-filter anomalous months
 *   5. Return median of filtered monthly totals
 *
 * Returns 0 if no salary history found (caller falls back to thisMonthIncome).
 */
function computeSalaryBudget(transactions: Transaction[]): number {
  const salaryTxs = transactions.filter(
    (t) => t.type === 'income' && t.categoryId === 'salary'
  );
  if (salaryTxs.length === 0) return 0;

  // Exclude EXTRA ПЛАТ.ВЕД. (arrears, bonuses on non-standard dates)
  const budgetTxs = salaryTxs.filter((t) => {
    const isPlatved = /плат\.вед\./i.test(t.description);
    if (!isPlatved) return true; // "Перевод начисления Зарплата/Аванс" — include
    return classifyPlatvedDay(t.description) !== 'EXTRA';
  });
  if (budgetTxs.length === 0) return 0;

  // Group by calendar month of receipt
  const byMonth = new Map<string, number>();
  for (const tx of budgetTxs) {
    const d = new Date(tx.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + tx.amount);
  }

  const amounts = Array.from(byMonth.values()).sort((a, b) => a - b);
  return median(iqrFilter(amounts));
}

interface SpendingProfile {
  budget: number;
  /** Kept as thisMonthIncome for UI compatibility — actually holds the salary budget */
  thisMonthIncome: number;
  fixedMonthly: number;
  semiFixedMonthly: number;
  alreadySpent: number;
  reservedUpcoming: number;
  /** Can be negative — negative means overspent. NOT clamped to 0. */
  remaining: number;
  /** Amount spent today (expense transactions dated today). */
  spentToday: number;
  /** Daily safe-to-spend budget = remaining / daysAhead. Can be negative. */
  safePerDay: number;
  /** safePerDay − spentToday. Updates as user adds transactions today. */
  safeToday: number;
  safeRestOfMonth: number;
  daysLeft: number;
  isOverspent: boolean;
  /** Math.abs(remaining) when remaining < 0, else 0. */
  overspentAmount: number;
  isOnTrack: boolean;
  hasEnoughHistory: boolean;
}

function computeSpendingProfile(
  transactions: Transaction[],
  recurringPayments: RecurringPayment[],
): SpendingProfile {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  // FIX-1a: daysLeft includes today (was: daysInMonth - dayOfMonth, excluded today)
  const daysLeft = daysInMonth - dayOfMonth + 1;
  // daysAhead = days remaining AFTER today — used for safePerDay so today's
  // already-spent amount is subtracted separately via spentToday.
  const daysAhead = Math.max(1, daysLeft - 1);

  // Current month boundaries
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // This month's transactions
  const thisMonthTxs = transactions.filter((t) => t.date >= thisMonthStart);
  const thisMonthIncome = thisMonthTxs
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);

  // alreadySpent: only real expenses — exclude transfers (own-account moves)
  const alreadySpent = thisMonthTxs
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);

  // Build per-month buckets for last 3 full months (for fixed/semi-fixed detection)
  const histMonths: { start: string; end: string }[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = d.toISOString();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
    histMonths.push({ start, end });
  }

  // Per-month expense totals by category
  const monthlyCatSpend: Map<string, number>[] = histMonths.map(({ start, end }) => {
    const m = new Map<string, number>();
    transactions
      .filter((t) => t.type === 'expense' && t.date >= start && t.date <= end)
      .forEach((t) => m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amount));
    return m;
  });

  const hasHistory = monthlyCatSpend.some((m) => m.size > 0);

  // Collect all categories seen in history
  const allCats = new Set<string>();
  monthlyCatSpend.forEach((m) => m.forEach((_, k) => allCats.add(k)));

  let fixedMonthly = 0;
  let semiFixedMonthly = 0;

  allCats.forEach((cat) => {
    const monthTotals = monthlyCatSpend.map((m) => m.get(cat) ?? 0);
    const presentMonths = monthTotals.filter((v) => v > 0).length;
    if (presentMonths < 2) return; // not recurring enough

    const med = median(monthTotals.filter((v) => v > 0));
    const avg = monthTotals.reduce((s, v) => s + v, 0) / histMonths.length;
    const nonZero = monthTotals.filter((v) => v > 0);
    const maxDev = nonZero.length > 1
      ? Math.max(...nonZero.map((v) => Math.abs(v - avg) / avg))
      : 0;

    if (FIXED_CATS.has(cat) || (presentMonths === 3 && maxDev < 0.20)) {
      // Appears every month with low variance → fixed
      fixedMonthly += med;
    } else if (SEMI_FIXED_CATS.has(cat) && presentMonths >= 2) {
      // Recurring but variable → semi-fixed
      semiFixedMonthly += med;
    }
  });

  // Budget = IQR-filtered median of monthly salary receipts (cash-flow basis).
  // Salary arrives irregularly — thisMonthIncome gives wildly wrong results.
  // Fallback chain: salaryBudget → thisMonthIncome → hist median
  let budget = computeSalaryBudget(transactions);
  if (budget === 0) budget = thisMonthIncome;
  if (budget === 0 && hasHistory) {
    const histIncome = histMonths.map(({ start, end }) =>
      transactions
        .filter((t) => t.type === 'income' && t.date >= start && t.date <= end)
        .reduce((s, t) => s + t.amount, 0)
    );
    budget = median(histIncome.filter((v) => v > 0));
  }

  // ── Recurring payment reservation ─────────────────────────────────────────
  // Only count payments that are:
  //   1. Confirmed by user OR manually added
  //   2. Not dismissed
  //   3. Expected later this month (dayOfMonth > today)
  //   4. Not already paid this month (no matching expense within ±15%)
  const AMOUNT_TOLERANCE = 0.15;
  const reservedUpcoming = recurringPayments
    .filter((p) => (p.confirmedByUser || p.source === 'manual') && !p.dismissedByUser)
    .filter((p) => p.dayOfMonth > dayOfMonth)
    .filter((p) => {
      // Check if already paid this month
      const alreadyPaid = thisMonthTxs.some(
        (t) =>
          t.type === 'expense' &&
          Math.abs(t.amount - p.amountMedian) / p.amountMedian <= AMOUNT_TOLERANCE,
      );
      return !alreadyPaid;
    })
    .reduce((sum, p) => sum + p.amountMedian, 0);

  // FIX-1b: Do NOT clamp to 0 — negative remaining = overspent, must be visible in UI.
  const remaining = budget - alreadySpent - reservedUpcoming;
  const safeRestOfMonth = remaining;

  // FIX-1c: Compute spentToday so safeToday updates as user adds transactions.
  const spentToday = thisMonthTxs
    .filter((t) => {
      const d = new Date(t.date);
      return (
        t.type === 'expense' &&
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    })
    .reduce((s, t) => s + t.amount, 0);

  // safePerDay = how much per remaining day (after today) is available.
  // safeToday  = safePerDay minus what's already spent today.
  const safePerDay = remaining / daysAhead;
  const safeToday = safePerDay - spentToday;

  const isOverspent = remaining < 0 && budget > 0;
  const overspentAmount = isOverspent ? Math.abs(remaining) : 0;

  // On track = daily spend rate ≤ budget/day
  const dailyBudget = budget / daysInMonth;
  const dailySpendRate = dayOfMonth > 0 ? alreadySpent / dayOfMonth : 0;
  const isOnTrack = dailySpendRate <= dailyBudget * 1.1;

  return {
    budget,
    thisMonthIncome: budget, // UI compat alias
    fixedMonthly,
    semiFixedMonthly,
    alreadySpent,
    reservedUpcoming,
    remaining,
    spentToday,
    safePerDay,
    safeToday,
    safeRestOfMonth,
    daysLeft,
    isOverspent,
    overspentAmount,
    isOnTrack,
    hasEnoughHistory: budget > 0,
  };
}

// ─── Smart Safe-to-Spend Card ─────────────────────────────────────────────────

function SafeToSpendCard({
  transactions,
  recurringPayments,
  income,
}: {
  transactions: Transaction[];
  recurringPayments: RecurringPayment[];
  income: number;
}) {
  const profile = useMemo(
    () => computeSpendingProfile(transactions, recurringPayments),
    [transactions, recurringPayments],
  );

  // Fallback to simple formula if not enough history
  if (!profile.hasEnoughHistory) {
    if (income === 0) return null;
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const daysLeft = daysInMonth - dayOfMonth;
    const dailyBudget = income / daysInMonth;
    const summary_expenses = transactions
      .filter((t) => t.type === 'expense' && t.date >= new Date(now.getFullYear(), now.getMonth(), 1).toISOString())
      .reduce((s, t) => s + t.amount, 0);
    const spentToday = summary_expenses / dayOfMonth;
    const safeToday = Math.max(0, dailyBudget - spentToday);
    const safeRestOfMonth = Math.max(0, dailyBudget * daysLeft - (summary_expenses - dailyBudget * (dayOfMonth - 1)));

    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl p-4 insight-pulse"
        style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #9B59B6 100%)' }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-purple-200 text-xs font-medium mb-1">💡 Можно потратить сегодня</div>
            <div className="text-white text-3xl font-bold">{formatCurrency(safeToday)}</div>
            <div className="text-purple-200 text-xs mt-1">
              {spentToday <= dailyBudget ? '✅ Ты в рамках бюджета' : '⚠️ Немного превышаешь план'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-purple-200 text-xs mb-1">До конца месяца</div>
            <div className="text-white font-bold text-lg">{formatCurrency(safeRestOfMonth)}</div>
            <div className="text-purple-200 text-xs">{daysLeft} дн.</div>
          </div>
        </div>
      </motion.div>
    );
  }

  const statusText = profile.isOverspent
    ? '🚨 Бюджет превышен в этом месяце'
    : profile.isOnTrack ? '✅ Ты в рамках бюджета' : '⚠️ Немного превышаешь план';
  const statusColor = profile.isOverspent ? '#FCA5A5' : profile.isOnTrack ? '#86EFAC' : '#FDE68A';
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
      {/* Main row */}
      <div className="flex items-start justify-between p-4 pb-3">
        <div>
          <div className="text-purple-200 text-xs font-medium mb-1">💡 Можно потратить сегодня</div>
          <div className="text-white text-3xl font-bold">{formatCurrency(profile.safeToday)}</div>
          <div className="text-xs mt-1" style={{ color: statusColor }}>{statusText}</div>
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
          <div className="text-purple-200 text-xs">{profile.daysLeft} дн.</div>
        </div>
      </div>

      {/* Breakdown row: budget / spent / reserved */}
      <div className="flex gap-px bg-white/10 border-t border-white/10">
        <div className="flex-1 px-3 py-2 text-center">
          <div className="text-purple-300 text-xs mb-0.5">Бюджет</div>
          <div className="text-white text-xs font-semibold">{formatCurrency(profile.budget)}</div>
        </div>
        <div className="flex-1 px-3 py-2 text-center border-l border-white/10">
          <div className="text-purple-300 text-xs mb-0.5">Потрачено</div>
          <div className="text-white text-xs font-semibold">{formatCurrency(profile.alreadySpent)}</div>
        </div>
        <div className="flex-1 px-3 py-2 text-center border-l border-white/10">
          <div className="text-purple-300 text-xs mb-0.5">
            {profile.reservedUpcoming > 0 ? '🔒 Зарезерв.' : 'Свободно'}
          </div>
          <div
            className="text-xs font-semibold"
            style={{ color: profile.reservedUpcoming > 0 ? '#FDE68A' : 'white' }}
          >
            {profile.reservedUpcoming > 0
              ? formatCurrency(profile.reservedUpcoming)
              : formatCurrency(profile.remaining)}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function AiInsightBanner({ expenses, income, navigate }: { expenses: number; income: number; navigate: (p: string) => void }) {
  const savingsRate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0;

  let insight = '🤖 Спроси меня о своих финансах — я помогу сэкономить!';
  if (income > 0 && expenses > 0) {
    if (savingsRate < 10) {
      insight = `⚠️ Ты откладываешь только ${savingsRate}% дохода. Давай найдём, где сэкономить?`;
    } else if (savingsRate >= 30) {
      insight = `🎉 Отлично! Ты откладываешь ${savingsRate}% дохода. Хочешь инвестировать?`;
    } else {
      insight = `💡 Ты откладываешь ${savingsRate}% дохода. Можно увеличить до 20%!`;
    }
  }

  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      onClick={() => navigate('/ai')}
      className="w-full text-left rounded-2xl p-4 haptic"
      style={{ background: 'linear-gradient(135deg, #F0EEFF 0%, #EDE8FF 100%)', border: '1px solid rgba(108,99,255,0.15)' }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)' }}>
          🦉
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-purple-600 mb-0.5">FinWise AI</div>
          <div className="text-sm text-gray-700 leading-snug">{insight}</div>
        </div>
        <div className="text-purple-400 text-lg flex-shrink-0">›</div>
      </div>
    </motion.button>
  );
}

function UpcomingPaymentsWidget({ navigate }: { navigate: (p: string) => void }) {
  // Only show payments that the user has explicitly confirmed (not auto-detected noise)
  // and only within the next 3 days (urgent window)
  const upcoming = useFinanceStore((s) => s.getUpcomingPayments(3));
  const confirmed = upcoming.filter((p) => p.confirmedByUser);

  if (confirmed.length === 0) return null;

  const total = confirmed.reduce((sum, p) => sum + p.amountMedian, 0);
  const visible = confirmed.slice(0, 3);
  const extra = confirmed.length - visible.length;
  const labelFor = (days: number) => days === 0 ? 'Сегодня' : days === 1 ? 'Завтра' : `через ${days} дн.`;

  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => navigate('/recurring')}
      className="w-full text-left bg-white rounded-2xl p-4 haptic"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-gray-900 text-sm">🔁 Ближайшие платежи</div>
        <div className="text-xs font-semibold text-purple-600">Все →</div>
      </div>
      <div className="space-y-2">
        {visible.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-800 truncate">{p.label}</div>
              <div className={`text-xs ${p.daysUntil === 0 ? 'text-red-500' : p.daysUntil === 1 ? 'text-orange-500' : 'text-gray-400'}`}>{labelFor(p.daysUntil)}</div>
            </div>
            <div className="text-sm font-bold text-gray-900 flex-shrink-0">{formatCurrency(p.amountMedian)}</div>
          </div>
        ))}
        {extra > 0 && <div className="text-xs text-gray-400">+{extra} ещё</div>}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
        <span className="text-gray-500">Итого в ближайшие 3 дня</span>
        <span className="font-bold text-gray-900">{formatCurrency(total)}</span>
      </div>
    </motion.button>
  );
}

export function DashboardPage() {
  const { user } = useAuthStore();
  const {
    getMonthSummary,
    getRecentTransactions,
    goals,
    streak,
    transactions,
    recurringPayments,
  } = useFinanceStore();
  const navigate = useNavigate();

  const summary = getMonthSummary();
  const recentTxs = getRecentTransactions(4);
  const activeGoals = goals.filter((g) => g.currentAmount < g.targetAmount).slice(0, 2);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';

  return (
    <div className="px-4 pt-5 pb-4 space-y-3" style={{ background: 'var(--bg-warm)' }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <div className="text-gray-400 text-sm">{greeting} 👋</div>
          <h1 className="text-xl font-bold text-gray-900">
            {user?.firstName ?? 'друг'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {streak > 1 && (
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full"
              style={{ background: 'linear-gradient(135deg, #FF6B35, #FF8C42)' }}
            >
              <span className="streak-fire">🔥</span>
              <span className="text-sm font-bold text-white">{streak}</span>
            </motion.div>
          )}
          <Link to="/profile">
            <div className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center text-lg">
              👤
            </div>
          </Link>
        </div>
      </motion.div>

      {/* Balance card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl p-5 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
      >
        {/* Decorative circles */}
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #6C63FF, transparent)' }} />
        <div className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #FF6B35, transparent)' }} />

        <div className="relative">
          <div className="text-gray-400 text-xs font-medium mb-1 uppercase tracking-wide">Баланс за месяц</div>
          <div className={`text-4xl font-bold mb-4 ${summary.savings < 0 ? 'text-red-400' : 'text-white'}`}>
            {summary.savings >= 0 ? '+' : ''}{formatCurrency(summary.savings)}
          </div>
          <div className="flex gap-4">
            <div className="flex-1 bg-white/10 rounded-xl p-2.5">
              <div className="text-gray-400 text-xs mb-0.5">↑ Доходы</div>
              <div className="font-bold text-green-400 text-sm">{formatCurrency(summary.income)}</div>
            </div>
            <div className="flex-1 bg-white/10 rounded-xl p-2.5">
              <div className="text-gray-400 text-xs mb-0.5">↓ Расходы</div>
              <div className="font-bold text-red-400 text-sm">{formatCurrency(summary.expenses)}</div>
            </div>
            <div className="flex-1 bg-white/10 rounded-xl p-2.5">
              <div className="text-gray-400 text-xs mb-0.5">💾 Сбережения</div>
              <div className="font-bold text-purple-300 text-sm">{summary.savingsRate}%</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Smart safe to spend */}
      <SafeToSpendCard
        transactions={transactions}
        recurringPayments={recurringPayments}
        income={summary.income}
      />

      {/* Proactive AI insights */}
      <ProactiveAiInsightCard transactions={transactions} />

      {/* Upcoming recurring payments */}
      <UpcomingPaymentsWidget navigate={navigate} />

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { icon: '➕', label: 'Трата', to: '/transactions/add', bg: '#FFF0EB', color: '#FF6B35' },
          { icon: '🎯', label: 'Цели', to: '/goals', bg: '#F0EEFF', color: '#6C63FF' },
          { icon: '📊', label: 'Анализ', to: '/analytics', bg: '#E8FFF5', color: '#00C896' },
          { icon: '🤖', label: 'AI', to: '/ai', bg: '#F5F0FF', color: '#9B59B6' },
        ].map((action, i) => (
          <motion.div
            key={action.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
          >
            <Link
              to={action.to}
              className="flex flex-col items-center gap-1.5 py-3 rounded-2xl haptic"
              style={{ background: action.bg }}
            >
              <div className="text-2xl">{action.icon}</div>
              <div className="text-xs font-semibold" style={{ color: action.color }}>{action.label}</div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Active goals */}
      {activeGoals.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-gray-900 text-sm">🎯 Мои цели</h2>
            <Link to="/goals" className="text-xs font-medium" style={{ color: '#6C63FF' }}>Все →</Link>
          </div>
          <div className="space-y-2">
            {activeGoals.map((goal, i) => {
              const progress = goal.targetAmount > 0
                ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
                : 0;
              const remaining = goal.targetAmount - goal.currentAmount;
              return (
                <motion.div
                  key={goal.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.07 }}
                >
                  <Link to="/goals" className="block bg-white rounded-2xl p-4 haptic" style={{ boxShadow: 'var(--shadow-card)' }}>
                    <div className="flex items-center gap-3 mb-2.5">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                        style={{ backgroundColor: goal.color + '20' }}>
                        {goal.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 text-sm truncate">{goal.name}</div>
                        <div className="text-xs text-gray-400">осталось {formatCurrency(remaining)}</div>
                      </div>
                      <div className="text-sm font-bold" style={{ color: goal.color }}>{Math.round(progress)}%</div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.8, delay: 0.4 + i * 0.07 }}
                        className="h-1.5 rounded-full"
                        style={{ backgroundColor: goal.color }}
                      />
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-gray-900 text-sm">📋 Последние операции</h2>
          <Link to="/transactions" className="text-xs font-medium" style={{ color: '#6C63FF' }}>Все →</Link>
        </div>
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
          {recentTxs.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-4xl mb-2">💸</div>
              <div className="text-sm font-medium text-gray-500 mb-1">Нет операций</div>
              <div className="text-xs text-gray-400 mb-4">Добавь первую трату</div>
              <Link
                to="/transactions/add"
                className="inline-block text-white text-sm font-semibold px-5 py-2.5 rounded-xl haptic"
                style={{ background: 'linear-gradient(135deg, #FF6B35, #FF8C42)' }}
              >
                + Добавить
              </Link>
            </div>
          ) : (
            recentTxs.map((tx, i) => (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: tx.type === 'income' ? '#E8FFF5' : '#FFF0EB' }}>
                  {tx.category?.icon ?? (tx.type === 'income' ? '💚' : '💸')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate text-sm">
                    {tx.description || tx.category?.name || 'Операция'}
                  </div>
                  <div className="text-xs text-gray-400">
                    {new Date(tx.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
                <div className={`font-bold text-sm ${tx.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>
                  {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
