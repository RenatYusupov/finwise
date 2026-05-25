import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line } from 'recharts';
import { useFinanceStore, EXPENSE_CATEGORIES, type Transaction } from '@/features/finance/store';
import { formatCurrency } from '@/shared/utils/format';
import { RecategorizationSheet } from './profile/RecategorizationSheet';
import type { Transaction } from '@/features/finance/store';

const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
type PeriodKey = 'month' | 'prev_month' | '3m' | '6m';

type CategoryRow = {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  current: number;
  previous: number;
  deltaPct: number | null;
};

function monthRange(offset: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function rangeForPeriod(period: PeriodKey, previous = false) {
  if (period === 'month') return monthRange(previous ? -1 : 0);
  if (period === 'prev_month') return monthRange(previous ? -2 : -1);

  const months = period === '3m' ? 3 : 6;
  const now = new Date();
  const startOffset = previous ? -months * 2 + 1 : -months + 1;
  const endOffset = previous ? -months : 0;
  return {
    start: new Date(now.getFullYear(), now.getMonth() + startOffset, 1),
    end: new Date(now.getFullYear(), now.getMonth() + endOffset + 1, 0, 23, 59, 59, 999),
  };
}

function txInRange(t: Transaction, start: Date, end: Date) {
  const d = new Date(t.date);
  return d >= start && d <= end;
}

function sumExpenses(txs: Transaction[]) {
  return txs.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
}

function categoryMap(txs: Transaction[]) {
  const map = new Map<string, number>();
  txs.filter((t) => t.type === 'expense').forEach((t) => {
    map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount);
  });
  return map;
}

function OtherExpBanner({ pct, onNavigate }: { pct: number; onNavigate: () => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onNavigate}
      className="w-full text-left rounded-2xl p-4 haptic"
      style={{ background: 'linear-gradient(135deg, #FFF7ED, #FFEDD5)', border: '1px solid rgba(249,115,22,0.2)' }}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">🗂️</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-orange-700 mb-0.5">
            {pct}% расходов без категории
          </div>
          <div className="text-xs text-orange-600 leading-snug">
            Уточните {Math.min(30, useFinanceStore.getState().transactions.filter((t: Transaction) => t.categoryId === 'other_exp').length)} операций — аналитика станет точнее
          </div>
        </div>
        <span className="text-orange-400 text-sm flex-shrink-0">›</span>
      </div>
    </motion.button>
  );
}

function InsightCard({ icon, title, value, subtitle, color, bg }: {
  icon: string; title: string; value: string; subtitle?: string; color: string; bg: string;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-4 flex flex-col gap-1" style={{ background: bg }}>
      <div className="flex items-center gap-1.5">
        <span className="text-base">{icon}</span>
        <span className="text-xs font-semibold" style={{ color }}>{title}</span>
      </div>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
      {subtitle && <div className="text-xs text-gray-400">{subtitle}</div>}
    </motion.div>
  );
}

