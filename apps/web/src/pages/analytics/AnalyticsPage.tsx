import { useState } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { useFinanceStore } from '@/features/finance/store';
import { formatCurrency } from '@/shared/utils/format';

const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

function InsightCard({ icon, title, value, subtitle, color, bg }: {
  icon: string; title: string; value: string; subtitle?: string; color: string; bg: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4 flex flex-col gap-1"
      style={{ background: bg }}
    >
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
  const [tab, setTab] = useState<'expenses' | 'dynamics'>('expenses');
  const { transactions, getCategorySpending, getMonthSummary } = useFinanceStore();

  const summary = getMonthSummary();
  const categorySpending = getCategorySpending();

  const now = new Date();
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const monthStart = d.toISOString();
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString();
    const txs = transactions.filter((t) => t.date >= monthStart && t.date <= monthEnd);
    const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { month: MONTHS[d.getMonth()] ?? '', income, expenses };
  });

  const totalExpenses = categorySpending.reduce((s, c) => s + c.amount, 0);
  const topCategory = categorySpending[0];

  // AI insight text
  const getInsight = () => {
    if (categorySpending.length === 0) return null;
    if (topCategory && totalExpenses > 0) {
      const pct = Math.round((topCategory.amount / totalExpenses) * 100);
      if (pct > 40) {
        return `⚠️ ${pct}% расходов уходит на «${topCategory.category.name}». Попробуй сократить на 20%?`;
      }
      if (summary.savingsRate >= 20) {
        return `🎉 Отличный месяц! Ты откладываешь ${summary.savingsRate}% дохода — это выше нормы.`;
      }
      return `💡 Больше всего тратишь на «${topCategory.category.name}» — ${formatCurrency(topCategory.amount)}`;
    }
    return null;
  };

  const insight = getInsight();

  return (
    <div className="px-4 pt-5 pb-4 space-y-3" style={{ background: 'var(--bg-warm)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">📊 Аналитика</h1>
        <div className="text-xs text-gray-400 font-medium">
          {now.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* AI Insight */}
      {insight && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4"
          style={{ background: 'linear-gradient(135deg, #F0EEFF, #EDE8FF)', border: '1px solid rgba(108,99,255,0.12)' }}
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)' }}>
              🦉
            </div>
            <div>
              <div className="text-xs font-semibold text-purple-600 mb-0.5">FinWise AI · Инсайт</div>
              <div className="text-sm text-gray-700 leading-snug">{insight}</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        <InsightCard
          icon="↑" title="Доходы" value={formatCurrency(summary.income)}
          subtitle="за этот месяц" color="#00C896" bg="#E8FFF5"
        />
        <InsightCard
          icon="↓" title="Расходы" value={formatCurrency(summary.expenses)}
          subtitle="за этот месяц" color="#FF4757" bg="#FFF0EB"
        />
        <InsightCard
          icon="💾" title="Сбережения"
          value={`${summary.savings >= 0 ? '+' : ''}${formatCurrency(summary.savings)}`}
          subtitle={summary.savings >= 0 ? 'Молодец!' : 'Перерасход'}
          color={summary.savings >= 0 ? '#6C63FF' : '#FF4757'}
          bg={summary.savings >= 0 ? '#F0EEFF' : '#FFF0EB'}
        />
        <InsightCard
          icon="📈" title="Норма сбережений" value={`${summary.savingsRate}%`}
          subtitle={summary.savingsRate >= 20 ? '✅ Отлично!' : 'Цель: 20%'}
          color="#FFB800" bg="#FFFBEB"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl p-1" style={{ background: 'rgba(0,0,0,0.06)' }}>
        {[
          { label: '🍩 По категориям', value: 'expenses' as const },
          { label: '📈 Динамика', value: 'dynamics' as const },
        ].map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold haptic transition-all"
            style={tab === t.value
              ? { background: 'white', color: '#1a1a2e', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }
              : { color: '#9CA3AF' }
            }
          >
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
          ) : (
            <>
              {/* Donut chart */}
              <div className="bg-white rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
                <div className="text-sm font-bold text-gray-800 mb-1">Структура расходов</div>
                <div className="text-xs text-gray-400 mb-3">Всего: {formatCurrency(totalExpenses)}</div>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={categorySpending.slice(0, 8)}
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="amount"
                        strokeWidth={0}
                      >
                        {categorySpending.slice(0, 8).map((entry, index) => (
                          <Cell key={index} fill={entry.category.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <div className="text-xs text-gray-400">Расходы</div>
                    <div className="text-base font-bold text-gray-800">{formatCurrency(totalExpenses)}</div>
                  </div>
                </div>
              </div>

              {/* Category list */}
              <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
                {categorySpending.map((item, i) => {
                  const pct = totalExpenses > 0 ? Math.round((item.amount / totalExpenses) * 100) : 0;
                  return (
                    <motion.div
                      key={item.category.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                        style={{ backgroundColor: item.category.color + '18' }}
                      >
                        {item.category.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-sm font-semibold text-gray-800">{item.category.name}</span>
                          <span className="text-sm font-bold text-gray-900">{formatCurrency(item.amount)}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, delay: i * 0.04 + 0.2 }}
                            className="h-1.5 rounded-full"
                            style={{ backgroundColor: item.category.color }}
                          />
                        </div>
                      </div>
                      <div className="text-xs font-semibold w-8 text-right" style={{ color: item.category.color }}>
                        {pct}%
                      </div>
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
          <div className="text-xs text-gray-400 mb-4">Последние 6 месяцев</div>
          {monthlyData.every((d) => d.income === 0 && d.expenses === 0) ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-3xl mb-2">📈</div>
              <div className="text-sm">Добавь операции, чтобы увидеть динамику</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData} barGap={4} barCategoryGap="30%">
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    borderRadius: 16,
                    border: 'none',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="income" fill="#00C896" radius={[6, 6, 0, 0]} name="Доходы" />
                <Bar dataKey="expenses" fill="#FF6B35" radius={[6, 6, 0, 0]} name="Расходы" />
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="flex gap-4 justify-center mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: '#00C896' }} />
              <span className="text-xs text-gray-500 font-medium">Доходы</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: '#FF6B35' }} />
              <span className="text-xs text-gray-500 font-medium">Расходы</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
