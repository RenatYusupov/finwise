import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useFinanceStore, EXPENSE_CATEGORIES, INCOME_CATEGORIES, type Transaction } from '@/features/finance/store';
import { formatCurrency } from '@/shared/utils/format';

// ─── Category Picker Sheet ────────────────────────────────────────────────────

function CategoryPickerSheet({
  tx,
  onClose,
}: {
  tx: Transaction;
  onClose: () => void;
}) {
  const { updateTransaction } = useFinanceStore();
  const cats = tx.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const pick = (categoryId: string) => {
    updateTransaction(tx.id, { categoryId });
    onClose();
  };

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
        className="w-full bg-white rounded-t-3xl px-5 pt-4"
        style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

        {/* Transaction summary */}
        <div className="flex items-center gap-3 mb-4 p-3 rounded-2xl" style={{ background: '#F8F7FF' }}>
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl flex-shrink-0">
            {tx.category?.icon ?? '📦'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-800 text-sm truncate">{tx.description || 'Без описания'}</div>
            <div className="text-xs text-gray-400">{tx.category?.name} · {new Date(tx.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</div>
          </div>
          <div className={`font-bold text-sm flex-shrink-0 ${tx.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
            {tx.type === 'income' ? '+' : '−'}{formatCurrency(tx.amount)}
          </div>
        </div>

        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Выберите категорию</div>

        {/* Category chips */}
        <div className="grid grid-cols-4 gap-2">
          {cats.map((cat) => (
            <motion.button
              key={cat.id}
              whileTap={{ scale: 0.92 }}
              onClick={() => pick(cat.id)}
              className="flex flex-col items-center gap-1 py-3 rounded-2xl haptic"
              style={{
                background: tx.categoryId === cat.id ? '#6C63FF' : '#F3F4F6',
                color: tx.categoryId === cat.id ? '#fff' : '#374151',
              }}
            >
              <span className="text-xl leading-none">{cat.icon}</span>
              <span className="text-xs font-medium leading-tight text-center px-1">{cat.name}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

// ─── Transactions Page ────────────────────────────────────────────────────────

export function TransactionsPage() {
  const { transactions, deleteTransaction, getMonthSummary } = useFinanceStore();
  const [filter, setFilter] = useState<'all' | 'expense' | 'income'>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
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
                      className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 active:bg-gray-50 transition-colors"
                      onClick={() => {
                        // Tap row → open category picker (unless delete is pending)
                        if (deleteId === tx.id) return;
                        setEditTx(tx);
                      }}
                    >
                      {/* Category icon — tappable hint */}
                      <div
                        className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl flex-shrink-0 relative"
                        style={{ boxShadow: '0 0 0 2px rgba(108,99,255,0.12)' }}
                      >
                        {tx.category?.icon ?? (tx.type === 'income' ? '💚' : '💸')}
                        {/* Small edit indicator */}
                        <span
                          className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white flex items-center justify-center text-xs"
                          style={{ fontSize: 9, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}
                        >
                          ✏️
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate text-sm">
                          {tx.description || tx.category?.name || 'Операция'}
                        </div>
                        <div className="text-xs text-gray-400">{tx.category?.name}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`font-semibold text-sm ${tx.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                          {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // don't open category picker
                            if (deleteId === tx.id) {
                              deleteTransaction(tx.id);
                              setDeleteId(null);
                            } else {
                              setDeleteId(tx.id);
                              setTimeout(() => setDeleteId(null), 3000);
                            }
                          }}
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs haptic transition-all ${
                            deleteId === tx.id ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {deleteId === tx.id ? '✓' : '×'}
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Category picker sheet */}
      <AnimatePresence>
        {editTx && (
          <CategoryPickerSheet
            tx={editTx}
            onClose={() => setEditTx(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
