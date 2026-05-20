import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '@/shared/api/client';
import type { Transaction } from '@/features/finance/store';

type InsightType = 'warning' | 'tip' | 'positive' | 'forecast';

export interface ProactiveInsight {
  type: InsightType;
  text: string;
  question: string;
}

const CACHE_KEY = 'fw_ai_insights_cache_v1';
const DISMISS_KEY = 'fw_ai_insights_dismissed_until';
const CACHE_TTL = 6 * 60 * 60 * 1000;

const TYPE_META: Record<InsightType, { icon: string; label: string; bg: string }> = {
  warning: { icon: '🔴', label: 'Внимание', bg: 'linear-gradient(135deg, #FFF1F2, #FFE4E6)' },
  tip: { icon: '💡', label: 'Инсайт', bg: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)' },
  positive: { icon: '✅', label: 'Отлично', bg: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)' },
  forecast: { icon: '📊', label: 'Прогноз', bg: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)' },
};

function normalizeBackendInsights(raw: unknown): ProactiveInsight[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => {
      const type = String(item.type ?? 'tip') as InsightType;
      const safeType: InsightType = ['warning', 'tip', 'positive', 'forecast'].includes(type) ? type : 'tip';
      const text = String(item.text ?? item.description ?? item.title ?? '').trim();
      return { type: safeType, text, question: `Расскажи подробнее: ${text}` };
    })
    .filter((x) => x.text)
    .slice(0, 3);
}

function localInsights(transactions: Transaction[]): ProactiveInsight[] {
  if (transactions.length < 5) return [];

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const current = transactions.filter((t) => t.type === 'expense' && t.date >= monthStart);
  if (current.length === 0) return [];

  const byCat = new Map<string, number>();
  current.forEach((t) => byCat.set(t.category?.name ?? t.categoryId, (byCat.get(t.category?.name ?? t.categoryId) ?? 0) + t.amount));
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const prevWeek = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const thisWeekSpend = transactions.filter((t) => t.type === 'expense' && t.date >= weekAgo).reduce((s, t) => s + t.amount, 0);
  const lastWeekSpend = transactions.filter((t) => t.type === 'expense' && t.date >= prevWeek && t.date < weekAgo).reduce((s, t) => s + t.amount, 0);

  const result: ProactiveInsight[] = [];
  if (top) {
    result.push({
      type: 'tip',
      text: `Больше всего в этом месяце уходит на ${top[0]} — ${Math.round(top[1]).toLocaleString('ru-RU')} ₽`,
      question: `Почему у меня больше всего расходов на ${top[0]} и как снизить траты?`,
    });
  }

  if (lastWeekSpend > 0) {
    const diff = Math.round(((thisWeekSpend - lastWeekSpend) / lastWeekSpend) * 100);
    if (diff > 20) {
      result.push({ type: 'warning', text: `Расходы за неделю выросли на ${diff}% относительно прошлой недели`, question: 'Разбери рост расходов за неделю и предложи план экономии' });
    } else if (diff < -10) {
      result.push({ type: 'positive', text: `Отличная неделя: расходы ниже прошлой на ${Math.abs(diff)}%`, question: 'Как закрепить хороший результат по расходам?' });
    }
  }

  result.push({ type: 'forecast', text: 'Проверьте регулярные платежи — они влияют на SafeToSpend до конца месяца', question: 'Как регулярные платежи влияют на мой бюджет?' });
  return result.slice(0, 3);
}

export function ProactiveAiInsightCard({ transactions }: { transactions: Transaction[] }) {
  const navigate = useNavigate();
  const [insights, setInsights] = useState<ProactiveInsight[]>([]);
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(() => Number(localStorage.getItem(DISMISS_KEY) ?? 0) > Date.now());

  const fallback = useMemo(() => localInsights(transactions), [transactions]);

  useEffect(() => {
    if (transactions.length < 5 || dismissed) return;

    const cachedRaw = localStorage.getItem(CACHE_KEY);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as { ts: number; data: ProactiveInsight[] };
        if (Date.now() - cached.ts < CACHE_TTL && cached.data.length > 0) {
          setInsights(cached.data);
          return;
        }
      } catch { /* ignore */ }
    }

    apiClient.get<{ insights?: unknown[]; data?: unknown[] }>('/ai/insights')
      .then((res: { data: { insights?: unknown[]; data?: unknown[] } }) => {
        const normalized = normalizeBackendInsights(res.data.insights ?? res.data.data);
        const data = normalized.length > 0 ? normalized : fallback;
        setInsights(data);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
      })
      .catch(() => setInsights(fallback));
  }, [transactions.length, dismissed, fallback]);

  if (dismissed || transactions.length < 5 || insights.length === 0) return null;

  const active = insights[index % insights.length]!;
  const meta = TYPE_META[active.type];

  const next = () => setIndex((i: number) => (i + 1) % insights.length);
  const prev = () => setIndex((i: number) => (i - 1 + insights.length) % insights.length);
  const dismiss = () => {
    const until = Date.now() + CACHE_TTL;
    localStorage.setItem(DISMISS_KEY, String(until));
    setDismissed(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4 overflow-hidden"
      style={{ background: meta.bg, border: '1px solid rgba(108,99,255,0.12)' }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(_: unknown, info: { offset: { x: number } }) => {
        if (info.offset.x < -40) next();
        if (info.offset.x > 40) prev();
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="text-xs font-bold text-gray-500 uppercase">{meta.icon} {meta.label}</div>
        <button onClick={dismiss} className="text-gray-400 text-sm haptic">✕</button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -18 }}
          className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2 min-h-[40px]"
        >
          {active.text}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between mt-3">
        {insights.length > 1 ? (
          <div className="flex gap-1.5">
            {insights.map((_, i) => (
              <button key={i} onClick={() => setIndex(i)} className="w-2 h-2 rounded-full haptic" style={{ background: i === index ? '#6C63FF' : '#D1D5DB' }} />
            ))}
          </div>
        ) : <div />}
        <button
          onClick={() => navigate('/ai', { state: { prefill: active.question } })}
          className="text-xs font-bold text-purple-600 haptic"
        >
          Обсудить с AI →
        </button>
      </div>
    </motion.div>
  );
}

export function AiInsightCard({ insight }: { insight: { priority?: string; title?: string; description?: string } }) {
  return (
    <motion.div layout className="rounded-2xl border-2 p-4 bg-blue-50 border-blue-200">
      <div className="flex items-start gap-3">
        <span className="text-2xl">💡</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 text-sm">{insight.title}</div>
          <div className="text-sm text-gray-600 mt-1">{insight.description}</div>
        </div>
      </div>
    </motion.div>
  );
}
