import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { apiClient } from '@/shared/api/client';
import { formatCurrency } from '@/shared/utils/format';
import type { Goal } from '@finwise/shared-types';

export function GoalsPage() {
  const { data: goals, isLoading } = useQuery<Goal[]>({
    queryKey: ['goals'],
    queryFn: () => apiClient.get('/goals').then((r) => r.data.data),
  });

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">🎯 Мои цели</h1>
        <Link
          to="/goals/new"
          className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl haptic"
        >
          +
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : !goals?.length ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-4">🎯</div>
          <div className="font-medium text-gray-600 mb-1">Нет целей</div>
          <div className="text-sm mb-6">Поставь первую финансовую цель</div>
          <Link
            to="/goals/new"
            className="inline-block bg-blue-600 text-white font-semibold px-6 py-3 rounded-2xl haptic"
          >
            Создать цель
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((goal, i) => {
            const progress = goal.targetAmount > 0
              ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
              : 0;
            const remaining = goal.targetAmount - goal.currentAmount;

            return (
              <motion.div
                key={goal.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
              >
                <Link
                  to={`/goals/${goal.id}`}
                  className="block bg-white rounded-2xl p-4 shadow-sm haptic"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-xl">
                      {goal.icon ?? '🎯'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{goal.name}</div>
                      <div className="text-xs text-gray-400">
                        {goal.deadline
                          ? `до ${new Date(goal.deadline).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}`
                          : 'Без срока'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900">{Math.round(progress)}%</div>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.8, delay: i * 0.07 + 0.2 }}
                      className="bg-blue-500 h-2 rounded-full"
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{formatCurrency(goal.currentAmount)}</span>
                    <span>осталось {formatCurrency(remaining)}</span>
                    <span>{formatCurrency(goal.targetAmount)}</span>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
