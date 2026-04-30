import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFinanceStore, EXPENSE_CATEGORIES } from '@/features/finance/store';
import { formatCurrency } from '@/shared/utils/format';

function AddBudgetModal({ onClose }: { onClose: () => void }) {
  const { budgets, getCategorySpending } = useFinanceStore();
  const [selectedCat, setSelectedCat] = useState('');
  const [limit, setLimit] = useState('');

  const categorySpending = getCategorySpending();
  const existingBudgetIds = budgets.map((b) => b.categoryId);
  const availableCategories = EXPENSE_CATEGORIES.filter((c) => !existingBudgetIds.includes(c.id));

  const handleAdd = () => {
    const numLimit = parseFloat(limit);
    if (!selectedCat || !numLimit || numLimit <= 0) return;
    const spent = categorySpending.find((c) => c.category.id === selectedCat)?.amount ?? 0;
    useFinanceStore.setState((s) => ({
      budgets: [
        ...s.budgets,
        {
          id: `budget_${Date.now()}`,
          categoryId: selectedCat,
          limit: numLimit,
          spent,
          period: 'month',
        },
      ],
    }));
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full bg-white rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto"
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-xl font-bold text-gray-900 mb-6">Новый лимит</h2>

        {availableCategories.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <div className="text-3xl mb-2">✅</div>
            <div className="text-sm">Лимиты установлены для всех категорий</div>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <div className="text-sm font-medium text-gray-500 mb-2">Категория</div>
              <div className="grid grid-cols-3 gap-2">
                {availableCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCat(cat.id)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 haptic transition-all ${
                      selectedCat === cat.id ? 'border-blue-500 bg-blue-50' : 'border-transparent bg-gray-50'
                    }`}
                  >
                    <span className="text-2xl">{cat.icon}</span>
                    <span className="text-xs text-gray-600 text-center leading-tight">{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <div className="text-sm font-medium text-gray-500 mb-2">Лимит в месяц</div>
              <div className="relative">
                <input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder="0"
                  className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-gray-800 outline-none placeholder-gray-400 pr-10"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₽</span>
              </div>
              <div className="flex gap-2 mt-2">
                {[3000, 5000, 10000, 20000].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setLimit(String(preset))}
                    className="flex-1 py-1.5 bg-gray-100 rounded-xl text-xs font-medium text-gray-600 haptic"
                  >
                    {preset.toLocaleString('ru-RU')}
                  </button>
                ))}
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleAdd}
              disabled={!selectedCat || !limit || parseFloat(limit) <= 0}
              className="w-full bg-blue-600 text-white font-semibold text-lg py-4 rounded-2xl haptic disabled:opacity-40"
            >
              Установить лимит
            </motion.button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

export function BudgetPage() {
  const { budgets, getCategorySpending, getMonthSummary } = useFinanceStore();
  const [showAdd, setShowAdd] = useState(false);

  const categorySpending = getCategorySpending();
  const summary = getMonthSummary();

  // Sync spent amounts with actual spending
  const budgetsWithActual = budgets.map((b) => {
    const actual = categorySpending.find((c) => c.category.id === b.categoryId)?.amount ?? 0;
    const cat = EXPENSE_CATEGORIES.find((c) => c.id === b.categoryId);
    return { ...b, spent: actual, category: cat };
  });

  const deleteBudget = (id: string) => {
    useFinanceStore.setState((s) => ({
      budgets: s.budgets.filter((b) => b.id !== id),
    }));
  };

  const totalLimit = budgetsWithActual.reduce((s, b) => s + b.limit, 0);
  const totalSpent = budgetsWithActual.reduce((s, b) => s + b.spent, 0);

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">📋 Бюджет</h1>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowAdd(true)}
          className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl haptic"
        >
          +
        </motion.button>
      </div>

      {/* Overview */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white mb-4"
      >
        <div className="text-blue-200 text-sm mb-1">Расходы за месяц</div>
        <div className="text-3xl font-bold mb-3">{formatCurrency(summary.expenses)}</div>
        {totalLimit > 0 && (
          <>
            <div className="w-full bg-white/20 rounded-full h-2 mb-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  totalSpent > totalLimit ? 'bg-red-400' : 'bg-white'
                }`}
                style={{ width: `${Math.min((totalSpent / totalLimit) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-blue-200 text-xs">
              <span>Потрачено: {formatCurrency(totalSpent)}</span>
              <span>Лимит: {formatCurrency(totalLimit)}</span>
            </div>
          </>
        )}
      </motion.div>

      {/* Budget items */}
      {budgetsWithActual.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-5xl mb-4">📋</div>
          <div className="font-medium text-gray-600 mb-1">Нет лимитов</div>
          <div className="text-sm mb-6">Установи лимиты на категории расходов</div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowAdd(true)}
            className="inline-block bg-blue-600 text-white font-semibold px-6 py-3 rounded-2xl haptic"
          >
            Добавить лимит
          </motion.button>
        </div>
      ) : (
        <div className="space-y-3">
          {budgetsWithActual.map((budget, i) => {
            const pct = budget.limit > 0 ? Math.min((budget.spent / budget.limit) * 100, 100) : 0;
            const isOver = budget.spent > budget.limit;
            const remaining = budget.limit - budget.spent;

            return (
              <motion.div
                key={budget.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="bg-white rounded-2xl p-4 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                    style={{ backgroundColor: (budget.category?.color ?? '#ccc') + '20' }}
                  >
                    {budget.category?.icon ?? '💸'}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{budget.category?.name ?? budget.categoryId}</div>
                    <div className={`text-xs ${isOver ? 'text-red-500' : 'text-gray-400'}`}>
                      {isOver
                        ? `⚠️ Превышен на ${formatCurrency(Math.abs(remaining))}`
                        : `Осталось ${formatCurrency(remaining)}`}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteBudget(budget.id)}
                    className="w-7 h-7 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-xs haptic"
                  >
                    ×
                  </button>
                </div>

                <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, delay: i * 0.06 + 0.2 }}
                    className={`h-2 rounded-full ${isOver ? 'bg-red-500' : 'bg-blue-500'}`}
                  />
                </div>

                <div className="flex justify-between text-xs text-gray-500">
                  <span>{formatCurrency(budget.spent)} потрачено</span>
                  <span>лимит {formatCurrency(budget.limit)}</span>
                </div>
              </motion.div>
            );
          })}

          {/* Unbudgeted spending */}
          {categorySpending
            .filter((c) => !budgets.some((b) => b.categoryId === c.category.id))
            .slice(0, 3)
            .map((item) => (
              <div key={item.category.id} className="bg-gray-50 rounded-2xl p-4 border border-dashed border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl">
                    {item.category.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-700 text-sm">{item.category.name}</div>
                    <div className="text-xs text-gray-400">Без лимита</div>
                  </div>
                  <div className="text-sm font-semibold text-gray-600">{formatCurrency(item.amount)}</div>
                </div>
              </div>
            ))}
        </div>
      )}

      <AnimatePresence>
        {showAdd && <AddBudgetModal onClose={() => setShowAdd(false)} />}
      </AnimatePresence>
    </div>
  );
}
