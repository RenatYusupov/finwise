import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useFinanceStore, EXPENSE_CATEGORIES, INCOME_CATEGORIES, type Transaction } from '@/features/finance/store';
import { formatCurrency } from '@/shared/utils/format';

type TxPeriod = 'all' | 'week' | 'month' | 'prev_month' | 'custom';
type TxSort = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

type TxFilters = {
  type: 'all' | 'expense' | 'income';
  categoryIds: string[];
  period: TxPeriod;
  from: string;
  to: string;
  minAmount: string;
  maxAmount: string;
  sort: TxSort;
};

const DEFAULT_FILTERS: TxFilters = {
  type: 'all',
  categoryIds: [],
  period: 'all',
  from: '',
  to: '',
  minAmount: '',
  maxAmount: '',
  sort: 'date_desc',
};

const FILTERS_STORAGE_KEY = 'fw_transactions_filters_v1';

function loadFilters(): TxFilters {
  try {
    const raw = sessionStorage.getItem(FILTERS_STORAGE_KEY);
    return raw ? { ...DEFAULT_FILTERS, ...JSON.parse(raw) } : DEFAULT_FILTERS;
  } catch {
    return DEFAULT_FILTERS;
  }
}

function periodRange(period: TxPeriod, customFrom: string, customTo: string): { from?: Date; to?: Date } {
  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (period === 'week') {
    const from = new Date(now);
    from.setDate(now.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return { from, to: todayEnd };
  }
  if (period === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: todayEnd };
  if (period === 'prev_month') return {
    from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
  };
  if (period === 'custom') {
    const range: { from?: Date; to?: Date } = {};
    if (customFrom) range.from = new Date(customFrom);
    if (customTo) range.to = new Date(`${customTo}T23:59:59.999`);
    return range;
  }
  return {};
}

// ─── Edit Transaction Sheet ───────────────────────────────────────────────────

export function EditTransactionSheet({
  tx,
  onClose,
  onDelete,
}: {
  tx: Transaction;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const { updateTransaction } = useFinanceStore();

  const [type, setType] = useState<'expense' | 'income'>(tx.type === 'transfer' ? 'expense' : tx.type);
  const [amount, setAmount] = useState(String(tx.amount));
  const [description, setDescription] = useState(tx.description || '');
  const [categoryId, setCategoryId] = useState(tx.categoryId || '');
  const [date, setDate] = useState(tx.date.slice(0, 10));
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const selectedCat = cats.find((c) => c.id === categoryId);

  // Telegram BackButton: close sheet on back press
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    if (showCatPicker) {
      tg.BackButton.show();
      const handler = () => setShowCatPicker(false);
      tg.BackButton.onClick(handler);
      return () => { tg.BackButton.offClick(handler); tg.BackButton.hide(); };
    } else {
      tg.BackButton.show();
      const handler = () => onClose();
      tg.BackButton.onClick(handler);
      return () => { tg.BackButton.offClick(handler); tg.BackButton.hide(); };
    }
  }, [showCatPicker, onClose]);

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

  const handleDelete = () => {
    if (confirmDelete) {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
      onDelete?.();
      onClose();
    } else {
      setConfirmDelete(true);
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
      setTimeout(() => setConfirmDelete(false), 3000);
    }
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
                style={{ fontSize: '16px' }}
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
              style={{ fontSize: '16px' }}
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
              style={{ fontSize: '16px' }}
            />
          </div>

          {/* Delete button — only shown when onDelete is provided */}
          {onDelete && (
            <button
              onClick={handleDelete}
              className="w-full py-3 rounded-2xl text-sm font-semibold haptic mt-2 transition-all"
              style={{
                background: confirmDelete ? '#EF4444' : '#FEE2E2',
                color: confirmDelete ? '#fff' : '#EF4444',
              }}
            >
              {confirmDelete ? '✓ Подтвердить удаление' : '🗑 Удалить операцию'}
            </button>
          )}
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

// ─── Tap Transaction Row ──────────────────────────────────────────────────────

export function TxRow({ tx, onTap }: { tx: Transaction; onTap: () => void }) {
  return (
    <div
      onClick={onTap}
      className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 active:bg-gray-50 cursor-pointer transition-colors"
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

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div className={`font-semibold text-sm ${tx.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
          {tx.type === 'income' ? '+' : '−'}{formatCurrency(tx.amount)}
        </div>
        <span className="text-gray-300 text-xs select-none">›</span>
      </div>
    </div>
  );
}

// ─── Transactions Page ────────────────────────────────────────────────────────

export function TransactionsPage() {
  const { transactions, deleteTransaction, getMonthSummary } = useFinanceStore();
  const [filters, setFilters] = useState<TxFilters>(() => loadFilters());
  const [searchInput, setSearchInput] = useState(() => sessionStorage.getItem('fw_transactions_search') ?? '');
  const [query, setQuery] = useState(searchInput);
  const [showFilters, setShowFilters] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);

  const summary = getMonthSummary();

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchInput.slice(0, 100);
      setQuery(trimmed);
      sessionStorage.setItem('fw_transactions_search', trimmed);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const { from, to } = periodRange(filters.period, filters.from, filters.to);
    const min = filters.minAmount ? Number(filters.minAmount) : null;
    const max = filters.maxAmount ? Number(filters.maxAmount) : null;

    return transactions
      .filter((t) => filters.type === 'all' || t.type === filters.type)
      .filter((t) => !q || t.description.toLowerCase().includes(q) || t.category?.name.toLowerCase().includes(q))
      .filter((t) => filters.categoryIds.length === 0 || filters.categoryIds.includes(t.categoryId))
      .filter((t) => {
        const d = new Date(t.date);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      })
      .filter((t) => min === null || t.amount >= min)
      .filter((t) => max === null || t.amount <= max)
      .sort((a, b) => {
        if (filters.sort === 'date_asc') return a.date.localeCompare(b.date);
        if (filters.sort === 'amount_desc') return b.amount - a.amount;
        if (filters.sort === 'amount_asc') return a.amount - b.amount;
        return b.date.localeCompare(a.date);
      });
  }, [transactions, filters, query]);

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSearchInput('');
    setQuery('');
    sessionStorage.removeItem(FILTERS_STORAGE_KEY);
    sessionStorage.removeItem('fw_transactions_search');
  };

  const allCategories = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
  const amountRangeInvalid = !!filters.minAmount && !!filters.maxAmount && Number(filters.minAmount) > Number(filters.maxAmount);
  const activeChips = [
    query ? { key: 'query', label: `Поиск: ${query}`, clear: () => { setSearchInput(''); setQuery(''); } } : null,
    filters.type !== 'all' ? { key: 'type', label: filters.type === 'expense' ? 'Расходы' : 'Доходы', clear: () => setFilters((f) => ({ ...f, type: 'all' })) } : null,
    ...filters.categoryIds.map((id) => ({ key: `cat-${id}`, label: allCategories.find((c) => c.id === id)?.name ?? id, clear: () => setFilters((f) => ({ ...f, categoryIds: f.categoryIds.filter((x) => x !== id) })) })),
    filters.period !== 'all' ? { key: 'period', label: filters.period === 'week' ? 'Эта неделя' : filters.period === 'month' ? 'Этот месяц' : filters.period === 'prev_month' ? 'Прошлый месяц' : 'Период', clear: () => setFilters((f) => ({ ...f, period: 'all', from: '', to: '' })) } : null,
    filters.minAmount ? { key: 'min', label: `от ${filters.minAmount} ₽`, clear: () => setFilters((f) => ({ ...f, minAmount: '' })) } : null,
    filters.maxAmount ? { key: 'max', label: `до ${filters.maxAmount} ₽`, clear: () => setFilters((f) => ({ ...f, maxAmount: '' })) } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; clear: () => void }>;

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

      {/* Search and filters */}
      <div className="sticky top-0 z-20 mx-4 mt-3 space-y-2">
        <div className="flex gap-2">
          <div className="flex-1 bg-white rounded-2xl px-3 py-2 flex items-center gap-2 shadow-sm">
            <span className="text-gray-400">🔍</span>
            <input
              defaultValue={searchInput}
              onInput={(e) => setSearchInput((e.target as HTMLInputElement).value.slice(0, 100))}
              placeholder="Поиск по описанию..."
              className="flex-1 text-[16px] outline-none bg-transparent text-sm"
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="px-3 rounded-2xl bg-white shadow-sm text-sm font-semibold text-gray-700 haptic"
          >
            Фильтры{showFilters ? '▲' : '▼'}
          </button>
        </div>

        {showFilters && (
          <div className="bg-white rounded-2xl p-3 shadow-sm space-y-3">
            <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-xl p-1">
              {[
                { label: 'Все', value: 'all' as const },
                { label: 'Расходы', value: 'expense' as const },
                { label: 'Доходы', value: 'income' as const },
              ].map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setFilters((f) => ({ ...f, type: tab.value }))}
                  className={`py-2 rounded-lg text-xs font-semibold haptic ${filters.type === tab.value ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div>
              <div className="text-xs font-bold text-gray-400 uppercase mb-2">Категории</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {allCategories.map((cat) => {
                  const active = filters.categoryIds.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setFilters((f) => ({ ...f, categoryIds: active ? f.categoryIds.filter((id) => id !== cat.id) : [...f.categoryIds, cat.id] }))}
                      className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold haptic"
                      style={{ background: active ? '#6C63FF' : '#F3F4F6', color: active ? '#fff' : '#374151' }}
                    >
                      {cat.icon} {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select value={filters.period} onChange={(e) => setFilters((f) => ({ ...f, period: e.target.value as TxPeriod }))} className="rounded-xl bg-gray-100 px-3 py-2 text-[16px] text-sm">
                <option value="all">Весь период</option>
                <option value="week">Эта неделя</option>
                <option value="month">Этот месяц</option>
                <option value="prev_month">Прошлый месяц</option>
                <option value="custom">Произвольный</option>
              </select>
              <select value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as TxSort }))} className="rounded-xl bg-gray-100 px-3 py-2 text-[16px] text-sm">
                <option value="date_desc">Новые сначала</option>
                <option value="date_asc">Старые сначала</option>
                <option value="amount_desc">Сумма: больше</option>
                <option value="amount_asc">Сумма: меньше</option>
              </select>
            </div>

            {filters.period === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="rounded-xl bg-gray-100 px-3 py-2 text-[16px] text-sm" />
                <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="rounded-xl bg-gray-100 px-3 py-2 text-[16px] text-sm" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <input type="number" inputMode="decimal" placeholder="Сумма от" value={filters.minAmount} onChange={(e) => setFilters((f) => ({ ...f, minAmount: e.target.value }))} className="rounded-xl bg-gray-100 px-3 py-2 text-[16px] text-sm" />
              <input type="number" inputMode="decimal" placeholder="Сумма до" value={filters.maxAmount} onChange={(e) => setFilters((f) => ({ ...f, maxAmount: e.target.value }))} className={`rounded-xl px-3 py-2 text-[16px] text-sm ${amountRangeInvalid ? 'bg-red-50 border border-red-300' : 'bg-gray-100'}`} />
            </div>
          </div>
        )}

        {activeChips.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {activeChips.map((chip) => (
              <button key={chip.key} onClick={chip.clear} className="flex-shrink-0 px-3 py-1.5 rounded-full bg-purple-50 text-purple-700 text-xs font-semibold haptic">
                {chip.label} ✕
              </button>
            ))}
            <button onClick={resetFilters} className="flex-shrink-0 px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold haptic">Сбросить</button>
          </div>
        )}

        <div className="text-xs text-gray-400 px-1">Найдено: {filtered.length} транзакций</div>
      </div>

      {/* Transactions list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">💸</div>
            <div className="font-medium text-gray-600 mb-1">
              {transactions.length === 0 ? 'Нет операций' : 'Ничего не найдено'}
            </div>
            <div className="text-sm mb-4">
              {transactions.length === 0 ? 'Добавь первую транзакцию' : 'Попробуйте изменить фильтры'}
            </div>
            {transactions.length === 0 ? (
              <Link
                to="/transactions/add"
                className="inline-block bg-blue-600 text-white font-semibold px-5 py-2.5 rounded-xl haptic text-sm"
              >
                + Добавить
              </Link>
            ) : (
              <button onClick={resetFilters} className="inline-block bg-blue-600 text-white font-semibold px-5 py-2.5 rounded-xl haptic text-sm">
                Сбросить фильтры
              </button>
            )}
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
                      <TxRow
                        tx={tx}
                        onTap={() => {
                          window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                          setEditTx(tx);
                        }}
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
            onDelete={() => deleteTransaction(editTx.id)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
