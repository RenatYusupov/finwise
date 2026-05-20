import { useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useFinanceStore, EXPENSE_CATEGORIES, type Transaction } from '@/features/finance/store';
import { formatCurrency } from '@/shared/utils/format';

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

// EditTransactionSheet (inline, minimal — reuses same pattern as TransactionsPage)
function EditSheet({
  tx,
  onClose,
  onSave,
}: {
  tx: Transaction;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Transaction>) => void;
}) {
  const [amount, setAmount] = useState(String(tx.amount));
  const [description, setDescription] = useState(tx.description);

  const handleSave = () => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return;
    onSave(tx.id, { amount: parsed, description });
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="w-full bg-white rounded-t-3xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2" />
        <h3 className="text-lg font-bold text-gray-900">Редактировать транзакцию</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 font-medium mb-1 block">Сумма</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-gray-50 rounded-xl px-4 py-3 text-[16px] font-semibold outline-none"
              style={{ fontSize: '16px' }}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium mb-1 block">Описание</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-gray-50 rounded-xl px-4 py-3 text-[16px] outline-none"
              style={{ fontSize: '16px' }}
            />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-600 font-semibold haptic">
            Отмена
          </button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSave}
            className="flex-1 py-3 rounded-2xl font-semibold text-white haptic"
            style={{ background: 'linear-gradient(135deg, #6C63FF, #8B5CF6)' }}
          >
            Сохранить
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function CategoryDetailPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const period = (searchParams.get('period') as PeriodKey) ?? 'month';
  const [editTx, setEditTx] = useState<Transaction | null>(null);

  const { transactions, updateTransaction } = useFinanceStore();

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

        {/* Transaction list */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-50">
            <span className="text-sm font-bold text-gray-800">Транзакции</span>
            <span className="ml-2 text-xs text-gray-400">{filteredTxs.length} шт.</span>
          </div>

          {filteredTxs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-3xl mb-2">🔍</div>
              <div className="text-sm">Нет транзакций в этой категории за выбранный период</div>
            </div>
          ) : (
            <AnimatePresence>
              {filteredTxs.map((tx, i) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 haptic active:bg-gray-50"
                  onClick={() => setEditTx(tx)}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                    style={{ backgroundColor: (category as { color?: string }).color ? (category as { color: string }).color + '18' : '#F3F4F6' }}
                  >
                    {category.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">{tx.description || category.name}</div>
                    <div className="text-xs text-gray-400">
                      {new Date(tx.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                  <div className={`text-sm font-bold ${tx.type === 'income' ? 'text-green-600' : 'text-gray-900'}`}>
                    {tx.type === 'income' ? '+' : '−'}{formatCurrency(tx.amount)}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Edit sheet */}
      <AnimatePresence>
        {editTx && (
          <EditSheet
            tx={editTx}
            onClose={() => setEditTx(null)}
            onSave={(id, updates) => updateTransaction(id, updates)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
