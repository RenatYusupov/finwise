import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { useFinanceStore, type Transaction } from '@/features/finance/store';
import { useAuthStore } from '@/features/auth/store';
import { formatCurrency } from '@/shared/utils/format';

// ─── Spending Profile ─────────────────────────────────────────────────────────
//
// Analyses last 3 full months to classify expenses into:
//   • fixed      — same category, similar amount (±25%) every month
//                  (rent, mortgage, subscriptions, insurance)
//   • semi_fixed — category appears every month but amount varies
//                  (food, transport, utilities, cafe)
//   • variable   — everything else (shopping, travel, entertainment…)
//
// Returns:
//   avgIncome        — average monthly income over last 3 months
//   fixedMonthly     — estimated fixed cost per month
//   semiFixedMonthly — average semi-fixed cost per month
//   discretionary    — avgIncome − fixedMonthly − semiFixedMonthly
//   safeToday        — how much is safe to spend today
//   safeRestOfMonth  — how much is safe to spend for the rest of the month

// Categories that are typically fixed (subscription-like)
const FIXED_CATS = new Set(['home', 'education']);
// Categories that are typically semi-fixed (recurring but variable)
const SEMI_FIXED_CATS = new Set(['food', 'transport', 'cafe', 'health', 'sport', 'beauty']);

interface SpendingProfile {
  avgIncome: number;
  fixedMonthly: number;
  semiFixedMonthly: number;
  discretionary: number;
  thisMonthDiscretionarySpent: number;
  safeToday: number;
  safeRestOfMonth: number;
  daysLeft: number;
  isOnTrack: boolean;
  hasEnoughHistory: boolean;
}

function computeSpendingProfile(transactions: Transaction[]): SpendingProfile {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(1, daysInMonth - dayOfMonth);

  // Build per-month buckets for last 3 full months
  const months: { start: string; end: string }[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = d.toISOString();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
    months.push({ start, end });
  }

  // Current month boundaries
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Per-month income and expense-by-category
  const monthlyIncome: number[] = [];
  const monthlyCatSpend: Map<string, number[]>[] = months.map(() => new Map());

  months.forEach(({ start, end }, mi) => {
    const txs = transactions.filter((t) => t.date >= start && t.date <= end);
    const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    monthlyIncome.push(income);
    txs.filter((t) => t.type === 'expense').forEach((t) => {
      const arr = monthlyCatSpend[mi]!.get(t.categoryId) ?? [];
      arr.push(t.amount);
      monthlyCatSpend[mi]!.set(t.categoryId, arr);
    });
  });

  const avgIncome = monthlyIncome.length > 0
    ? monthlyIncome.reduce((s, v) => s + v, 0) / monthlyIncome.length
    : 0;

  // Collect all categories seen across all months
  const allCats = new Set<string>();
  monthlyCatSpend.forEach((m) => m.forEach((_, k) => allCats.add(k)));

  let fixedMonthly = 0;
  let semiFixedMonthly = 0;

  allCats.forEach((cat) => {
    // Monthly totals for this category (0 if absent)
    const monthTotals = months.map((_, mi) => {
      const amounts = monthlyCatSpend[mi]!.get(cat) ?? [];
      return amounts.reduce((s, v) => s + v, 0);
    });
    const presentMonths = monthTotals.filter((v) => v > 0).length;
    if (presentMonths < 2) return; // not recurring enough

    const avg = monthTotals.reduce((s, v) => s + v, 0) / months.length;
    const nonZero = monthTotals.filter((v) => v > 0);
    const maxDev = nonZero.length > 1
      ? Math.max(...nonZero.map((v) => Math.abs(v - avg) / avg))
      : 0;

    if (FIXED_CATS.has(cat) || (presentMonths === 3 && maxDev < 0.25)) {
      // Appears every month with low variance → fixed
      fixedMonthly += avg;
    } else if (SEMI_FIXED_CATS.has(cat) && presentMonths >= 2) {
      // Recurring but variable → semi-fixed
      semiFixedMonthly += avg;
    }
  });

  const discretionary = Math.max(0, avgIncome - fixedMonthly - semiFixedMonthly);

  // This month's discretionary spending (variable categories only)
  const thisMonthTxs = transactions.filter((t) => t.type === 'expense' && t.date >= thisMonthStart);
  const thisMonthDiscretionarySpent = thisMonthTxs
    .filter((t) => !FIXED_CATS.has(t.categoryId) && !SEMI_FIXED_CATS.has(t.categoryId))
    .reduce((s, t) => s + t.amount, 0);

  // Daily discretionary budget
  const dailyDiscretionary = discretionary / daysInMonth;
  // How much discretionary budget is left for the rest of the month
  const discretionaryLeft = Math.max(0, discretionary - thisMonthDiscretionarySpent);
  const safeRestOfMonth = discretionaryLeft;
  const safeToday = Math.max(0, discretionaryLeft / daysLeft);

  // On track = spent so far ≤ expected by this day
  const expectedByToday = dailyDiscretionary * dayOfMonth;
  const isOnTrack = thisMonthDiscretionarySpent <= expectedByToday * 1.1; // 10% tolerance

  const hasEnoughHistory = avgIncome > 0 && months.some((_, mi) => monthlyCatSpend[mi]!.size > 0);

  return {
    avgIncome,
    fixedMonthly,
    semiFixedMonthly,
    discretionary,
    thisMonthDiscretionarySpent,
    safeToday,
    safeRestOfMonth,
    daysLeft,
    isOnTrack,
    hasEnoughHistory,
  };
}

