import { useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useFinanceStore, EXPENSE_CATEGORIES, type Transaction } from '@/features/finance/store';
import { formatCurrency } from '@/shared/utils/format';
import { TxRow, EditTransactionSheet } from '@/pages/transactions/TransactionsPage';

type PeriodKey = 'month' | 'prev_month' | '3m' | '6m';

function monthRange(offset: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function rangeForPeriod(period: PeriodKey) {
  if (period === 'month') return monthRange(0);
  if (period === 'prev_month') return monthRange(-1);
  const months = period === '3m' ? 3 : 6;
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth() - months + 1, 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

function txInRange(t: Transaction, start: Date, end: Date) {
  const d = new Date(t.date);
  return d >= start && d <= end;
}

// Group transactions by ISO week (Mon–Sun)
function getWeekKey(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

function weekLabel(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function CategoryDetailPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const period = (searchParams.get('period') as PeriodKey) ?? 'month';
  const [editTx, setEditTx] = useState<Transaction | null>(null);

  const { transactions, deleteTransaction } = useFinanceStore();

  // Find category info — check both expense and income categories
  const allCategories = [
    ...EXPENSE_CATEGORIES,
    { id: 'income', name: 'Доходы', icon: '💰', color: '#00C896' },
  ];
  const category = allCategories.find((c) => c.id === categoryId);

  const range = useMemo(() => rangeForPeriod(period), [period]);

  const filteredTxs = useMemo(() => {
    if (!categoryId) return [];
    return transactions
      .filter((t) => t.categoryId === categoryId && txInRange(t, range.start, range.end))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, categoryId, range]);

  const totalAmount = filteredTxs.reduce((s, t) => s + t.amount, 0);

  // Average per month (only for multi-month periods)
  const monthCount = period === '3m' ? 3 : period === '6m' ? 6 : 1;
  const avgPerMonth = monthCount > 1 ? totalAmount / monthCount : null;

  // Weekly bar chart data
  const weeklyData = useMemo(() => {
    const map = new Map<string, number>();
    filteredTxs.forEach((t) => {
      const key = getWeekKey(new Date(t.date));
      map.set(key, (map.get(key) ?? 0) + t.amount);
    });
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, amount]) => ({ week: weekLabel(key), amount }));
  }, [filteredTxs]);

  const showChart = weeklyData.length > 1;

  // Group transactions by date label
  const grouped = useMemo(() => {
    return filteredTxs.reduce<Record<string, Transaction[]>>((acc, tx) => {
      const label = new Date(tx.date).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      if (!acc[label]) acc[label] = [];
      acc[label]!.push(tx);
      return acc;
    }, {});
  }, [filteredTxs]);

  // Redirect if category not found
  if (!category) {
    navigate('/analytics', { replace: true });
    return null;
  }

  const periodLabel = {
    month: 'этот месяц',
    prev_month: 'прошлый месяц',
    '3m': 'последние 3 месяца',
    '6m': 'последние 6 месяцев',
  }[period];

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-warm)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-4 bg-white border-b border-gray-100">
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => navigate(`/analytics?period=${period}`)}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center haptic text-lg"
        >
          ←
        </motion.button>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: (category as { color?: string }).color ? (category as { color: string }).color + '20' : '#F3F4F6' }}>
          {category.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 truncate">{category.name}</h1>
          <div className="text-xs text-gray-400">{periodLabel}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6 space-y-3">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-2">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-4 shadow-sm"
          >
            <div className="text-xs text-gray-400 mb-1">Итого за период</div>
            <div className="text-xl font-bold text-gray-900">{formatCurrency(totalAmount)}</div>
          </motion.div>
          {avgPerMonth !== null && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="bg-white rounded-2xl p-4 shadow-sm"
            >
              <div className="text-xs text-gray-400 mb-1">В среднем/мес</div>
              <div className="text-xl font-bold text-gray-900">{formatCurrency(avgPerMonth)}</div>
            </motion.div>
          )}
        </div>

        {/* Weekly bar chart */}
        {showChart && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl p-4 shadow-sm"
          >
            <div className="text-sm font-bold text-gray-800 mb-3">По неделям</div>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={weeklyData} barCategoryGap="30%">
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar
                  dataKey="amount"
                  fill={(category as { color?: string }).color ?? '#6C63FF'}
                  radius={[6, 6, 0, 0]}
                  name="Расходы"
                />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        {/* Transaction list — grouped by date */}
        {filteredTxs.length === 0 ? (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-50">
              <span className="text-sm font-bold text-gray-800">Транзакции</span>
              <span className="ml-2 text-xs text-gray-400">0 шт.</span>
            </div>
            <div className="text-center py-12 text-gray-400">
              <div className="text-3xl mb-2">🔍</div>
              <div className="text-sm">Нет транзакций в этой категории за выбранный период</div>
            </div>
          </div>
        ) : (
          Object.entries(grouped).map(([dateLabel, txs]) => (
            <div key={dateLabel}>
              <div className="text-xs font-semibold text-gray-400 uppercase mb-2 px-1">{dateLabel}</div>
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

      {/* Edit sheet — full EditTransactionSheet with delete */}
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
