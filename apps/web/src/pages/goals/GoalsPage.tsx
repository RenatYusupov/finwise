import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFinanceStore } from '@/features/finance/store';
import { formatCurrency } from '@/shared/utils/format';

const GOAL_ICONS = ['🏠', '🚗', '✈️', '💍', '📱', '💻', '🎓', '🏖️', '💰', '🎯', '🏋️', '🎸'];
const GOAL_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899',
  '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

function AddGoalModal({ onClose }: { onClose: () => void }) {
  const { addGoal } = useFinanceStore();
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [icon, setIcon] = useState('🎯');
  const [color, setColor] = useState('#3B82F6');

  const handleSubmit = () => {
    if (!name.trim() || !targetAmount) return;
    addGoal({
      name: name.trim(),
      icon,
      targetAmount: parseFloat(targetAmount),
      currentAmount: parseFloat(currentAmount) || 0,
      deadline: deadline || undefined,
      color,
    });
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
        className="w-full bg-white rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-xl font-bold text-gray-900 mb-6">Новая цель</h2>

        {/* Icon picker */}
        <div className="mb-4">
          <div className="text-sm font-medium text-gray-500 mb-2">Иконка</div>
          <div className="flex flex-wrap gap-2">
            {GOAL_ICONS.map((ic) => (
              <button
                key={ic}
                onClick={() => setIcon(ic)}
                className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center haptic transition-all ${
                  icon === ic ? 'bg-blue-100 ring-2 ring-blue-500' : 'bg-gray-100'
                }`}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div className="mb-4">
          <div className="text-sm font-medium text-gray-500 mb-2">Название цели</div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Новый iPhone"
            className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-gray-800 outline-none placeholder-gray-400"
          />
        </div>

        {/* Target amount */}
        <div className="mb-4">
          <div className="text-sm font-medium text-gray-500 mb-2">Целевая сумма</div>
          <div className="relative">
            <input
              type="number"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="0"
              className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-gray-800 outline-none placeholder-gray-400 pr-10"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₽</span>
          </div>
        </div>

        {/* Current amount */}
        <div className="mb-4">
          <div className="text-sm font-medium text-gray-500 mb-2">Уже накоплено (необязательно)</div>
          <div className="relative">
            <input
              type="number"
              value={currentAmount}
              onChange={(e) => setCurrentAmount(e.target.value)}
              placeholder="0"
              className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-gray-800 outline-none placeholder-gray-400 pr-10"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₽</span>
          </div>
        </div>

        {/* Deadline */}
        <div className="mb-6">
          <div className="text-sm font-medium text-gray-500 mb-2">Срок (необязательно)</div>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full bg-gray-100 rounded-2xl px-4 py-3 text-gray-800 outline-none"
          />
        </div>

        {/* Color */}
        <div className="mb-6">
          <div className="text-sm font-medium text-gray-500 mb-2">Цвет</div>
          <div className="flex gap-2 flex-wrap">
            {GOAL_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full haptic transition-all ${
                  color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSubmit}
          disabled={!name.trim() || !targetAmount}
          className="w-full bg-blue-600 text-white font-semibold text-lg py-4 rounded-2xl haptic disabled:opacity-40"
        >
          Создать цель
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

function AddToGoalModal({ goalId, goalName, onClose }: { goalId: string; goalName: string; onClose: () => void }) {
  const { addToGoal } = useFinanceStore();
  const [amount, setAmount] = useState('');

  const handleAdd = () => {
    const n = parseFloat(amount);
    if (!n || n <= 0) return;
    addToGoal(goalId, n);
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
        className="w-full bg-white rounded-t-3xl p-6"
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Пополнить цель</h2>
        <p className="text-gray-500 text-sm mb-6">{goalName}</p>

        <div className="relative mb-6">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            autoFocus
            className="w-full bg-gray-100 rounded-2xl px-4 py-4 text-2xl font-bold text-gray-800 outline-none placeholder-gray-300 pr-12 text-center"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xl">₽</span>
        </div>

        <div className="flex gap-2 mb-6">
          {[500, 1000, 5000, 10000].map((preset) => (
            <button
              key={preset}
              onClick={() => setAmount(String(preset))}
              className="flex-1 py-2 bg-gray-100 rounded-xl text-sm font-medium text-gray-700 haptic"
            >
              {preset.toLocaleString('ru-RU')}
            </button>
          ))}
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleAdd}
          disabled={!amount || parseFloat(amount) <= 0}
          className="w-full bg-blue-600 text-white font-semibold text-lg py-4 rounded-2xl haptic disabled:opacity-40"
        >
          Пополнить
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

export function GoalsPage() {
  const { goals, deleteGoal } = useFinanceStore();
  const [showAdd, setShowAdd] = useState(false);
  const [addToGoalId, setAddToGoalId] = useState<string | null>(null);

  const addToGoalData = addToGoalId ? goals.find((g) => g.id === addToGoalId) : null;

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">🎯 Мои цели</h1>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowAdd(true)}
          className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl haptic"
        >
          +
        </motion.button>
      </div>

      {goals.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-4">🎯</div>
          <div className="font-medium text-gray-600 mb-1">Нет целей</div>
          <div className="text-sm mb-6">Поставь первую финансовую цель</div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowAdd(true)}
            className="inline-block bg-blue-600 text-white font-semibold px-6 py-3 rounded-2xl haptic"
          >
            Создать цель
          </motion.button>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((goal, i) => {
            const progress = goal.targetAmount > 0
              ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
              : 0;
            const remaining = goal.targetAmount - goal.currentAmount;
            const isCompleted = progress >= 100;

            return (
              <motion.div
                key={goal.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="bg-white rounded-2xl p-4 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                    style={{ backgroundColor: goal.color + '20' }}
                  >
                    {goal.icon}
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
                    {isCompleted && <div className="text-xs text-green-500">✅ Готово!</div>}
                  </div>
                </div>

                <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.8, delay: i * 0.07 + 0.2 }}
                    className="h-2 rounded-full"
                    style={{ backgroundColor: goal.color }}
                  />
                </div>

                <div className="flex justify-between text-xs text-gray-500 mb-3">
                  <span>{formatCurrency(goal.currentAmount)}</span>
                  {!isCompleted && <span>осталось {formatCurrency(remaining)}</span>}
                  <span>{formatCurrency(goal.targetAmount)}</span>
                </div>

                <div className="flex gap-2">
                  {!isCompleted && (
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setAddToGoalId(goal.id)}
                      className="flex-1 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl haptic"
                    >
                      + Пополнить
                    </motion.button>
                  )}
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => deleteGoal(goal.id)}
                    className="w-9 h-9 bg-red-50 text-red-400 rounded-xl flex items-center justify-center haptic text-sm"
                  >
                    🗑
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {showAdd && <AddGoalModal onClose={() => setShowAdd(false)} />}
        {addToGoalData && (
          <AddToGoalModal
            goalId={addToGoalData.id}
            goalName={`${addToGoalData.icon} ${addToGoalData.name}`}
            onClose={() => setAddToGoalId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
