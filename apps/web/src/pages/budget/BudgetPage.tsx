import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { apiClient } from '@/shared/api/client';
import { formatCurrency } from '@/shared/utils/format';
import type { Budget } from '@finwise/shared-types';

export function BudgetPage() {
  const { data: budgets, isLoading } = useQuery<Budget[]>({
    queryKey: ['budgets'],
    queryFn: () => apiClient.get('/budgets').then((r) => r.data.data),
  });

  const totalBudget = budgets?.reduce((s, b) => s + b.amount, 0) ?? 0;
  const totalSpent = budgets?.reduce((s, b) => s + b.spent, 0) ?? 0;
  const overallProgress = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-xl font-bold text-gray-900 mb-4">💰 Бюджет</h1>

      {/* Overall summary */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white mb-4">
        <div className="text-blue-200 text-sm mb-1">Общий бюджет на месяц</div>
        <div className="text-3xl font-bold mb-1">{formatCurrency(totalBudget)}</div>
        <div className="text-blue-200 text-sm mb-3">
          Потрачено {formatCurrency(totalSpent)} · Осталось {formatCurrency(totalBudget - totalSpent)}
        </div>
        <div className="w-full bg-blue-500 rounded-full h-2">
          <div
            className="bg-white h-2 rounded-full transition-all"
            style={{ width: `${Math.min(overallProgress, 100)}%` }}
          />
        </div>
        <div className="text-right text-blue-200 text-xs mt-1">{Math.round(overallProgress)}%</div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : !budgets?.length ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">💰</div>
          <div className="font-medium text-gray-600 mb-1">Бюджеты не настроены</div>
          <div className="text-sm">Установи лимиты по категориям</div>
        </div>
      ) : (
        <div className="space-y-3">
          {budgets.map((budget, i) => {
            const pct = budget.amount > 0
              ? Math.min((budget.spent / budget.amount) * 100, 100)
              : 0;
            const isOver = budget.spent > budget.amount;
            const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-green-500';

            return (
              <motion.div
                key={budget.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="bg-white rounded-2xl p-4 shadow-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{budget.category?.icon ?? '📦'}</span>
                    <span className="font-medium text-gray-900">{budget.category?.name ?? 'Категория'}</span>
                  </div>
                  <div className="text-right">
                    <span className={`font-semibold ${isOver ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatCurrency(budget.spent)}
                    </span>
                    <span className="text-gray-400 text-sm"> / {formatCurrency(budget.amount)}</span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.7, delay: i * 0.06 + 0.1 }}
                    className={`h-2 rounded-full ${barColor}`}
                  />
                </div>
                {isOver && (
                  <div className="text-xs text-red-500 mt-1">
                    Превышен на {formatCurrency(budget.spent - budget.amount)}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
