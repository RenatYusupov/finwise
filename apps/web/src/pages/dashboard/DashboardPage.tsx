import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { apiClient } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/store';
import { formatCurrency, formatRelativeTime, transactionColor, transactionSign } from '@/shared/utils/format';
import { StreakBadge } from '@/features/gamification/StreakBadge';
import { AiInsightCard } from '@/features/analytics/AiInsightCard';
import { GoalProgressCard } from '@/features/goals/GoalProgressCard';
import type { AnalyticsSummary, Transaction, AiInsight, Goal } from '@finwise/shared-types';

export function DashboardPage() {
  const { user } = useAuthStore();

  const { data: summary } = useQuery<AnalyticsSummary>({
    queryKey: ['analytics', 'summary'],
    queryFn: () => apiClient.get('/analytics/summary?period=month').then((r) => r.data.data),
  });

  const { data: transactions } = useQuery<Transaction[]>({
    queryKey: ['transactions', 'recent'],
    queryFn: () => apiClient.get('/transactions?limit=5').then((r) => r.data.data),
  });

  const { data: insights } = useQuery<AiInsight[]>({
    queryKey: ['ai', 'insights'],
    queryFn: () => apiClient.get('/ai/insights').then((r) => r.data.data),
  });

  const { data: goals } = useQuery<Goal[]>({
    queryKey: ['goals', 'active'],
    queryFn: () => apiClient.get('/goals?status=active&limit=2').then((r) => r.data.data),
  });

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
        <StreakBadge />
      </div>

      {/* Balance card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white"
      >
        <div className="text-blue-200 text-sm mb-1">Баланс</div>
        <div className="text-3xl font-bold mb-4">
          {formatCurrency(summary?.netSavings ?? 0)}
        </div>
        <div className="flex gap-6">
          <div>
            <div className="text-blue-200 text-xs">↑ Доходы</div>
            <div className="font-semibold">{formatCurrency(summary?.totalIncome ?? 0)}</div>
          </div>
          <div>
            <div className="text-blue-200 text-xs">↓ Расходы</div>
            <div className="font-semibold">{formatCurrency(summary?.totalExpenses ?? 0)}</div>
          </div>
          <div>
            <div className="text-blue-200 text-xs">💾 Сбережения</div>
            <div className="font-semibold">{Math.round(summary?.savingsRate ?? 0)}%</div>
          </div>
        </div>
      </motion.div>

      {/* AI Insight */}
      {insights && insights[0] && <AiInsightCard insight={insights[0]} />}

      {/* Goals */}
      {goals && goals.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">🎯 Мои цели</h2>
            <Link to="/goals" className="text-blue-600 text-sm">
              Все →
            </Link>
          </div>
          <div className="space-y-3">
            {goals.map((goal) => (
              <GoalProgressCard key={goal.id} goal={goal} compact />
            ))}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">📋 Последние операции</h2>
          <Link to="/transactions" className="text-blue-600 text-sm">
            Все →
          </Link>
        </div>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          {!transactions?.length && (
            <div className="text-center py-8 text-gray-400">
              <div className="text-3xl mb-2">💸</div>
              <div className="text-sm">Нет операций. Добавь первую!</div>
            </div>
          )}
          {transactions?.map((tx, i) => (
            <motion.div
              key={tx.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0"
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl">
                {tx.category?.icon ?? '💳'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {tx.description ?? tx.category?.name ?? 'Операция'}
                </div>
                <div className="text-xs text-gray-400">{formatRelativeTime(tx.date)}</div>
              </div>
              <div className={`font-semibold ${transactionColor(tx.type)}`}>
                {transactionSign(tx.type)}
                {formatCurrency(tx.amount)}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
