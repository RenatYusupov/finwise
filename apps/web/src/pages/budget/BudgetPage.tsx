import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFinanceStore, EXPENSE_CATEGORIES } from '@/features/finance/store';
import { formatCurrency } from '@/shared/utils/format';
import { apiClient } from '@/shared/api/client';

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
                  style={{ fontSize: 16 }}
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

interface BudgetRecommendation {
  categoryId: string;
  categoryName: string;
  recommendedLimit: number;
  currentSpend: number;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

function SmartLimitsSheet({ onClose, onApply }: { onClose: () => void; onApply: (recs: BudgetRecommendation[]) => void }) {
  const { getCategorySpending, budgets, getMonthSummary } = useFinanceStore();
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<BudgetRecommendation[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const categorySpending = getCategorySpending();
  const summary = getMonthSummary();

  const fetchRecommendations = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.post('/ai/budget-recommendations', {
        categorySpending: categorySpending.map((c) => ({
          categoryId: c.category.id,
          categoryName: c.category.name,
          amount: c.amount,
        })),
        currentBudgets: budgets.map((b) => ({ categoryId: b.categoryId, limit: b.limit })),
        income: summary.income,
      });
      const recs: BudgetRecommendation[] = res.data.recommendations ?? [];
      setRecommendations(recs);
      // Pre-select all high priority
      setSelected(new Set(recs.filter((r) => r.priority === 'high').map((r) => r.categoryId)));
    } catch {
      // Fallback: generate local recommendations
      const localRecs: BudgetRecommendation[] = categorySpending.slice(0, 5).map((c) => ({
        categoryId: c.category.id,
        categoryName: c.category.name,
        recommendedLimit: Math.ceil(c.amount * 1.15 / 500) * 500,
        currentSpend: c.amount,
        reason: `Вы тратите ${formatCurrency(c.amount)} в месяц. Рекомендуем лимит с небольшим буфером.`,
        priority: c.amount > (summary.income * 0.3) ? 'high' : 'medium',
      }));
      setRecommendations(localRecs);
      setSelected(new Set(localRecs.filter((r) => r.priority === 'high').map((r) => r.categoryId)));
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (categoryId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const handleApply = () => {
    const toApply = recommendations.filter((r) => selected.has(r.categoryId));
    onApply(toApply);
    onClose();
  };

  const priorityColor = (p: string) =>
    p === 'high' ? '#FF4757' : p === 'medium' ? '#FFB800' : '#00C896';
  const priorityLabel = (p: string) =>
    p === 'high' ? 'Важно' : p === 'medium' ? 'Средне' : 'Низко';

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
        className="w-full bg-white rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-purple-100 flex items-center justify-center text-xl">✨</div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Умные лимиты</h2>
            <p className="text-xs text-gray-400">AI-рекомендации на основе ваших трат</p>
          </div>
        </div>

        {recommendations.length === 0 && !loading && (
          <div className="py-6 text-center">
            <div className="text-4xl mb-3">🤖</div>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              FinWise проанализирует ваши расходы и предложит оптимальные лимиты для каждой категории
            </p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={fetchRecommendations}
              className="w-full py-4 rounded-2xl font-semibold text-white haptic"
              style={{ background: 'linear-gradient(135deg, #6C63FF, #8B5CF6)' }}
            >
              Получить рекомендации
            </motion.button>
          </div>
        )}

        {loading && (
          <div className="py-10 text-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-10 h-10 border-3 border-purple-200 border-t-purple-600 rounded-full mx-auto mb-3"
              style={{ borderWidth: 3 }}
            />
            <p className="text-sm text-gray-400">Анализируем ваши расходы...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 rounded-2xl p-3 mb-4 text-sm text-red-600">{error}</div>
        )}

        {recommendations.length > 0 && (
          <>
            <div className="space-y-3 mb-6 mt-4">
              {recommendations.map((rec) => {
                const cat = EXPENSE_CATEGORIES.find((c) => c.id === rec.categoryId);
                const isSelected = selected.has(rec.categoryId);
                const existingBudget = budgets.find((b) => b.categoryId === rec.categoryId);
                return (
                  <motion.div
                    key={rec.categoryId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => toggleSelect(rec.categoryId)}
                    className={`rounded-2xl p-4 border-2 cursor-pointer haptic transition-all ${
                      isSelected ? 'border-purple-400 bg-purple-50' : 'border-gray-100 bg-white'
                    }`}
                    style={{ boxShadow: 'var(--shadow-card)' }}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                        style={{ background: (cat?.color ?? '#ccc') + '20' }}
                      >
                        {cat?.icon ?? '💸'}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 text-sm">{rec.categoryName}</div>
                        <div className="text-xs text-gray-400">
                          Сейчас: {formatCurrency(rec.currentSpend)}
                          {existingBudget && ` · Лимит: ${formatCurrency(existingBudget.limit)}`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-purple-700">{formatCurrency(rec.recommendedLimit)}</div>
                        <div
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ background: priorityColor(rec.priority) + '20', color: priorityColor(rec.priority) }}
                        >
                          {priorityLabel(rec.priority)}
                        </div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'border-purple-500 bg-purple-500' : 'border-gray-300'
                        }`}
                      >
                        {isSelected && <span className="text-white text-xs">✓</span>}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{rec.reason}</p>
                  </motion.div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-2xl font-semibold text-sm haptic"
                style={{ background: '#F0EEFF', color: '#6C63FF' }}
              >
                Отмена
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleApply}
                disabled={selected.size === 0}
                className="flex-1 py-3 rounded-2xl font-bold text-sm text-white haptic disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #6C63FF, #8B5CF6)' }}
              >
                Применить ({selected.size})
              </motion.button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

export function BudgetPage() {
  const { budgets, getCategorySpending, getMonthSummary } = useFinanceStore();
  const [showAdd, setShowAdd] = useState(false);
  const [showSmartLimits, setShowSmartLimits] = useState(false);

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

  const applyRecommendations = (recs: BudgetRecommendation[]) => {
    useFinanceStore.setState((s) => {
      const newBudgets = [...s.budgets];
      for (const rec of recs) {
        const existing = newBudgets.findIndex((b) => b.categoryId === rec.categoryId);
        if (existing >= 0) {
          const cur = newBudgets[existing]!;
          newBudgets[existing] = { ...cur, limit: rec.recommendedLimit };
        } else {
          const spent = categorySpending.find((c) => c.category.id === rec.categoryId)?.amount ?? 0;
          newBudgets.push({
            id: `budget_${Date.now()}_${rec.categoryId}`,
            categoryId: rec.categoryId,
            limit: rec.recommendedLimit,
            spent,
            period: 'month',
          });
        }
      }
      return { budgets: newBudgets };
    });
  };

  const totalLimit = budgetsWithActual.reduce((s, b) => s + b.limit, 0);
  const totalSpent = budgetsWithActual.reduce((s, b) => s + b.spent, 0);
  const firstExceeded = budgetsWithActual.find((b) => b.limit > 0 && b.spent >= b.limit);

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">📋 Бюджет</h1>
        <div className="flex gap-2">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowSmartLimits(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold haptic"
            style={{ background: 'linear-gradient(135deg, #F0EEFF, #EDE8FF)', color: '#6C63FF', border: '1px solid rgba(108,99,255,0.2)' }}
          >
            <span>✨</span>
            <span>Умные лимиты</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowAdd(true)}
            className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl haptic"
          >
            +
          </motion.button>
        </div>
      </div>

      {firstExceeded && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-2xl p-4 border border-red-200 bg-red-50 flex items-center justify-between gap-3"
        >
          <div>
            <div className="text-sm font-bold text-red-700">⚠️ Превышен бюджет: {firstExceeded.category?.name ?? firstExceeded.categoryId}</div>
            <div className="text-xs text-red-500 mt-0.5">Потрачено {formatCurrency(firstExceeded.spent)} из {formatCurrency(firstExceeded.limit)}</div>
          </div>
          <button className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-bold haptic">
            Посмотреть
          </button>
        </motion.div>
      )}

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
          <div className="flex flex-col gap-3 items-center">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowSmartLimits(true)}
              className="inline-flex items-center gap-2 font-semibold px-6 py-3 rounded-2xl haptic"
              style={{ background: 'linear-gradient(135deg, #6C63FF, #8B5CF6)', color: 'white' }}
            >
              ✨ Умные лимиты от AI
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowAdd(true)}
              className="inline-block bg-blue-600 text-white font-semibold px-6 py-3 rounded-2xl haptic"
            >
              Добавить вручную
            </motion.button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {budgetsWithActual.map((budget, i) => {
            const rawPct = budget.limit > 0 ? (budget.spent / budget.limit) * 100 : 0;
            const pct = Math.min(rawPct, 100);
            const isNearLimit = rawPct >= 80 && rawPct < 100;
            const isOver = budget.spent >= budget.limit;
            const remaining = budget.limit - budget.spent;

            return (
              <motion.div
                key={budget.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className={`rounded-2xl p-4 shadow-sm border ${isOver ? 'bg-red-50 border-red-200' : isNearLimit ? 'bg-amber-50 border-amber-200' : 'bg-white border-transparent'}`}
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
                    <div className={`text-xs ${isOver ? 'text-red-500' : isNearLimit ? 'text-amber-600' : 'text-gray-400'}`}>
                      {isOver
                        ? `🚨 Превышен на ${formatCurrency(Math.abs(remaining))}`
                        : isNearLimit
                          ? `⚠️ Использовано ${Math.round(rawPct)}%, осталось ${formatCurrency(remaining)}`
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
                    className={`h-2 rounded-full ${isOver ? 'bg-red-500' : isNearLimit ? 'bg-amber-500' : 'bg-blue-500'}`}
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
        {showSmartLimits && (
          <SmartLimitsSheet
            onClose={() => setShowSmartLimits(false)}
            onApply={applyRecommendations}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
