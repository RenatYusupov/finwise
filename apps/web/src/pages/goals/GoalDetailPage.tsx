import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useFinanceStore, EXPENSE_CATEGORIES, type Goal } from '@/features/finance/store';
import { formatCurrency } from '@/shared/utils/format';
import { apiClient } from '@/shared/api/client';

// ─── AI Goal Plan ─────────────────────────────────────────────────────────────

interface GoalPlanRecommendation {
  category: string;
  currentSpend: number;
  suggestedCut: number;
  impact: string;
}

interface GoalPlan {
  monthlyContribution: number;
  estimatedCompletionDate: string;
  isAchievableByDeadline: boolean;
  recommendations: GoalPlanRecommendation[];
  summary: string;
}

function AiGoalPlanCard({ goal }: { goal: Goal }) {
  const [plan, setPlan] = useState<GoalPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const { transactions } = useFinanceStore();

  const generatePlan = async () => {
    setLoading(true);
    setError(null);
    try {
      // Build local summary for the AI
      const now = new Date();
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      const recentTxs = transactions.filter((t) => new Date(t.date) >= threeMonthsAgo);
      const income = recentTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0) / 3;
      const expenses = recentTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0) / 3;

      const res = await apiClient.post('/ai/goal-plan', {
        goalId: goal.id,
        goalTitle: goal.name,
        targetAmount: goal.targetAmount,
        currentAmount: goal.currentAmount,
        deadline: goal.deadline,
        monthlyIncome: income,
        monthlyExpenses: expenses,
      });
      setPlan(res.data);
    } catch {
      // Fallback: compute locally
      const remaining = goal.targetAmount - goal.currentAmount;
      const monthsToDeadline = goal.deadline
        ? Math.max(1, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)))
        : 12;
      const monthlyContribution = Math.ceil(remaining / monthsToDeadline);

      setPlan({
        monthlyContribution,
        estimatedCompletionDate: new Date(Date.now() + monthsToDeadline * 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
        isAchievableByDeadline: true,
        recommendations: [],
        summary: `Для достижения цели нужно откладывать ${formatCurrency(monthlyContribution)}/месяц.`,
      });
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  if (goal.currentAmount >= goal.targetAmount) return null;

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <div className="text-sm font-bold text-gray-800">✨ AI-план достижения</div>
        {plan && (
          <button onClick={() => setExpanded((v) => !v)} className="text-xs text-gray-400 haptic">
            {expanded ? 'Свернуть' : 'Развернуть'}
          </button>
        )}
      </div>

      <AnimatePresence>
        {(!plan || expanded) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-3">
              {!plan && !loading && (
                <div className="text-center py-2">
                  <div className="text-sm text-gray-500 mb-3">
                    AI проанализирует ваши доходы и расходы и составит персональный план
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={generatePlan}
                    className="px-6 py-2.5 rounded-2xl text-white text-sm font-bold haptic"
                    style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)' }}
                  >
                    ✨ Составить план
                  </motion.button>
                </div>
              )}

              {loading && (
                <div className="text-center py-4">
                  <div className="text-2xl mb-2 animate-pulse">🤖</div>
                  <div className="text-sm text-gray-500">Анализирую данные...</div>
                </div>
              )}

              {error && (
                <div className="text-sm text-red-500 text-center py-2">{error}</div>
              )}

              {plan && (
                <div className="space-y-3">
                  <div className="bg-purple-50 rounded-xl p-3">
                    <div className="text-xs text-purple-500 font-semibold mb-1">Ежемесячный взнос</div>
                    <div className="text-2xl font-bold text-purple-700">
                      {formatCurrency(plan.monthlyContribution)}/мес
                    </div>
                  </div>

                  <div className="text-sm text-gray-600 leading-relaxed">{plan.summary}</div>

                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400">📅 Достижение:</span>
                    <span className="font-semibold text-gray-800">
                      {new Date(plan.estimatedCompletionDate).toLocaleDateString('ru-RU', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                    {goal.deadline && !plan.isAchievableByDeadline && (
                      <span className="text-red-500 text-xs">⚠️ Позже дедлайна</span>
                    )}
                  </div>

                  {plan.recommendations.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Рекомендации по экономии
                      </div>
                      {plan.recommendations.map((rec, i) => {
                        const cat = EXPENSE_CATEGORIES.find((c) => c.id === rec.category);
                        return (
                          <div key={i} className="bg-gray-50 rounded-xl p-3 text-sm">
                            <div className="flex items-center gap-2 mb-1">
                              <span>{cat?.icon ?? '📦'}</span>
                              <span className="font-semibold text-gray-800">{cat?.name ?? rec.category}</span>
                              <span className="text-gray-400 text-xs ml-auto">
                                −{formatCurrency(rec.suggestedCut)}/мес
                              </span>
                            </div>
                            <div className="text-xs text-green-600">{rec.impact}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={generatePlan}
                    className="w-full py-2 rounded-xl text-sm font-semibold text-purple-600 bg-purple-50 haptic"
                  >
                    🔄 Обновить план
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Linked Category Section ──────────────────────────────────────────────────

function LinkedCategorySection({ goal }: { goal: Goal }) {
  const { updateGoal, transactions } = useFinanceStore();
  const [showPicker, setShowPicker] = useState(false);

  const linkedCat = goal.linkedCategoryId
    ? EXPENSE_CATEGORIES.find((c) => c.id === goal.linkedCategoryId)
    : null;

  // History of transactions that contributed to this goal
  const contributingTxs = goal.linkedCategoryId
    ? transactions
        .filter((t) => {
          if (t.categoryId !== goal.linkedCategoryId) return false;
          if (goal.linkedSince && t.date < goal.linkedSince) return false;
          if (goal.linkedCategoryMode === 'savings' && t.type !== 'income') return false;
          return true;
        })
        .slice(0, 10)
    : [];

  const handleLink = (categoryId: string) => {
    updateGoal(goal.id, {
      linkedCategoryId: categoryId,
      linkedCategoryMode: 'savings',
      linkedSince: new Date().toISOString().slice(0, 10),
    });
    setShowPicker(false);
  };

  const handleUnlink = () => {
    updateGoal(goal.id, {
      linkedCategoryId: undefined,
      linkedCategoryMode: undefined,
      linkedSince: undefined,
    } as unknown as Partial<typeof goal>);
  };

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-gray-50">
        <div className="text-sm font-bold text-gray-800">🔗 Связанная категория</div>
      </div>
      <div className="p-4 space-y-3">
        {linkedCat ? (
          <>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                style={{ backgroundColor: linkedCat.color + '18' }}
              >
                {linkedCat.icon}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-800">{linkedCat.name}</div>
                <div className="text-xs text-gray-400">
                  {goal.linkedCategoryMode === 'savings' ? 'Накопление' : 'Контроль расходов'}
                </div>
              </div>
              <button
                onClick={handleUnlink}
                className="text-xs text-red-400 haptic px-2 py-1 rounded-lg bg-red-50"
              >
                Отвязать
              </button>
            </div>

            {contributingTxs.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  История взносов
                </div>
                {contributingTxs.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                    <div className="text-gray-600 truncate flex-1">{tx.description || linkedCat.name}</div>
                    <div className="text-xs text-gray-400 mx-2">
                      {new Date(tx.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                    </div>
                    <div className="text-green-600 font-semibold">+{formatCurrency(tx.amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-2">
            <div className="text-sm text-gray-500 mb-3">
              Привяжи категорию — транзакции будут автоматически учитываться в прогрессе
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowPicker(true)}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-purple-600 bg-purple-50 haptic"
            >
              + Привязать категорию
            </motion.button>
          </div>
        )}

        <AnimatePresence>
          {showPicker && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="border-t border-gray-100 pt-3"
            >
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Выбери категорию
              </div>
              <div className="grid grid-cols-4 gap-2">
                {EXPENSE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleLink(cat.id)}
                    className="flex flex-col items-center gap-1 p-2 rounded-xl haptic active:bg-gray-100"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                      style={{ backgroundColor: cat.color + '18' }}
                    >
                      {cat.icon}
                    </div>
                    <div className="text-[10px] text-gray-500 text-center leading-tight">{cat.name}</div>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowPicker(false)}
                className="w-full mt-2 py-2 text-sm text-gray-400 haptic"
              >
                Отмена
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { goals, addToGoal } = useFinanceStore();
  const [depositAmount, setDepositAmount] = useState('');

  const goal = goals.find((g) => g.id === id);

  useEffect(() => {
    if (!goal && id) navigate('/goals', { replace: true });
  }, [goal, id, navigate]);

  if (!goal) {
    return (
      <div className="px-4 pt-6 space-y-4">
        <div className="h-8 bg-gray-100 rounded-xl animate-pulse w-1/2" />
        <div className="h-40 bg-gray-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  const progress = goal.targetAmount > 0
    ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
    : 0;
  const remaining = goal.targetAmount - goal.currentAmount;
  const isCompleted = progress >= 100;

  const handleDeposit = () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) return;
    addToGoal(goal.id, amount);
    setDepositAmount('');
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-4 bg-white border-b border-gray-100">
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center haptic text-lg"
        >
          ←
        </motion.button>
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center text-2xl"
          style={{ backgroundColor: goal.color + '18' }}
        >
          {goal.icon}
        </div>
        <h1 className="text-lg font-bold text-gray-900 flex-1 truncate">{goal.name}</h1>
        {isCompleted && <div className="text-green-500 text-sm font-bold">✅ Готово!</div>}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6 space-y-3">
        {/* Progress card */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-end mb-3">
            <div>
              <div className="text-gray-400 text-sm">Накоплено</div>
              <div className="text-2xl font-bold text-gray-900">{formatCurrency(goal.currentAmount)}</div>
            </div>
            <div className="text-right">
              <div className="text-gray-400 text-sm">Цель</div>
              <div className="text-lg font-semibold text-gray-700">{formatCurrency(goal.targetAmount)}</div>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 mb-2 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1 }}
              className="h-3 rounded-full"
              style={{ background: `linear-gradient(90deg, ${goal.color}, ${goal.color}CC)` }}
            />
          </div>
          <div className="flex justify-between text-sm text-gray-500">
            <span style={{ color: goal.color }}>{Math.round(progress)}% выполнено</span>
            {!isCompleted && <span>осталось {formatCurrency(remaining)}</span>}
          </div>
        </div>

        {/* Deadline */}
        {goal.deadline && (
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <div className="text-2xl">📅</div>
            <div>
              <div className="text-sm text-gray-400">Срок</div>
              <div className="font-semibold text-gray-900">
                {new Date(goal.deadline).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </div>
            </div>
          </div>
        )}

        {/* Manual deposit */}
        {!isCompleted && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="text-sm font-medium text-gray-500 mb-3">+ Добавить взнос</div>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="Сумма"
                  className="flex-1 bg-transparent outline-none text-gray-800"
                  style={{ fontSize: '16px' }}
                />
                <span className="text-gray-400">₽</span>
              </div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleDeposit}
                disabled={!depositAmount}
                className="text-white font-semibold px-4 py-2 rounded-xl haptic disabled:opacity-40"
                style={{ background: `linear-gradient(135deg, ${goal.color}, ${goal.color}CC)` }}
              >
                +
              </motion.button>
            </div>
            <div className="flex gap-2 mt-2">
              {[1000, 5000, 10000].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setDepositAmount(String(preset))}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold haptic"
                  style={{
                    background: depositAmount === String(preset) ? goal.color : '#F3F4F6',
                    color: depositAmount === String(preset) ? 'white' : '#6B7280',
                  }}
                >
                  {preset.toLocaleString('ru-RU')}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Linked category (TASK-023) */}
        <LinkedCategorySection goal={goal} />

        {/* AI plan (TASK-018) */}
        <AiGoalPlanCard goal={goal} />
      </div>
    </div>
  );
}