export function AnalyticsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<'expenses' | 'dynamics'>('expenses');
  const [period, setPeriod] = useState<PeriodKey>((searchParams.get('period') as PeriodKey) ?? 'month');
  const [compare, setCompare] = useState(false);
  const [showRecategorization, setShowRecategorization] = useState(false);
  const { transactions, getCategorySpending, getMonthSummary } = useFinanceStore();

  const summary = getMonthSummary();
  const categorySpending = getCategorySpending();
  const now = new Date();

  const currentRange = useMemo(() => rangeForPeriod(period, false), [period]);
  const previousRange = useMemo(() => rangeForPeriod(period, true), [period]);
  const currentTxs = useMemo(() => transactions.filter((t) => txInRange(t, currentRange.start, currentRange.end)), [transactions, currentRange]);
  const previousTxs = useMemo(() => transactions.filter((t) => txInRange(t, previousRange.start, previousRange.end)), [transactions, previousRange]);
  const currentExpenses = sumExpenses(currentTxs);
  const previousExpenses = sumExpenses(previousTxs);
  const deltaAbs = currentExpenses - previousExpenses;
  const deltaPct = previousExpenses > 0 ? Math.round((deltaAbs / previousExpenses) * 100) : null;

  const comparisonRows = useMemo<CategoryRow[]>(() => {
    const cur = categoryMap(currentTxs);
    const prev = categoryMap(previousTxs);
    const ids = new Set([...cur.keys(), ...prev.keys()]);
    return [...ids].map((id) => {
      const cat = EXPENSE_CATEGORIES.find((c) => c.id === id);
      const current = cur.get(id) ?? 0;
      const previous = prev.get(id) ?? 0;
      return {
        categoryId: id,
        name: cat?.name ?? id,
        icon: cat?.icon ?? '📦',
        color: cat?.color ?? '#9CA3AF',
        current,
        previous,
        deltaPct: previous > 0 ? Math.round(((current - previous) / previous) * 100) : current > 0 ? null : 0,
      };
    }).sort((a, b) => b.current - a.current);
  }, [currentTxs, previousTxs]);

  const trendMonths = period === '3m' ? 3 : 6;
  const trendData = useMemo(() => Array.from({ length: trendMonths }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (trendMonths - 1 - i), 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    const txs = transactions.filter((t) => txInRange(t, start, end));
    return { month: MONTHS[d.getMonth()] ?? '', expenses: sumExpenses(txs) };
  }), [transactions, trendMonths, now]);

  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    const txs = transactions.filter((t) => txInRange(t, start, end));
    return {
      month: MONTHS[d.getMonth()] ?? '',
      income: txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
      expenses: sumExpenses(txs),
    };
  });

  const totalExpenses = categorySpending.reduce((s, c) => s + c.amount, 0);
  const otherExpAmount = categorySpending.find((c) => c.category.id === 'other_exp')?.amount ?? 0;
  const otherExpPct = totalExpenses > 0 ? Math.round((otherExpAmount / totalExpenses) * 100) : 0;
  const topCategory = categorySpending[0];
  const biggestGrowth = comparisonRows.filter((r) => r.deltaPct !== null).sort((a, b) => (b.deltaPct ?? 0) - (a.deltaPct ?? 0))[0];
  const biggestDrop = comparisonRows.filter((r) => r.deltaPct !== null).sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0))[0];
  const insufficientComparison = compare && previousTxs.length === 0;

  const insight = topCategory && totalExpenses > 0
    ? `💡 Больше всего тратишь на «${topCategory.category.name}» — ${formatCurrency(topCategory.amount)}`
    : null;

  return (
    <div className="px-4 pt-5 pb-4 space-y-3" style={{ background: 'var(--bg-warm)' }}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">📊 Аналитика</h1>
        <div className="text-xs text-gray-400 font-medium">{now.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}</div>
      </div>

      <div className="flex gap-2">
        <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} className="flex-1 rounded-2xl bg-white px-3 py-2 text-[16px] text-sm font-semibold shadow-sm">
          <option value="month">Этот месяц</option>
          <option value="prev_month">Прошлый месяц</option>
          <option value="3m">3 месяца</option>
          <option value="6m">6 месяцев</option>
        </select>
        <button onClick={() => setCompare((v) => !v)} className={`px-3 rounded-2xl text-sm font-bold haptic shadow-sm ${compare ? 'bg-purple-600 text-white' : 'bg-white text-gray-600'}`}>
          Сравнить: {compare ? 'ВКЛ' : 'ВЫКЛ'}
        </button>
      </div>

      {insight && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #F0EEFF, #EDE8FF)', border: '1px solid rgba(108,99,255,0.12)' }}>
          <div className="text-xs font-semibold text-purple-600 mb-0.5">FinWise AI · Инсайт</div>
          <div className="text-sm text-gray-700 leading-snug">{insight}</div>
        </motion.div>
      )}

      {compare && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          {insufficientComparison ? (
            <div className="text-sm text-gray-500 text-center py-4">Недостаточно данных для сравнения. Нужно минимум 2 месяца</div>
          ) : (
            <>
              <div className="text-sm text-gray-500 mb-1">Расходы периода</div>
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-2xl font-bold text-gray-900">{formatCurrency(currentExpenses)}</div>
                <div className="text-xs text-gray-400">vs {formatCurrency(previousExpenses)}</div>
              </div>
              <div className={`mt-1 text-sm font-bold ${deltaAbs > 0 ? 'text-red-500' : 'text-green-600'}`}>
                {deltaAbs >= 0 ? '+' : ''}{formatCurrency(deltaAbs)} {deltaPct !== null ? `(${deltaPct >= 0 ? '+' : ''}${deltaPct}%)` : '(новые расходы)'}
              </div>
              <div className="mt-3 h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonRows.slice(0, 6)}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} hide />
                    <YAxis hide />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="previous" fill="#CBD5E1" radius={[4, 4, 0, 0]} name="Предыдущий" />
                    <Bar dataKey="current" fill="#6C63FF" radius={[4, 4, 0, 0]} name="Текущий" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {(biggestGrowth || biggestDrop) && (
                <div className="mt-3 space-y-1 text-xs">
                  {biggestGrowth && <div className="text-red-500">Больше всего выросло: {biggestGrowth.name} +{biggestGrowth.deltaPct}%</div>}
                  {biggestDrop && <div className="text-green-600">Больше всего снизилось: {biggestDrop.name} {biggestDrop.deltaPct}%</div>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <InsightCard icon="↑" title="Доходы" value={formatCurrency(summary.income)} subtitle="за этот месяц" color="#00C896" bg="#E8FFF5" />
        <InsightCard icon="↓" title="Расходы" value={formatCurrency(summary.expenses)} subtitle="за этот месяц" color="#FF4757" bg="#FFF0EB" />
        <InsightCard icon="💾" title="Сбережения" value={`${summary.savings >= 0 ? '+' : ''}${formatCurrency(summary.savings)}`} subtitle={summary.savings >= 0 ? 'Молодец!' : 'Перерасход'} color={summary.savings >= 0 ? '#6C63FF' : '#FF4757'} bg={summary.savings >= 0 ? '#F0EEFF' : '#FFF0EB'} />
        <InsightCard icon="📈" title="Норма сбережений" value={`${summary.savingsRate}%`} subtitle={summary.savingsRate >= 20 ? '✅ Отлично!' : 'Цель: 20%'} color="#FFB800" bg="#FFFBEB" />
      </div>

      <div className="flex gap-1 rounded-2xl p-1" style={{ background: 'rgba(0,0,0,0.06)' }}>
        {[
          { label: '🍩 По категориям', value: 'expenses' as const },
          { label: '📈 Динамика', value: 'dynamics' as const },
        ].map((t) => (
          <button key={t.value} onClick={() => setTab(t.value)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold haptic transition-all" style={tab === t.value ? { background: 'white', color: '#1a1a2e', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' } : { color: '#9CA3AF' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'expenses' ? (
        <>
          {categorySpending.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl" style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="text-4xl mb-3">📊</div>
              <div className="font-semibold text-gray-600 mb-1">Нет данных</div>
              <div className="text-sm text-gray-400">Добавь расходы, чтобы увидеть аналитику</div>
            </div>
          ) : compare && !insufficientComparison ? (
            <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="grid grid-cols-4 px-4 py-2 text-[11px] font-bold text-gray-400 uppercase border-b border-gray-50">
                <div>Категория</div><div className="text-right">Текущий</div><div className="text-right">Пред.</div><div className="text-right">Δ%</div>
              </div>
              {comparisonRows.map((row) => (
                <div key={row.categoryId} className="grid grid-cols-4 items-center px-4 py-3 border-b border-gray-50 last:border-0 text-sm">
                  <div className="font-semibold text-gray-800 truncate">{row.icon} {row.name}</div>
                  <div className="text-right">{formatCurrency(row.current)}</div>
                  <div className="text-right text-gray-400">{row.previous ? formatCurrency(row.previous) : '—'}</div>
                  <div className={`text-right font-bold ${row.deltaPct === null ? 'text-purple-500' : row.deltaPct > 0 ? 'text-red-500' : 'text-green-600'}`}>
                    {row.deltaPct === null ? 'Новая' : `${row.deltaPct > 0 ? '+' : ''}${row.deltaPct}%`}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {otherExpPct >= 15 && (
                <OtherExpBanner
                  pct={otherExpPct}
                  onNavigate={() => setShowRecategorization(true)}
                />
              )}
              <div className="bg-white rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
                <div className="text-sm font-bold text-gray-800 mb-1">Структура расходов</div>
                <div className="text-xs text-gray-400 mb-3">Всего: {formatCurrency(totalExpenses)}</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={categorySpending.slice(0, 8)} cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={3} dataKey="amount" strokeWidth={0}>
                      {categorySpending.slice(0, 8).map((entry, index) => <Cell key={index} fill={entry.category.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
                {categorySpending.map((item, i) => {
                  const pct = totalExpenses > 0 ? Math.round((item.amount / totalExpenses) * 100) : 0;
                  return (
                    <motion.div key={item.category.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 haptic active:bg-gray-50 cursor-pointer" onClick={() => navigate(`/analytics/category/${item.category.id}?period=${period}`)}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: item.category.color + '18' }}>{item.category.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1.5"><span className="text-sm font-semibold text-gray-800">{item.category.name}</span><span className="text-sm font-bold text-gray-900">{formatCurrency(item.amount)}</span></div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} className="h-1.5 rounded-full" style={{ backgroundColor: item.category.color }} /></div>
                      </div>
                      <div className="text-xs font-semibold w-8 text-right" style={{ color: item.category.color }}>{pct}%</div>
                      <div className="text-gray-300 text-xs">›</div>
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="bg-white rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="text-sm font-bold text-gray-800 mb-1">Доходы и расходы</div>
          <div className="text-xs text-gray-400 mb-4">{period === '3m' ? 'Последние 3 месяца' : period === '6m' ? 'Последние 6 месяцев' : 'Последние 6 месяцев'}</div>
          {(period === '3m' || period === '6m') ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Line type="monotone" dataKey="expenses" stroke="#FF6B35" strokeWidth={3} dot={{ r: 4 }} name="Расходы" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData} barGap={4} barCategoryGap="30%">
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="income" fill="#00C896" radius={[6, 6, 0, 0]} name="Доходы" />
                <Bar dataKey="expenses" fill="#FF6B35" radius={[6, 6, 0, 0]} name="Расходы" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
      {showRecategorization && (
        <RecategorizationSheet onClose={() => setShowRecategorization(false)} />
      )}
    </div>
  );
}
