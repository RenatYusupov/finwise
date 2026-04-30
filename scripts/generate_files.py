#!/usr/bin/env python3
"""Generate all FinWise source files."""
import os

BASE = "/Users/yusupovrenat/Desktop/finwise"

def w(path, content):
    full = os.path.join(BASE, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as f:
        f.write(content.lstrip("\n"))
    print(f"  ✓ {path}")

# ─── Onboarding steps ────────────────────────────────────────────────────────

w("apps/web/src/pages/onboarding/steps/StepGoal.tsx", """
import { useState } from 'react';
import { motion } from 'framer-motion';
import type { OnboardingGoalType, OnboardingData } from '@finwise/shared-types';

interface Props {
  data: Partial<OnboardingData>;
  updateData: (p: Partial<OnboardingData>) => void;
  onNext: () => void;
}

const GOALS = [
  { type: 'housing' as OnboardingGoalType, icon: '🏠', label: 'Накопить на жильё' },
  { type: 'travel' as OnboardingGoalType, icon: '✈️', label: 'Путешествия' },
  { type: 'car' as OnboardingGoalType, icon: '🚗', label: 'Купить авто' },
  { type: 'emergency_fund' as OnboardingGoalType, icon: '🛡️', label: 'Подушка безопасности' },
  { type: 'investment' as OnboardingGoalType, icon: '📈', label: 'Начать инвестировать' },
  { type: 'other' as OnboardingGoalType, icon: '🎯', label: 'Другое' },
];

export function StepGoal({ data, updateData, onNext }: Props) {
  const [selected, setSelected] = useState<OnboardingGoalType | null>(data.goalType ?? null);
  const pick = (t: OnboardingGoalType) => { setSelected(t); updateData({ goalType: t }); };
  return (
    <div className="flex flex-col h-full px-6 py-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Какая твоя главная финансовая цель?</h2>
      <p className="text-gray-500 mb-6">Это поможет мне давать точные советы</p>
      <div className="grid grid-cols-2 gap-3 flex-1">
        {GOALS.map((g, i) => (
          <motion.button key={g.type} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }} whileTap={{ scale: 0.95 }} onClick={() => pick(g.type)}
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 haptic ${selected === g.type ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 bg-white text-gray-700'}`}>
            <span className="text-3xl">{g.icon}</span>
            <span className="text-sm font-medium text-center leading-tight">{g.label}</span>
          </motion.button>
        ))}
      </div>
      <motion.button whileTap={{ scale: 0.97 }} onClick={onNext} disabled={!selected}
        className="mt-6 w-full bg-blue-600 text-white font-semibold text-lg py-4 rounded-2xl haptic disabled:opacity-40">
        Продолжить →
      </motion.button>
    </div>
  );
}
""")

w("apps/web/src/pages/onboarding/steps/StepIncome.tsx", """
import { useState } from 'react';
import { motion } from 'framer-motion';
import type { OnboardingData } from '@finwise/shared-types';

interface Props { data: Partial<OnboardingData>; updateData: (p: Partial<OnboardingData>) => void; onNext: () => void; }

const RANGES = [
  { label: 'до 50 000 ₽', value: 35000 },
  { label: '50–100 000 ₽', value: 75000 },
  { label: '100–200 000 ₽', value: 150000 },
  { label: '200–500 000 ₽', value: 350000 },
  { label: 'более 500 000 ₽', value: 600000 },
];

export function StepIncome({ data, updateData, onNext }: Props) {
  const [sel, setSel] = useState<number | null>(data.monthlyIncome ?? null);
  const [itype, setItype] = useState<'regular' | 'irregular'>(data.incomeType ?? 'regular');
  const pick = (v: number) => { setSel(v); updateData({ monthlyIncome: v, incomeType: itype }); };
  return (
    <div className="flex flex-col h-full px-6 py-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Сколько ты зарабатываешь?</h2>
      <p className="text-gray-500 mb-6">Примерно — для точного планирования</p>
      <div className="space-y-3 flex-1">
        {RANGES.map((r, i) => (
          <motion.button key={r.value} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }} whileTap={{ scale: 0.98 }} onClick={() => pick(r.value)}
            className={`w-full text-left px-5 py-4 rounded-2xl border-2 font-medium haptic ${sel === r.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 bg-white text-gray-800'}`}>
            {r.label}
          </motion.button>
        ))}
      </div>
      <div className="mt-4 flex gap-3">
        {(['regular', 'irregular'] as const).map((t) => (
          <button key={t} onClick={() => { setItype(t); if (sel) updateData({ incomeType: t }); }}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border haptic ${itype === t ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}>
            {t === 'regular' ? '📅 Регулярный' : '🔀 Нерегулярный'}
          </button>
        ))}
      </div>
      <motion.button whileTap={{ scale: 0.97 }} onClick={onNext} disabled={!sel}
        className="mt-4 w-full bg-blue-600 text-white font-semibold text-lg py-4 rounded-2xl haptic disabled:opacity-40">
        Продолжить →
      </motion.button>
    </div>
  );
}
""")

w("apps/web/src/pages/onboarding/steps/StepBank.tsx", """
import { motion } from 'framer-motion';
import type { OnboardingData } from '@finwise/shared-types';

interface Props { data: Partial<OnboardingData>; updateData: (p: Partial<OnboardingData>) => void; onNext: () => void; }

const BANKS = [
  { id: 'tinkoff', name: 'Т-Банк', icon: '🟡' },
  { id: 'sber', name: 'Сбер', icon: '🟢' },
  { id: 'vtb', name: 'ВТБ', icon: '🔵' },
  { id: 'alfa', name: 'Альфа', icon: '🔴' },
  { id: 'raiffeisen', name: 'Райффайзен', icon: '🟡' },
];

export function StepBank({ updateData, onNext }: Props) {
  return (
    <div className="flex flex-col h-full px-6 py-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Подключи банк</h2>
      <p className="text-gray-500 mb-2">Для автоматического учёта всех трат</p>
      <div className="bg-blue-50 rounded-xl px-4 py-2 text-sm text-blue-700 mb-6">
        💡 87% пользователей подключают банк — это экономит 10 мин в день
      </div>
      <div className="space-y-3 flex-1">
        {BANKS.map((b, i) => (
          <motion.button key={b.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07 }} whileTap={{ scale: 0.98 }}
            onClick={() => { updateData({ bankId: b.id }); onNext(); }}
            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-gray-100 bg-white haptic">
            <span className="text-2xl">{b.icon}</span>
            <span className="font-semibold text-gray-800">{b.name}</span>
            <span className="ml-auto text-gray-400">→</span>
          </motion.button>
        ))}
      </div>
      <button onClick={onNext} className="mt-4 w-full text-gray-400 text-sm py-3 haptic">
        Пропустить — введу вручную
      </button>
    </div>
  );
}
""")

w("apps/web/src/pages/onboarding/steps/StepFirstTransaction.tsx", """
import { useState } from 'react';
import { motion } from 'framer-motion';
import type { OnboardingData } from '@finwise/shared-types';

interface Props { data: Partial<OnboardingData>; updateData: (p: Partial<OnboardingData>) => void; onNext: () => void; }

const CATS = [
  { id: 'food', icon: '🍕', label: 'Еда' },
  { id: 'transport', icon: '🚗', label: 'Транспорт' },
  { id: 'shopping', icon: '🛍️', label: 'Покупки' },
  { id: 'entertainment', icon: '🎬', label: 'Развлечения' },
  { id: 'health', icon: '💊', label: 'Здоровье' },
  { id: 'other', icon: '📦', label: 'Другое' },
];

export function StepFirstTransaction({ updateData, onNext }: Props) {
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState('');
  const go = () => {
    if (amount && cat) updateData({ firstTransaction: { accountId: 'default', categoryId: cat, amount: parseFloat(amount), type: 'expense', date: new Date().toISOString().split('T')[0] ?? '' } });
    onNext();
  };
  return (
    <div className="flex flex-col h-full px-6 py-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Добавь последнюю трату</h2>
      <p className="text-gray-500 mb-6">Займёт 10 секунд — обещаю!</p>
      <div className="bg-white rounded-2xl p-6 mb-4 text-center shadow-sm">
        <div className="text-gray-400 text-sm mb-2">Сумма</div>
        <div className="flex items-center justify-center gap-2">
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="amount-input" autoFocus />
          <span className="text-3xl font-bold text-gray-400">₽</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-6">
        {CATS.map(c => (
          <button key={c.id} onClick={() => setCat(c.id)}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 haptic ${cat === c.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white'}`}>
            <span className="text-2xl">{c.icon}</span>
            <span className="text-xs text-gray-600">{c.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-auto space-y-3">
        <motion.button whileTap={{ scale: 0.97 }} onClick={go} disabled={!amount || !cat}
          className="w-full bg-blue-600 text-white font-semibold text-lg py-4 rounded-2xl haptic disabled:opacity-40">
          Добавить →
        </motion.button>
        <button onClick={onNext} className="w-full text-gray-400 text-sm py-2 haptic">Пропустить</button>
      </div>
    </div>
  );
}
""")

w("apps/web/src/pages/onboarding/steps/StepReady.tsx", """
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Props { onFinish: () => void; isLoading: boolean; }

const STEPS = ['💡 Анализирую паттерны...', '🎯 Строю план...', '🤖 Готовлю рекомендации...', '✅ Всё готово!'];

export function StepReady({ onFinish, isLoading }: Props) {
  const [idx, setIdx] = useState(0);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => { if (i >= STEPS.length - 1) { clearInterval(t); setTimeout(() => setShow(true), 400); return i; } return i + 1; }), 700);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-10 text-center">
      <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="text-8xl mb-8">🦉</motion.div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Твой финансовый план готов!</h2>
      <div className="space-y-2 mb-8 w-full">
        {STEPS.map((s, i) => (
          <motion.div key={i} animate={{ opacity: idx >= i ? 1 : 0.2 }}
            className={`text-left px-4 py-2 rounded-xl text-sm ${idx >= i ? 'text-gray-800 bg-white shadow-sm' : 'text-gray-300'}`}>
            {s}
          </motion.div>
        ))}
      </div>
      <motion.button initial={{ opacity: 0, y: 20 }} animate={{ opacity: show ? 1 : 0, y: show ? 0 : 20 }}
        whileTap={{ scale: 0.97 }} onClick={onFinish} disabled={isLoading || !show}
        className="w-full bg-blue-600 text-white font-semibold text-lg py-4 rounded-2xl haptic"
        style={{ boxShadow: '0 4px 20px rgba(45,125,210,0.35)' }}>
        {isLoading ? 'Загрузка...' : 'Открыть FinWise 🚀'}
      </motion.button>
    </div>
  );
}
""")

# ─── Dashboard ────────────────────────────────────────────────────────────────

w("apps/web/src/pages/dashboard/DashboardPage.tsx", """
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { apiClient } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/store';
import { formatCurrency, formatRelativeTime, transactionColor, transactionSign } from '@/shared/utils/format';
import { StreakBadge } from '@/features/gamification/StreakBadge';
import { AiInsightCard } from '@/features/analytics/AiInsightCard';
import { GoalProgressCard } from '@/features/goals/GoalProgressCard';
import type { AnalyticsSummary, Transaction, AiInsight, Goal } from '@finwise/shared-types';

export function DashboardPage() {
  const { user } = useAuthStore();
  const { data: summary } = useQuery<AnalyticsSummary>({ queryKey: ['analytics', 'summary'], queryFn: () => apiClient.get('/analytics/summary?period=month').then(r => r.data.data) });
  const { data: txs } = useQuery<Transaction[]>({ queryKey: ['transactions', 'recent'], queryFn: () => apiClient.get('/transactions?limit=5').then(r => r.data.data) });
  const { data: insights } = useQuery<AiInsight[]>({ queryKey: ['ai', 'insights'], queryFn: () => apiClient.get('/ai/insights').then(r => r.data.data) });
  const { data: goals } = useQuery<Goal[]>({ queryKey: ['goals', 'active'], queryFn: () => apiClient.get('/goals?status=active&limit=2').then(r => r.data.data) });
  const now = new Date();
  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Привет, {user?.firstName ?? 'друг'}! 👋</h1>
          <p className="text-gray-500 text-sm capitalize">{now.toLocaleString('ru-RU', { month: 'long' })} {now.getFullYear()}</p>
        </div>
        <StreakBadge />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white">
        <div className="text-blue-200 text-sm mb-1">Баланс</div>
        <div className="text-3xl font-bold mb-4">{formatCurrency(summary?.netSavings ?? 0)}</div>
        <div className="flex gap-6">
          <div><div className="text-blue-200 text-xs">↑ Доходы</div><div className="font-semibold">{formatCurrency(summary?.totalIncome ?? 0)}</div></div>
          <div><div className="text-blue-200 text-xs">↓ Расходы</div><div className="font-semibold">{formatCurrency(summary?.totalExpenses ?? 0)}</div></div>
          <div><div className="text-blue-200 text-xs">💾 Сбережения</div><div className="font-semibold">{Math.round(summary?.savingsRate ?? 0)}%</div></div>
        </div>
      </motion.div>

      {insights?.[0] && <AiInsightCard insight={insights[0]} />}

      {goals && goals.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">🎯 Мои цели</h2>
            <Link to="/goals" className="text-blue-600 text-sm">Все →</Link>
          </div>
          <div className="space-y-3">{goals.map(g => <GoalProgressCard key={g.id} goal={g} compact />)}</div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">📋 Последние операции</h2>
          <Link to="/transactions" className="text-blue-600 text-sm">Все →</Link>
        </div>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          {!txs?.length && <div className="text-center py-8 text-gray-400"><div className="text-3xl mb-2">💸</div><div className="text-sm">Нет операций. Добавь первую!</div></div>}
          {txs?.map((tx, i) => (
            <motion.div key={tx.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl">{tx.category?.icon ?? '💳'}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{tx.description ?? tx.category?.name ?? 'Операция'}</div>
                <div className="text-xs text-gray-400">{formatRelativeTime(tx.date)}</div>
              </div>
              <div className={`font-semibold ${transactionColor(tx.type)}`}>{transactionSign(tx.type)}{formatCurrency(tx.amount)}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
""")

# ─── Transactions ─────────────────────────────────────────────────────────────

w("apps/web/src/pages/transactions/TransactionsPage.tsx", """
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { apiClient } from '@/shared/api/client';
import { formatCurrency, formatDateShort, transactionColor, transactionSign } from '@/shared/utils/format';
import type { Transaction, TransactionType } from '@finwise/shared-types';

const FILTERS: { label: string; value: TransactionType | 'all' }[] = [
  { label: 'Все', value: 'all' }, { label: 'Расходы', value: 'expense' }, { label: 'Доходы', value: 'income' },
];

export function TransactionsPage() {
  const [filter, setFilter] = useState<TransactionType | 'all'>('all');
  const { data: txs, isLoading } = useQuery<Transaction[]>({
    queryKey: ['transactions', filter],
    queryFn: () => apiClient.get(`/transactions${filter !== 'all' ? '?type=' + filter : ''}`).then(r => r.data.data),
  });
  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Операции</h1>
      <div className="flex gap-2 mb-4">
        {FILTERS.map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium haptic ${filter === f.value ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            {f.label}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          {!txs?.length && <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-3">💸</div><div>Нет операций</div></div>}
          {txs?.map((tx, i) => (
            <motion.div key={tx.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
              className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl">{tx.category?.icon ?? '💳'}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{tx.description ?? tx.category?.name}</div>
                <div className="text-xs text-gray-400">{tx.category?.name} · {formatDateShort(tx.date)}</div>
              </div>
              <div className={`font-semibold ${transactionColor(tx.type)}`}>{transactionSign(tx.type)}{formatCurrency(tx.amount)}</div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
""")

w("apps/web/src/pages/transactions/AddTransactionPage.tsx", """
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { apiClient } from '@/shared/api/client';
import type { CreateTransactionDto, Category, TransactionType } from '@finwise/shared-types';

const TYPES: { label: string; value: TransactionType }[] = [
  { label: 'Расход', value: 'expense' }, { label: 'Доход', value: 'income' }, { label: 'Перевод', value: 'transfer' },
];

export function AddTransactionPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [type, setType] = useState<TransactionType>('expense');
  const [catId, setCatId] = useState('');
  const { register, handleSubmit } = useForm<{ amount: number; description: string }>();

  const { data: cats } = useQuery<Category[]>({
    queryKey: ['categories', type],
    queryFn: () => apiClient.get(`/categories?type=${type}`).then(r => r.data.data),
  });

  const mut = useMutation({
    mutationFn: (d: CreateTransactionDto) => apiClient.post('/transactions', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transactions'] }); qc.invalidateQueries({ queryKey: ['analytics'] }); navigate(-1); },
  });

  const onSubmit = (d: { amount: number; description: string }) => {
    mut.mutate({ ...d, type, categoryId: catId, date: new Date().toISOString().split('T')[0] ?? '', accountId: 'default' });
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center gap-3 px-4 pt-6 pb-4 border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="text-gray-400 text-2xl haptic">←</button>
        <h1 className="text-lg font-bold text-gray-900">Новая операция</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 px-4 py-4 gap-4">
        {/* Type tabs */}
        <div className="flex gap-2">
          {TYPES.map(t => (
            <button key={t.value} type="button" onClick={() => setType(t.value)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium haptic ${type === t.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Amount */}
        <div className="bg-gray-50 rounded-2xl p-6 text-center">
          <div className="text-gray-400 text-sm mb-2">Сумма</div>
          <div className="flex items-center justify-center gap-2">
            <input {...register('amount', { required: true, min: 0.01 })} type="number" step="0.01" placeholder="0"
              className="amount-input" autoFocus />
            <span className="text-3xl font-bold text-gray-400">₽</span>
          </div>
        </div>

        {/* Description */}
        <input {...register('description')} type="text" placeholder="Описание (необязательно)"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 outline-none focus:border-blue-400" />

        {/* Categories */}
        <div>
          <div className="text-sm font-medium text-gray-600 mb-2">Категория</div>
          <div className="grid grid-cols-4 gap-2">
            {cats?.map(c => (
              <button key={c.id} type="button" onClick={() => setCatId(c.id)}
                className={`flex flex-col items-center gap-1 p-