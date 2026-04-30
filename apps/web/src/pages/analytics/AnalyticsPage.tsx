import { useState } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { useFinanceStore } from '@/features/finance/store';
import { formatCurrency } from '@/shared/utils/format';

const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

export function AnalyticsPage() {
  const [tab, setTab] = useState<'expenses' | 'dynamics'>('expenses');
  const { transactions, getCategorySpending, getMonthSummary } = useFinanceStore();

  const summary = getMonthSummary();
  const categorySpending = getCategorySpending();

  // Build last 6 months dynamics
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

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <h1 className="text-xl font-bold text-gray-900">📊 Аналитика</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-green-50 rounded-2xl p-4"
        >
          <div className="text-xs text-green-600 mb-1">Доходы за месяц</div>
          <div className="text-xl font-bold text-green-700">{formatCurrency(summary.income)}</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-red-50 rounded-2xl p-4"
        >
          <div className="text-xs text-red-500 mb-1">Расходы за месяц</div>
          <div className="text-xl font-bold text-red-600">{formatCurrency(summary.expenses)}</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`rounded-2xl p-4 ${summary.savings >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}
        >
          <div className={`text-xs mb-1 ${summary.savings >= 0 ? 'text-blue-600' : 'text-orange-500'}`}>Сбережения</div>
          <div className={`text-xl font-bold ${summary.savings >= 0 ? 'text-blue-700' : 'text-orange-600'}`}>
            {summary.savings >= 0 ? '+' : ''}{formatCurrency(summary.savings)}
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-purple-50 rounded-2xl p-4"
        >
          <div className="text-xs text-purple-600 mb-1">Норма сбережений</div>
          <div className="text-xl font-bold text-purple-700">{summary.savingsRate}%</div>
        </motion.div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1">
        {[
          { label: 'По категориям', value: 'expenses' as const },
          { label: 'Динамика', value: 'dynamics' as const },
        ].map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold haptic transition-all ${
              tab === t.value ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'expenses' ? (
        <>
          {categorySpending.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-3">📊</div>
              <div className="font-medium text-gray-600 mb-1">Нет данных</div>
              <div className="text-sm">Добавь расходы, чтобы увидеть аналитику</div>
            </div>
          ) : (
            <>
              {/* Pie chart */}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="text-sm font-semibold text-gray-700 mb-3">Структура расходов</div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={categorySpending.slice(0, 8)}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="amount"
                    >
                      {categorySpending.slice(0, 8).map((entry, index) => (
                        <Cell key={index} fill={entry.category.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Category list */}
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                {categorySpending.map((item, i) => {
                  const pct = totalExpenses > 0 ? Math.round((item.amount / totalExpenses) * 100) : 0;
                  return (
                    <motion.div
                      key={item.category.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0"
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
                        style={{ backgroundColor: item.category.color + '20' }}
                      >
                        {item.category.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium text-gray-800">{item.category.name}</span>
                          <span className="text-sm font-bold text-gray-900">{formatCurrency(item.amount)}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: item.category.color }}
                          />
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 w-8 text-right">{pct}%</div>
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-sm font-semibold text-gray-700 mb-4">Доходы и расходы за 6 месяцев</div>
          {monthlyData.every((d) => d.income === 0 && d.expenses === 0) ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-3xl mb-2">📈</div>
              <div className="text-sm">Добавь операции, чтобы увидеть динамику</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} barGap={4}>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="income" fill="#10B981" radius={[4, 4, 0, 0]} name="Доходы" />
                <Bar dataKey="expenses" fill="#EF4444" radius={[4, 4, 0, 0]} name="Расходы" />
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="flex gap-4 justify-center mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-xs text-gray-500">Доходы</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-xs text-gray-500">Расходы</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
