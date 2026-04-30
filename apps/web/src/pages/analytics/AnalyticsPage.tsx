import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { apiClient } from '@/shared/api/client';
import { formatCurrency } from '@/shared/utils/format';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];

type Period = 'week' | 'month' | '3months';

const PERIOD_LABELS: Record<Period, string> = {
  week: 'Неделя',
  month: 'Месяц',
  '3months': '3 месяца',
};

// Mock data for dev mode (no backend)
const MOCK_CATEGORIES = [
  { name: 'Еда', amount: 12500, color: COLORS[0] },
  { name: 'Транспорт', amount: 4200, color: COLORS[1] },
  { name: 'Развлечения', amount: 3800, color: COLORS[2] },
  { name: 'Здоровье', amount: 2100, color: COLORS[3] },
  { name: 'Одежда', amount: 5600, color: COLORS[4] },
  { name: 'Прочее', amount: 1900, color: COLORS[5] },
];

const MOCK_MONTHLY = [
  { month: 'Янв', income: 85000, expenses: 62000 },
  { month: 'Фев', income: 85000, expenses: 58000 },
  { month: 'Мар', income: 90000, expenses: 71000 },
  { month: 'Апр', income: 85000, expenses: 65000 },
  { month: 'Май', income: 95000, expenses: 68000 },
  { month: 'Июн', income: 85000, expenses: 72000 },
];

const MOCK_TREND = [
  { day: '1', amount: 2100 },
  { day: '5', amount: 3400 },
  { day: '10', amount: 1800 },
  { day: '15', amount: 4200 },
  { day: '20', amount: 2900 },
  { day: '25', amount: 3600 },
  { day: '30', amount: 2400 },
];

export function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('month');

  const { data: summary } = useQuery({
    queryKey: ['analytics', 'summary', period],
    queryFn: async () => {
      const res = await apiClient.get(`/analytics/summary?period=${period}`);
      return res.data;
    },
    // Use mock data if request fails
    placeholderData: {
      income: 85000,
      expenses: 65100,
      balance: 19900,
      transactionCount: 47,
    },
  });

  const totalExpenses = MOCK_CATEGORIES.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="pb-24 px-4 pt-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Аналитика</h1>
        <p className="text-gray-500 text-sm mt-1">Анализ ваших финансов</p>
      </div>

      {/* Period selector */}
      <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              period === p
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-500'
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 rounded-2xl p-3 text-center">
          <div className="text-xs text-green-600 font-medium mb-1">Доходы</div>
          <div className="text-sm font-bold text-green-700">
            {formatCurrency(summary?.income ?? 85000)}
          </div>
        </div>
        <div className="bg-red-50 rounded-2xl p-3 text-center">
          <div className="text-xs text-red-600 font-medium mb-1">Расходы</div>
          <div className="text-sm font-bold text-red-700">
            {formatCurrency(summary?.expenses ?? 65100)}
          </div>
        </div>
        <div className="bg-indigo-50 rounded-2xl p-3 text-center">
          <div className="text-xs text-indigo-600 font-medium mb-1">Баланс</div>
          <div className="text-sm font-bold text-indigo-700">
            {formatCurrency(summary?.balance ?? 19900)}
          </div>
        </div>
      </div>

      {/* Expenses by category — Pie chart */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Расходы по категориям</h2>
        <div className="flex items-center gap-4">
          <ResponsiveContainer width={160} height={160}>
            <PieChart>
              <Pie
                data={MOCK_CATEGORIES}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                dataKey="amount"
                paddingAngle={2}
              >
                {MOCK_CATEGORIES.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-2">
            {MOCK_CATEGORIES.map((cat, i) => (
              <div key={cat.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="text-xs text-gray-600">{cat.name}</span>
                </div>
                <span className="text-xs font-medium text-gray-900">
                  {Math.round((cat.amount / totalExpenses) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Income vs Expenses — Bar chart */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Доходы vs Расходы</h2>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={MOCK_MONTHLY} barSize={12} barGap={4}>
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
            />
            <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} name="Доходы" />
            <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Расходы" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Spending trend — Line chart */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Тренд расходов</h2>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={MOCK_TREND}>
            <XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
            />
            <Line
              type="monotone"
              dataKey="amount"
              stroke="#6366f1"
              strokeWidth={2.5}
              dot={{ fill: '#6366f1', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Top categories list */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Топ категорий</h2>
        <div className="space-y-3">
          {MOCK_CATEGORIES.sort((a, b) => b.amount - a.amount).map((cat, i) => (
            <div key={cat.name} className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              >
                {i + 1}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-gray-900">{cat.name}</span>
                  <span className="text-sm font-semibold text-gray-900">{formatCurrency(cat.amount)}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(cat.amount / MOCK_CATEGORIES[0]!.amount) * 100}%`,
                      backgroundColor: COLORS[i % COLORS.length],
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
