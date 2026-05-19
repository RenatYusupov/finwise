import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useFinanceStore, EXPENSE_CATEGORIES, INCOME_CATEGORIES, type Transaction } from '@/features/finance/store';
import { formatCurrency } from '@/shared/utils/format';

// ─── Edit Transaction Sheet ───────────────────────────────────────────────────

function EditTransactionSheet({
  tx,
  onClose,
}: {
  tx: Transaction;
  onClose: () => void;
}) {
  const { updateTransaction } = useFinanceStore();

  const [type, setType] = useState<'expense' | 'income'>(tx.type);
  const [amount, setAmount] = useState(String(tx.amount));
  const [description, setDescription] = useState(tx.description || '');
  const [categoryId, setCategoryId] = useState(tx.categoryId || '');
  const [date, setDate] = useState(tx.date.slice(0, 10));
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const selectedCat = cats.find((c) => c.id === categoryId);

  // Keyboard-aware layout: listen to visualViewport resize
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const kbHeight = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardHeight(kbHeight);
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, []);

  // When type changes, reset category if it doesn't belong to new type
  useEffect(() => {
    const newCats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    if (!newCats.find((c) => c.id === categoryId)) {
      setCategoryId(newCats[0]?.id ?? '');
    }
  }, [type, categoryId]);

  const handleSave = () => {
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!parsedAmount || parsedAmount <= 0) return;

    const categoryChanged = categoryId !== tx.categoryId;
    updateTransaction(tx.id, {
      type,
      amount: parsedAmount,
      description: description.trim(),
      categoryId,
      date: new Date(date).toISOString(),
      ...(categoryChanged ? { userCorrected: true } : {}),
    });
    onClose();
  };

  const isValid = parseFloat(amount.replace(',', '.')) > 0 && date;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(26,26,46,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full bg-white rounded-t-3xl flex flex-col"
        style={{
          maxHeight: '92vh',
          paddingBottom: keyboardHeight > 0
            ? `${keyboardHeight}px`
            : 'calc(20px + env(safe-area-inset-bottom, 0px))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex-shrink-0 pt-3 pb-1 px-6">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
        </div>

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-gray-100">
          <button onClick={onClose} className="text-sm text-gray-400 haptic">Отмена</button>
          <h2 className="text-base font-bold text-gray-900">Редактировать</h2>
          <button
            onClick={handleSave}
            disabled={!isValid}
            className="text-sm font-bold haptic"
            style={{ color: isValid ? '#6C63FF' : '#C4C4C4' }}
          >
            Сохранить
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Type toggle */}
          <div className="flex gap-1 bg-gray-100 rounded-2xl p-1">
            {(['expense', 'income'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold haptic transition-all"
                style={{
                  background: type === t ? (t === 'expense' ? '#FF6B6B' : '#4CAF50') : 'transparent',
                  color: type === t ? '#fff' : '#6B7280',
                }}
              >
                {t === 'expense' ? '💸 Расход' : '💰 Доход'}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Сумма
            </label>
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                defaultValue={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-lg font-bold text-gray-900 pr-12 focus:outline-none focus:border-purple-400"
                placeholder="0"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">₽</span>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Описание
            </label>
            <input
              type="text"
              defaultValue={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-purple-400"
              placeholder="Например: Кофе в Starbucks"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Категория
            </label>
            <button
              onClick={() => setShowCatPicker(true)}
              className="w-full flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 haptic text-left"
            >
              <span className="text-2xl">{selectedCat?.icon ?? '📦'}</span>
              <span className="flex-1 text-sm font-medium text-gray-800">
                {selectedCat?.name ?? 'Выбрать категорию'}
              </span>
              <span className="text-gray-400 text-sm">›</span>
            </button>
          </div>

          {/* Date */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Дата
            </label>
            <input
              type="date"
              defaultValue={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-purple-400"
            />
          </div>
        </div>
      </motion.div>

      {/* Category picker overlay */}
      <AnimatePresence>
        {showCatPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-60 flex items-end"
            style={{ background: 'rgba(26,26,46,0.4)' }}
            onClick={() => setShowCatPicker(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="w-full bg-white rounded-t-3xl px-5 pt-4"
              style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', maxHeight: '70vh', overflowY: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Выберите категорию</div>
              <div className="grid grid-cols-4 gap-2 pb-2">
                {cats.map((cat) => (
                  <motion.button
                    key={cat.id}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => { setCategoryId(cat.id); setShowCatPicker(false); }}
                    className="flex flex-col items-center gap-1 py-3 rounded-2xl haptic"
                    style={{
                      background: categoryId === cat.id ? '#6C63FF' : '#F3F4F6',
                      color: categoryId === cat.id ? '#fff' : '#374151',
                    }}
                  >
                    <span className="text-xl leading-none">{cat.icon}</span>
                    <span className="text-xs font-medium leading-tight text-center px-1">{cat.name}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body
  );
}

// ─── Swipeable Transaction Row ────────────────────────────────────────────────

function SwipeableRow({
  tx,
  onEdit,
  onDelete,
}: {
  tx: Transaction;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [swipeX, setSwipeX] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isHorizontalRef = useRef<boolean | null>(null);

  const ACTION_PANEL_WIDTH = 140; // px — width of the revealed action panel
  const SWIPE_THRESHOLD = 50;    // px — minimum swipe to reveal panel

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0]!.clientX;
    startYRef.current = e.touches[0]!.clientY;
    isDraggingRef.current = true;
    isHorizontalRef.current = null;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.touches[0]!.clientX - startXRef.current;
    const dy = e.touches[0]!.clientY - startYRef.current;

    // Determine scroll direction on first significant move
    if (isHorizontalRef.current === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      isHorizontalRef.current = Math.abs(dx) > Math.abs(dy);
    }

    if (!isHorizontalRef.current) return; // vertical scroll — don't interfere

    // Only allow left swipe (negative dx)
    const clampedX = Math.max(-ACTION_PANEL_WIDTH, Math.min(0, dx + (swipeX < -SWIPE_THRESHOLD ? -ACTION_PANEL_WIDTH : 0)));
    setSwipeX(clampedX);
  }, [swipeX]);

  const handleTouchEnd = useCallback(() => {
    isDraggingRef.current = false;
    if (swipeX < -SWIPE_THRESHOLD) {
      setSwipeX(-ACTION_PANEL_WIDTH); // snap open
    } else {
      setSwipeX(0); // snap closed
    }
  }, [swipeX]);

  const close = useCallback(() => setSwipeX(0), []);

  const handleDelete = () => {
    if (confirmDelete) {
      onDelete();
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  return (
    <div className="relative overflow-hidden border-b border-gray-50 last:border-0">
      {/* Action panel — revealed on swipe */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-stretch"
        style={{ width: ACTION_PANEL_WIDTH }}
      >
        <button
          onClick={() => { close(); onEdit(); }}
          className="flex-1 flex flex-col items-center justify-center gap-1 haptic"
          style={{ background: '#6C63FF' }}
        >
          <span className="text-lg">✏️</span>
          <span className="text-xs font-semibold text-white">Изменить</span>
        </button>
        <button
          onClick={handleDelete}
          className="flex-1 flex flex-col items-center justify-center gap-1 haptic transition-colors"
          style={{ background: confirmDelete ? '#DC2626' : '#FF6B6B' }}
        >
          <span className="text-lg">{confirmDelete ? '✓' : '🗑️'}</span>
          <span className="text-xs font-semibold text-white">{confirmDelete ? 'Точно?' : 'Удалить'}</span>
        </button>
      </div>

      {/* Row content — slides left on swipe */}
      <motion.div
        animate={{ x: swipeX }}
        transition={{ type: 'spring', damping: 30, stiffness: 400, mass: 0.8 }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => {
          if (swipeX < -10) { close(); return; }
          onEdit();
        }}
        className="flex items-center gap-3 px-4 py-3 bg-white active:bg-gray-50 transition-colors cursor-pointer"
        style={{ touchAction: 'pan-y' }}
      >
        {/* Category icon */}
        <div
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl flex-shrink-0"
          style={{ boxShadow: '0 0 0 2px rgba(108,99,255,0.12)' }}
        >
          {tx.category?.icon ?? (tx.type === 'income' ? '💚' : '💸')}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 truncate text-sm">
            {tx.description || tx.category?.name || 'Операция'}
          </div>
          <div className="text-xs text-gray-400 flex items-center gap-1">
            <span>{tx.category?.name}</span>
            {tx.userCorrected && (
              <span className="text-purple-400 text-xs">· ✓ исправлено</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className={`font-semibold text-sm ${tx.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
            {tx.type === 'income' ? '+' : '−'}{formatCurrency(tx.amount)}
          </div>
          {/* Swipe hint chevron */}
          <span className="text-gray-300 text-xs select-none">‹</span>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Transactions Page ────────────────────────────────────────────────────────

export function TransactionsPage() {
  const { transactions, deleteTransaction, getMonthSummary } = useFinanceStore();
  const [filter, setFilter] = useState<'all' | 'expense' | 'income'>('all');
  const [editTx, setEditTx] = useState<Transaction | null>(null);

  const summary = getMonthSummary();

  const filtered = transactions.filter((t) => filter === 'all' || t.type === filter);

  // Group by date
  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, tx) => {
    const date = new Date(tx.date).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    if (!acc[date]) acc[date] = [];
    acc[date]!.push(tx);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">💳 Операции</h1>
          <Link
            to="/transactions/add"
            className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl haptic"
          >
            +
          </Link>
        </div>

        {/* Summary */}
        <div className="flex gap-3">
          <div className="flex-1 bg-green-50 rounded-xl p-3 text-center">
            <div className="text-xs text-green-600 mb-0.5">Доходы</div>
            <div className="font-bold text-green-700 text-sm">{formatCurrency(summary.income)}</div>
          </div>
          <div className="flex-1 bg-red-50 rounded-xl p-3 text-center">
            <div className="text-xs text-red-500 mb-0.5">Расходы</div>
            <div className="font-bold text-red-600 text-sm">{formatCurrency(summary.expenses)}</div>
          </div>
          <div className={`flex-1 rounded-xl p-3 text-center ${summary.savings >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
            <div className={`text-xs mb-0.5 ${summary.savings >= 0 ? 'text-blue-600' : 'text-orange-500'}`}>Баланс</div>
            <div className={`font-bold text-sm ${summary.savings >= 0 ? 'text-blue-700' : 'text-orange-600'}`}>
              {summary.savings >= 0 ? '+' : ''}{formatCurrency(summary.savings)}
            </div>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mx-4 mt-3 bg-gray-100 rounded-2xl p-1">
        {[
          { label: 'Все', value: 'all' as const },
          { label: 'Расходы', value: 'expense' as const },
          { label: 'Доходы', value: 'income' as const },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold haptic transition-all ${
              filter === tab.value ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Swipe hint */}
      {filtered.length > 0 && (
        <div className="mx-4 mt-2 mb-1 flex items-center gap-1.5 text-xs text-gray-400">
          <span>←</span>
          <span>Свайп влево — изменить или удалить</span>
        </div>
      )}

      {/* Transactions list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">💸</div>
            <div className="font-medium text-gray-600 mb-1">Нет операций</div>
            <div className="text-sm mb-4">Добавь первую транзакцию</div>
            <Link
              to="/transactions/add"
              className="inline-block bg-blue-600 text-white font-semibold px-5 py-2.5 rounded-xl haptic text-sm"
            >
              + Добавить
            </Link>
          </div>
        ) : (
          Object.entries(grouped).map(([date, txs]) => (
            <div key={date}>
              <div className="text-xs font-semibold text-gray-400 uppercase mb-2 px-1">{date}</div>
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                <AnimatePresence>
                  {txs.map((tx, i) => (
                    <motion.div
                      key={tx.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20, height: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <SwipeableRow
                        tx={tx}
                        onEdit={() => setEditTx(tx)}
                        onDelete={() => deleteTransaction(tx.id)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit transaction sheet */}
      <AnimatePresence>
        {editTx && (
          <EditTransactionSheet
            tx={editTx}
            onClose={() => setEditTx(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