// ─── Smart Safe-to-Spend Card ─────────────────────────────────────────────────

function SafeToSpendCard({ transactions, income }: { transactions: Transaction[]; income: number }) {
  const profile = useMemo(() => computeSpendingProfile(transactions), [transactions]);

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

  const statusText = profile.isOnTrack ? '✅ Ты в рамках бюджета' : '⚠️ Немного превышаешь план';
  const statusColor = profile.isOnTrack ? '#86EFAC' : '#FCA5A5';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-2xl overflow-hidden insight-pulse"
      style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #9B59B6 100%)' }}
    >
      {/* Main row */}
      <div className="flex items-start justify-between p-4 pb-3">
        <div>
          <div className="text-purple-200 text-xs font-medium mb-1">💡 Можно потратить сегодня</div>
          <div className="text-white text-3xl font-bold">{formatCurrency(profile.safeToday)}</div>
          <div className="text-xs mt-1" style={{ color: statusColor }}>{statusText}</div>
        </div>
        <div className="text-right">
          <div className="text-purple-200 text-xs mb-1">До конца месяца</div>
          <div className="text-white font-bold text-lg">{formatCurrency(profile.safeRestOfMonth)}</div>
          <div className="text-purple-200 text-xs">{profile.daysLeft} дн.</div>
        </div>
      </div>

      {/* Breakdown row */}
      <div className="flex gap-px bg-white/10 border-t border-white/10">
        <div className="flex-1 px-3 py-2 text-center">
          <div className="text-purple-300 text-xs mb-0.5">Постоянные</div>
          <div className="text-white text-xs font-semibold">{formatCurrency(profile.fixedMonthly)}</div>
        </div>
        <div className="flex-1 px-3 py-2 text-center border-l border-white/10">
          <div className="text-purple-300 text-xs mb-0.5">Условно-пост.</div>
          <div className="text-white text-xs font-semibold">{formatCurrency(profile.semiFixedMonthly)}</div>
        </div>
        <div className="flex-1 px-3 py-2 text-center border-l border-white/10">
          <div className="text-purple-300 text-xs mb-0.5">Свободные</div>
          <div className="text-white text-xs font-semibold">{formatCurrency(profile.discretionary)}</div>
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

export function DashboardPage() {
  const { user } = useAuthStore();
  const { getMonthSummary, getRecentTransactions, goals, streak, transactions } = useFinanceStore();
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
      <SafeToSpendCard transactions={transactions} income={summary.income} />

      {/* AI Insight banner */}
      <AiInsightBanner expenses={summary.expenses} income={summary.income} navigate={navigate} />

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
