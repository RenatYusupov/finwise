import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useFinanceStore } from '@/features/finance/store';
import { useAuthStore } from '@/features/auth/store';
import { formatCurrency } from '@/shared/utils/format';

function TransactionIcon({ type }: { type: string }) {
  return (
    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
      type === 'income' ? 'bg-green-100' : 'bg-red-100'
    }`}>
      {type === 'income' ? '💚' : '❤️'}
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuthStore();
  const { getMonthSummary, getRecentTransactions, goals, streak } = useFinanceStore();

  const summary = getMonthSummary();
  const recentTxs = getRecentTransactions(5);
  const activeGoals = goals.filter((g) => g.currentAmount < g.targetAmount).slice(0, 2);

  const now = new Date();
  const monthName = now.toLocaleString('ru-RU', { month: 'long' });

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Привет, {user?.firstName ?? 'друг'}! 👋
          </h1>
          <p className="text-gray-500 text-sm capitalize">
            {monthName} {now.getFullYear()}
          </p>
        </div>
        {streak > 1 && (
          <div className="flex items-center gap-1 bg-orange-100 px-3 py-1.5 rounded-full">
            <span>🔥</span>
            <span className="text-sm font-bold text-orange-600">{streak}</span>
          </div>
        )}
      </div>

      {/* Balance card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white"
      >
        <div className="text-blue-200 text-sm mb-1">Баланс за месяц</div>
        <div className={`text-3xl font-bold mb-4 ${summary.savings < 0 ? 'text-red-300' : ''}`}>
          {summary.savings >= 0 ? '+' : ''}{formatCurrency(summary.savings)}
        </div>
        <div className="flex gap-6">
          <div>
            <div className="text-blue-200 text-xs">↑ Доходы</div>
            <div className="font-semibold">{formatCurrency(summary.income)}</div>
          </div>
          <div>
            <div className="text-blue-200 text-xs">↓ Расходы</div>
            <div className="font-semibold">{formatCurrency(summary.expenses)}</div>
          </div>
          <div>
            <div className="text-blue-200 text-xs">💾 Сбережения</div>
            <div className="font-semibold">{summary.savingsRate}%</div>
          </div>
        </div>
      </motion.div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: '➕', label: 'Добавить', to: '/transactions/add', color: 'bg-blue-50 text-blue-600' },
          { icon: '🎯', label: 'Цели', to: '/goals', color: 'bg-purple-50 text-purple-600' },
          { icon: '📊', label: 'Аналитика', to: '/analytics', color: 'bg-green-50 text-green-600' },
        ].map((action) => (
          <Link
            key={action.label}
            to={action.to}
            className={`${action.color} rounded-2xl p-3 text-center haptic`}
          >
            <div className="text-2xl mb-1">{action.icon}</div>
            <div className="text-xs font-semibold">{action.label}</div>
          </Link>
        ))}
      </div>

      {/* Active goals */}
      {activeGoals.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">🎯 Мои цели</h2>
            <Link to="/goals" className="text-blue-600 text-sm">Все →</Link>
          </div>
          <div className="space-y-3">
            {activeGoals.map((goal) => {
              const progress = goal.targetAmount > 0
                ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
                : 0;
              return (
                <Link key={goal.id} to="/goals" className="block bg-white rounded-2xl p-4 shadow-sm haptic">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xl">{goal.icon}</span>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 text-sm">{goal.name}</div>
                    </div>
                    <div className="text-sm font-bold text-gray-700">{Math.round(progress)}%</div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{ width: `${progress}%`, backgroundColor: goal.color }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>{formatCurrency(goal.currentAmount)}</span>
                    <span>{formatCurrency(goal.targetAmount)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">📋 Последние операции</h2>
          <Link to="/transactions" className="text-blue-600 text-sm">Все →</Link>
        </div>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          {recentTxs.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-3xl mb-2">💸</div>
              <div className="text-sm">Нет операций. Добавь первую!</div>
              <Link
                to="/transactions/add"
                className="inline-block mt-3 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl haptic"
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
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl">
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
                <div className={`font-semibold text-sm ${tx.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
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
