import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useFinanceStore } from '@/features/finance/store';
import { useUIStore } from '@/features/ui/store';
import { formatCurrency } from '@/shared/utils/format';

const GOAL_ICONS = ['🏠', '🚗', '✈️', '💍', '📱', '💻', '🎓', '🏖️', '💰', '🎯', '🏋️', '🎸'];
const GOAL_COLORS = [
  '#6C63FF', '#FF6B35', '#00C896', '#FF4757', '#FFB800', '#EC4899',
  '#06B6D4', '#84CC16', '#F97316', '#9B59B6',
];

function AddGoalModal({ onClose }: { onClose: () => void }) {
  const { addGoal } = useFinanceStore();
  const { openModal, closeModal } = useUIStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [icon, setIcon] = useState('🎯');
  const [color, setColor] = useState('#6C63FF');

  const handleSubmit = () => {
    if (!name.trim() || !targetAmount) return;
    addGoal({
      name: name.trim(),
      icon,
      targetAmount: parseFloat(targetAmount),
      currentAmount: parseFloat(currentAmount) || 0,
      ...(deadline ? { deadline } : {}),
      color,
    });
    onClose();
  };

  useEffect(() => {
    openModal();
    return () => closeModal();
  }, [openModal, closeModal]);

  // Block background scroll in Telegram WebView (passive:false required for preventDefault)
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const prevent = (e: TouchEvent) => {
      // Allow scroll only inside the scrollable div
      if (scrollRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
    };
    overlay.addEventListener('touchmove', prevent, { passive: false });
    return () => overlay.removeEventListener('touchmove', prevent);
  }, []);

  return createPortal(
    <motion.div
      ref={overlayRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(26,26,46,0.6)', backdropFilter: 'blur(4px)', touchAction: 'none' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full bg-white rounded-t-3xl"
        style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle — fixed, not scrollable */}
        <div className="flex-shrink-0 pt-4 pb-2 px-6">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 pb-4"
          style={{
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'none',
            touchAction: 'pan-y',
          }}
        >
          <h2 className="text-xl font-bold text-gray-900 mb-5">✨ Новая цель</h2>

          {/* Icon picker */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Иконка</div>
            <div className="flex flex-wrap gap-2">
              {GOAL_ICONS.map((ic) => (
                <button
                  key={ic}
                  onClick={() => setIcon(ic)}
                  className={`w-11 h-11 rounded-2xl text-xl flex items-center justify-center haptic transition-all ${
                    icon === ic ? 'ring-2 scale-110' : 'bg-gray-100'
                  }`}
                  style={icon === ic ? { background: color + '20', outline: `2px solid ${color}` } : {}}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Цвет</div>
            <div className="flex gap-2 flex-wrap">
              {GOAL_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-9 h-9 rounded-full haptic transition-all"
                  style={{
                    backgroundColor: c,
                    boxShadow: color === c ? `0 0 0 3px white, 0 0 0 5px ${c}` : 'none',
                    transform: color === c ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Название</div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Новый iPhone"
              className="w-full rounded-2xl px-4 py-3 text-gray-800 outline-none placeholder-gray-300 font-medium"
              style={{ background: '#F8F7FF', border: '1.5px solid rgba(108,99,255,0.15)' }}
            />
          </div>

          {/* Target amount */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Целевая сумма</div>
            <div className="relative">
              <input
                type="number"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded-2xl px-4 py-3 text-gray-800 outline-none placeholder-gray-300 font-medium pr-10"
                style={{ background: '#F8F7FF', border: '1.5px solid rgba(108,99,255,0.15)' }}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₽</span>
            </div>
          </div>

          {/* Current amount */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Уже накоплено</div>
            <div className="relative">
              <input
                type="number"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded-2xl px-4 py-3 text-gray-800 outline-none placeholder-gray-300 font-medium pr-10"
                style={{ background: '#F8F7FF', border: '1.5px solid rgba(108,99,255,0.15)' }}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₽</span>
            </div>
          </div>

          {/* Deadline */}
          <div className="mb-2">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Срок (необязательно)</div>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full rounded-2xl px-4 py-3 text-gray-800 outline-none font-medium"
              style={{ background: '#F8F7FF', border: '1.5px solid rgba(108,99,255,0.15)' }}
            />
          </div>
        </div>

        {/* Fixed footer — always visible, never scrolls away */}
        <div
          className="flex-shrink-0 px-6 pt-3 border-t border-gray-100"
          style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
        >
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSubmit}
            disabled={!name.trim() || !targetAmount}
            className="w-full text-white font-bold text-lg py-4 rounded-2xl haptic disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)' }}
          >
            Создать цель ✨
          </motion.button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

function AddToGoalModal({ goalId, goalName, goalColor, onClose }: {
  goalId: string; goalName: string; goalColor: string; onClose: () => void
}) {
  const { addToGoal } = useFinanceStore();
  const { openModal, closeModal } = useUIStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [amount, setAmount] = useState('');

  const handleAdd = () => {
    const n = parseFloat(amount);
    if (!n || n <= 0) return;
    addToGoal(goalId, n);
    onClose();
  };

  useEffect(() => {
    openModal();
    return () => closeModal();
  }, [openModal, closeModal]);

  // Block background scroll in Telegram WebView (passive:false required for preventDefault)
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const prevent = (e: TouchEvent) => {
      if (scrollRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
    };
    overlay.addEventListener('touchmove', prevent, { passive: false });
    return () => overlay.removeEventListener('touchmove', prevent);
  }, []);

  return createPortal(
    <motion.div
      ref={overlayRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(26,26,46,0.6)', backdropFilter: 'blur(4px)', touchAction: 'none' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full bg-white rounded-t-3xl"
        style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex-shrink-0 pt-4 pb-2 px-6">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 pb-4"
          style={{
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'none',
            touchAction: 'pan-y',
          }}
        >
          <h2 className="text-xl font-bold text-gray-900 mb-1">Пополнить цель</h2>
          <p className="text-gray-500 text-sm mb-5">{goalName}</p>

          <div className="relative mb-4">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              autoFocus
              className="w-full rounded-2xl px-4 py-4 text-3xl font-bold text-gray-800 outline-none placeholder-gray-200 pr-12 text-center"
              style={{ background: '#F8F7FF', border: `2px solid ${goalColor}30` }}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xl">₽</span>
          </div>

          <div className="flex gap-2">
            {[500, 1000, 5000, 10000].map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(String(preset))}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold haptic transition-all"
                style={{
                  background: amount === String(preset) ? goalColor : '#F3F4F6',
                  color: amount === String(preset) ? 'white' : '#374151',
                }}
              >
                {preset.toLocaleString('ru-RU')}
              </button>
            ))}
          </div>
        </div>

        {/* Fixed footer — always visible */}
        <div
          className="flex-shrink-0 px-6 pt-3 border-t border-gray-100"
          style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
        >
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleAdd}
            disabled={!amount || parseFloat(amount) <= 0}
            className="w-full text-white font-bold text-lg py-4 rounded-2xl haptic disabled:opacity-40"
            style={{ background: `linear-gradient(135deg, ${goalColor}, ${goalColor}CC)` }}
          >
            Пополнить 💰
          </motion.button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

export function GoalsPage() {
  const { goals, deleteGoal } = useFinanceStore();
  const [showAdd, setShowAdd] = useState(false);
  const [addToGoalId, setAddToGoalId] = useState<string | null>(null);

  const addToGoalData = addToGoalId ? goals.find((g) => g.id === addToGoalId) : null;
  const totalSaved = goals.reduce((s, g) => s + g.currentAmount, 0);
  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);

  return (
    <div className="px-4 pt-5 pb-4" style={{ background: 'var(--bg-warm)', minHeight: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">🎯 Мои цели</h1>
          {goals.length > 0 && (
            <div className="text-xs text-gray-400 mt-0.5">
              Накоплено {formatCurrency(totalSaved)} из {formatCurrency(totalTarget)}
            </div>
          )}
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl text-white text-sm font-semibold haptic"
          style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)' }}
        >
          <span>+</span>
          <span>Новая</span>
        </motion.button>
      </div>

      {goals.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16"
        >
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ repeat: Infinity, duration: 3 }}
            className="text-6xl mb-4"
          >
            🎯
          </motion.div>
          <div className="font-bold text-gray-700 text-lg mb-2">Нет целей</div>
          <div className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">
            Поставь финансовую цель и я помогу тебе её достичь быстрее
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowAdd(true)}
            className="inline-block text-white font-bold px-8 py-3.5 rounded-2xl haptic shadow-lg"
            style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)', boxShadow: '0 4px 20px rgba(108,99,255,0.35)' }}
          >
            Создать первую цель ✨
          </motion.button>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {goals.map((goal, i) => {
            const progress = goal.targetAmount > 0
              ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
              : 0;
            const remaining = goal.targetAmount - goal.currentAmount;
            const isCompleted = progress >= 100;

            // Calculate months to goal (rough estimate)
            const monthsLeft = goal.deadline
              ? Math.max(0, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)))
              : null;

            return (
              <motion.div
                key={goal.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="bg-white rounded-2xl overflow-hidden"
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                {/* Color accent top bar */}
                <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${goal.color}, ${goal.color}80)` }} />

                <div className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                      style={{ backgroundColor: goal.color + '18' }}
                    >
                      {goal.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900 truncate">{goal.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {goal.deadline
                          ? `📅 до ${new Date(goal.deadline).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}${monthsLeft !== null ? ` · ${monthsLeft} мес.` : ''}`
                          : '📅 Без срока'}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-lg" style={{ color: isCompleted ? '#00C896' : goal.color }}>
                        {Math.round(progress)}%
                      </div>
                      {isCompleted && <div className="text-xs text-green-500 font-medium">✅ Готово!</div>}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-gray-100 rounded-full h-2.5 mb-2 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 1, delay: i * 0.07 + 0.2, ease: 'easeOut' }}
                      className="h-2.5 rounded-full"
                      style={{ background: `linear-gradient(90deg, ${goal.color}, ${goal.color}CC)` }}
                    />
                  </div>

                  <div className="flex justify-between text-xs text-gray-400 mb-3">
                    <span className="font-medium" style={{ color: goal.color }}>{formatCurrency(goal.currentAmount)}</span>
                    {!isCompleted && <span>осталось {formatCurrency(remaining)}</span>}
                    <span className="font-medium text-gray-600">{formatCurrency(goal.targetAmount)}</span>
                  </div>

                  <div className="flex gap-2">
                    {!isCompleted && (
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setAddToGoalId(goal.id)}
                        className="flex-1 py-2.5 text-white text-sm font-bold rounded-xl haptic"
                        style={{ background: `linear-gradient(135deg, ${goal.color}, ${goal.color}CC)` }}
                      >
                        + Пополнить
                      </motion.button>
                    )}
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => deleteGoal(goal.id)}
                      className="w-10 h-10 rounded-xl flex items-center justify-center haptic text-sm"
                      style={{ background: '#FFF0EB', color: '#FF4757' }}
                    >
                      🗑
                    </motion.button>
                  </div>
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
            goalColor={addToGoalData.color}
            onClose={() => setAddToGoalId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
