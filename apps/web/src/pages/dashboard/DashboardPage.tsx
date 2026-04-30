import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { useFinanceStore } from '@/features/finance/store';
import { useAuthStore } from '@/features/auth/store';
import { formatCurrency } from '@/shared/utils/format';

function SafeToSpendCard({ expenses, income }: { expenses: number; income: number }) {
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const dayOfMonth = new Date().getDate();
  const daysLeft = daysInMonth - dayOfMonth;
  const dailyBudget = income > 0 ? income / daysInMonth : 0;
  const spentToday = expenses / dayOfMonth;
  const safeToSpend = Math.max(0, dailyBudget * daysLeft - (expenses - dailyBudget * (dayOfMonth - 1)));
  const isOnTrack = spentToday <= dailyBudget;

  if (income === 0) return null;

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
          <div className="text-white text-3xl font-bold">{formatCurrency(Math.max(0, dailyBudget - spentToday))}</div>
          <div className="text-purple-200 text-xs mt-1">
            {isOnTrack ? '✅ Ты в рамках бюджета' : '⚠️ Немного превышаешь план'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-purple-200 text-xs mb-1">До конца месяца</div>
          <div className="text-white font-bold text-lg">{formatCurrency(safeToSpend)}</div>
          <div className="text-purple-200 text-xs">{daysLeft} дн.</div>
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
  const { getMonthSummary, getRecentTransactions, goals, streak } = useFinanceStore();
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

      {/* Safe to spend */}
      <SafeToSpendCard expenses={summary.expenses} income={summary.income} />

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
