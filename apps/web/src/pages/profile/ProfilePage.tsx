import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/features/auth/store';
import { useFinanceStore, cancelScheduledUpload, forceSyncToCloud } from '@/features/finance/store';
import { CategoryPicker } from '@/features/finance/CategoryPicker';
import { useUIStore } from '@/features/ui/store';
import { formatCurrency } from '@/shared/utils/format';
import { parseBankXLSX, parseTbankPDF, parseCSV, rowToTransactionGeneric } from './bankImport';
import type { ParsedBankTx } from './bankImport';
import { PostImportWizard } from './PostImportWizard';
import { apiClient } from '@/shared/api/client';

// ─── Groq Categorization (via backend /api/ai/categorize) ────────────────────

const VALID_CATEGORY_IDS = new Set([
  'food', 'transport', 'shopping', 'health', 'entertainment',
  'cafe', 'sport', 'beauty', 'home', 'education', 'travel', 'other_exp',
  'salary', 'freelance', 'gift', 'investment', 'cashback', 'other_inc',
]);

async function recategorizeWithGroq(transactions: ParsedBankTx[]): Promise<ParsedBankTx[]> {
  if (transactions.length === 0) return transactions;

  const needsGroq = transactions
    .map((tx, idx) => ({ tx, idx }))
    .filter(({ tx }) => !tx.categoryConfident);

  if (needsGroq.length === 0) {
    console.log('[bankImport] All transactions pre-categorized — skipping Groq');
    return transactions;
  }

  console.log(`[bankImport] Sending ${needsGroq.length}/${transactions.length} transactions to backend /ai/categorize`);

  const result: ParsedBankTx[] = [...transactions];

  try {
    const payload = needsGroq.map((item, batchIdx) => ({
      idx: batchIdx,
      description: item.tx.description || '',
      bankCategory: item.tx.bankCategory,
      type: item.tx.type,
      amount: item.tx.amount,
    }));

    const response = await apiClient.post<{ data: Array<{ idx: number; categoryId: string }> }>(
      '/ai/categorize',
      { transactions: payload }
    );

    const arr = response.data?.data ?? [];

    for (const item of arr) {
      if (
        typeof item.idx === 'number' &&
        item.idx >= 0 &&
        item.idx < needsGroq.length &&
        VALID_CATEGORY_IDS.has(item.categoryId)
      ) {
        const origIdx = needsGroq[item.idx]!.idx;
        const orig = result[origIdx]!;
        result[origIdx] = {
          type: orig.type,
          amount: orig.amount,
          description: orig.description,
          bankCategory: orig.bankCategory,
          date: orig.date,
          categoryId: item.categoryId,
          categoryConfident: true,
        };
      }
    }
  } catch (err) {
    console.warn('[bankImport] Backend categorize error:', err);
  }

  return result;
}

// ─── Achievements ─────────────────────────────────────────────────────────────

type StoreSnapshot = ReturnType<typeof useFinanceStore.getState>;

interface Achievement {
  id: string;
  icon: string;
  name: string;
  desc: string;
  check: (s: StoreSnapshot) => boolean;
  getProgress: (s: StoreSnapshot) => { current: number; target: number; label: string } | null;
}

const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_tx',
    icon: '🎯',
    name: 'Первая трата',
    desc: 'Добавь первую операцию',
    check: (s) => s.transactions.length >= 1,
    getProgress: (s) => ({
      current: Math.min(s.transactions.length, 1),
      target: 1,
      label: `${Math.min(s.transactions.length, 1)} из 1 операции`,
    }),
  },
  {
    id: 'saver',
    icon: '💰',
    name: 'Копилка',
    desc: 'Сбережения > 20%',
    check: (s) => s.getMonthSummary().savingsRate >= 20,
    getProgress: (s) => {
      const rate = Math.max(0, s.getMonthSummary().savingsRate);
      return { current: Math.min(rate, 20), target: 20, label: `${Math.round(rate)}% из 20%` };
    },
  },
  {
    id: 'goal_setter',
    icon: '🌟',
    name: 'Целеустремлённый',
    desc: 'Создай первую цель',
    check: (s) => s.goals.length >= 1,
    getProgress: (s) => ({
      current: Math.min(s.goals.length, 1),
      target: 1,
      label: `${Math.min(s.goals.length, 1)} из 1 цели`,
    }),
  },
  {
    id: 'goal_done',
    icon: '🏆',
    name: 'Достигатор',
    desc: 'Выполни цель на 100%',
    check: (s) => s.goals.some((g) => g.currentAmount >= g.targetAmount),
    getProgress: (s) => {
      if (s.goals.length === 0) return null;
      const best = s.goals.reduce((max, g) => {
        const pct = g.targetAmount > 0 ? g.currentAmount / g.targetAmount : 0;
        return pct > max ? pct : max;
      }, 0);
      return {
        current: Math.round(best * 100),
        target: 100,
        label: `Лучшая цель: ${Math.round(best * 100)}%`,
      };
    },
  },
  {
    id: 'streak_3',
    icon: '🔥',
    name: 'Огонь',
    desc: '3 дня подряд',
    check: (s) => s.streak >= 3,
    getProgress: (s) => ({
      current: Math.min(s.streak, 3),
      target: 3,
      label: `${Math.min(s.streak, 3)} из 3 дней`,
    }),
  },
  {
    id: 'streak_7',
    icon: '⚡',
    name: 'Молния',
    desc: '7 дней подряд',
    check: (s) => s.streak >= 7,
    getProgress: (s) => ({
      current: Math.min(s.streak, 7),
      target: 7,
      label: `${Math.min(s.streak, 7)} из 7 дней`,
    }),
  },
  {
    id: 'tx_10',
    icon: '📊',
    name: 'Аналитик',
    desc: '10 операций',
    check: (s) => s.transactions.length >= 10,
    getProgress: (s) => ({
      current: Math.min(s.transactions.length, 10),
      target: 10,
      label: `${Math.min(s.transactions.length, 10)} из 10 операций`,
    }),
  },
  {
    id: 'tx_50',
    icon: '💎',
    name: 'Профи',
    desc: '50 операций',
    check: (s) => s.transactions.length >= 50,
    getProgress: (s) => ({
      current: Math.min(s.transactions.length, 50),
      target: 50,
      label: `${Math.min(s.transactions.length, 50)} из 50 операций`,
    }),
  },
  {
    id: 'big_saver',
    icon: '👑',
    name: 'Бриллиант',
    desc: 'Накопи 100 000 ₽',
    check: (s) => s.goals.some((g) => g.currentAmount >= 100000),
    getProgress: (s) => {
      const best = s.goals.reduce((max, g) => (g.currentAmount > max ? g.currentAmount : max), 0);
      return {
        current: Math.min(best, 100000),
        target: 100000,
        label: `${formatCurrency(Math.min(best, 100000))} из ${formatCurrency(100000)}`,
      };
    },
  },
];

// ─── Category Clarification Step ─────────────────────────────────────────────

const MAX_CLARIFY = 30;

/**
 * Greedy 90%-coverage algorithm.
 * Selects minimum set of transactions to clarify to reach 90% category coverage.
 */
function computeClarifyQueue(
  newTxs: import('@/features/finance/store').Transaction[],
  _allTxs: import('@/features/finance/store').Transaction[],
): string[] {
  const totalExpenses = newTxs
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const alreadyCategorized = newTxs
    .filter((t) => t.type === 'expense' && t.categoryId !== 'other_exp')
    .reduce((sum, t) => sum + t.amount, 0);

  const target = totalExpenses * 0.9;
  let covered = alreadyCategorized;
  const queue: string[] = [];

  const expenseCandidates = newTxs
    .filter((t) => t.categoryId === 'other_exp')
    .sort((a, b) => b.amount - a.amount);

  for (const tx of expenseCandidates) {
    if (covered >= target || queue.length >= MAX_CLARIFY) break;
    queue.push(tx.id);
    covered += tx.amount;
  }

  const incomeCandidates = newTxs
    .filter((t) => t.categoryId === 'other_inc')
    .sort((a, b) => b.amount - a.amount);

  for (const tx of incomeCandidates) {
    if (queue.length >= MAX_CLARIFY) break;
    queue.push(tx.id);
  }

  return queue;
}

export { ClarifyCategoryStep };

function ClarifyCategoryStep({
  txIds,
  onDone,
}: {
  txIds: string[];
  onDone: () => void;
}) {
  const { transactions, updateTransaction } = useFinanceStore();
  const [index, setIndex] = useState(0);

  const queue = txIds
    .map((id) => transactions.find((t) => t.id === id))
    .filter(Boolean) as import('@/features/finance/store').Transaction[];

  if (queue.length === 0 || index >= queue.length) {
    setTimeout(onDone, 0);
    return null;
  }

  const tx = queue[index]!;
  const progress = index + 1;
  const total = queue.length;

  const pick = (categoryId: string) => {
    if (!categoryId) return;
    updateTransaction(tx.id, { categoryId });
    if (index + 1 >= queue.length) {
      onDone();
    } else {
      setIndex((i) => i + 1);
    }
  };

  const skip = () => {
    if (index + 1 >= queue.length) {
      onDone();
    } else {
      setIndex((i) => i + 1);
    }
  };

  const date = new Date(tx.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const amountStr = tx.amount.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽';

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={tx.id}
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -40 }}
        transition={{ duration: 0.22 }}
        className="py-2"
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-gray-400">Уточните категорию</span>
          <span className="text-xs font-semibold text-purple-500">{progress} / {total}</span>
        </div>
        <div className="flex gap-1 mb-5">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-all"
              style={{ background: i < progress ? '#6C63FF' : '#E5E7EB' }}
            />
          ))}
        </div>

        <div
          className="rounded-2xl p-4 mb-5"
          style={{ background: 'linear-gradient(135deg, #F0EEFF, #E8E4FF)' }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-800 text-sm leading-snug truncate">
                {tx.description || 'Без описания'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{date}</div>
            </div>
            <div
              className="text-lg font-bold flex-shrink-0"
              style={{ color: tx.type === 'income' ? '#10B981' : '#EF4444' }}
            >
              {tx.type === 'income' ? '+' : '−'}{amountStr}
            </div>
          </div>
        </div>

        <div className="mb-4">
          <CategoryPicker
            type={tx.type === 'income' ? 'income' : 'expense'}
            selected={tx.categoryId}
            onChange={pick}
          />
        </div>

        <button onClick={skip} className="w-full py-2 text-xs text-gray-400 haptic">
          Пропустить →
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── File Import Modal ────────────────────────────────────────────────────────

type ImportResult = {
  imported: number;
  skipped: number;
  dedupSkipped?: number;
  errors: string[];
  bankName?: string;
  preCategCount?: number;
  needsGroqCount?: number;
};

function FileImportModal({ onClose }: { onClose: () => void }) {
  const { addTransactionsBatch, transactions: allTransactions } = useFinanceStore();
  const { openModal, closeModal } = useUIStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [clarifyIds, setClarifyIds] = useState<string[]>([]);
  const [wizarding, setWizarding] = useState(false);

  useEffect(() => {
    openModal();
    return () => closeModal();
  }, [openModal, closeModal]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const prevent = (e: TouchEvent) => {
      if (scrollRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
    };
    overlay.addEventListener('touchmove', prevent, { passive: false });
    return () => overlay.removeEventListener('touchmove', prevent);
  }, []);

  // allTransactions is used by computeClarifyQueue — keep ref to avoid stale closure
  void allTransactions;

  const processFile = async (file: File) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'json' && ext !== 'xlsx' && ext !== 'xls' && ext !== 'pdf') {
      setResult({ imported: 0, skipped: 0, errors: ['Поддерживаются файлы .csv, .json, .xlsx и .pdf'] });
      return;
    }
    setIsProcessing(true);
    setProcessingStep('Читаем файл...');
    const errors: string[] = [];

    try {
      if (ext === 'xlsx' || ext === 'xls' || ext === 'pdf') {
        const buffer = await file.arrayBuffer();
        setProcessingStep('Разбираем транзакции...');

        let parseResult: { transactions: ParsedBankTx[]; bankName: string; skipped: number };
        if (ext === 'pdf') {
          setProcessingStep('Читаем PDF...');
          parseResult = await parseTbankPDF(buffer);
        } else {
          parseResult = await parseBankXLSX(buffer);
        }

        const { transactions, bankName, skipped } = parseResult;

        const preCategCount = transactions.filter((t) => t.categoryConfident).length;
        const needsGroqCount = transactions.length - preCategCount;

        let finalTransactions = transactions;
        if (needsGroqCount > 0) {
          setProcessingStep(`🤖 Groq AI: ${needsGroqCount} транзакций...`);
          try {
            finalTransactions = await recategorizeWithGroq(transactions);
          } catch {
            finalTransactions = transactions;
          }
        } else if (transactions.length > 0) {
          setProcessingStep('✅ Все категории определены по MCC/ключевым словам');
          await new Promise((r) => setTimeout(r, 600));
        }

        const idsBefore = new Set(useFinanceStore.getState().transactions.map((t) => t.id));

        const { imported, skipped: dedupSkipped } = addTransactionsBatch(finalTransactions);

        if (imported > 0) {
          cancelScheduledUpload();
          forceSyncToCloud().catch(() => {});
        }

        const stateAfter = useFinanceStore.getState();
        const newTxs = stateAfter.transactions.filter((t) => !idsBefore.has(t.id));
        const toAsk = computeClarifyQueue(newTxs, stateAfter.transactions);
        setClarifyIds(toAsk);

        setResult({ imported, skipped: skipped + dedupSkipped, dedupSkipped, errors, bankName, preCategCount, needsGroqCount });
      } else {
        setProcessingStep('Разбираем файл...');
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error('read error'));
          reader.readAsText(file, 'utf-8');
        });

        let rows: Array<Record<string, string>> = [];
        if (ext === 'json') {
          const parsed = JSON.parse(text);
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          rows = arr.map((item: any) => {
            const r: Record<string, string> = {};
            Object.keys(item).forEach((k) => { r[k.toLowerCase()] = String(item[k] ?? ''); });
            return r;
          });
        } else {
          rows = parseCSV(text);
        }

        let parseSkipped = 0;
        const validTxs: ParsedBankTx[] = [];
        rows.forEach((row, i) => {
          const tx = rowToTransactionGeneric(row);
          if (tx) {
            validTxs.push(tx);
          } else {
            parseSkipped++;
            if (errors.length < 3) errors.push(`Строка ${i + 2}: неверный формат`);
          }
        });
        const { imported, skipped: dedupSkipped } = addTransactionsBatch(validTxs);
        setResult({ imported, skipped: parseSkipped + dedupSkipped, dedupSkipped, errors, preCategCount: 0, needsGroqCount: 0 });
      }
    } catch (err) {
      errors.push('Ошибка разбора файла: ' + (err instanceof Error ? err.message : 'неизвестная ошибка'));
      setResult({ imported: 0, skipped: 0, errors });
    }

    setIsProcessing(false);
    setProcessingStep('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  return createPortal(
    <motion.div
      ref={overlayRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(26,26,46,0.65)', backdropFilter: 'blur(6px)', touchAction: 'none' }}
      onClick={(e) => { if (e.target === e.currentTarget && !isProcessing) onClose(); }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full bg-white rounded-t-3xl"
        style={{ maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 pt-4 pb-2 px-6">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 pb-4"
          style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'none', touchAction: 'pan-y' }}
        >
          {!result ? (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">📂 Импорт выписки из банка</h2>
              <p className="text-sm text-gray-400 mb-5">Загрузите выписку из мобильного банка (.xlsx, .pdf)</p>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all mb-4"
                style={{
                  borderColor: dragOver ? '#6C63FF' : 'rgba(108,99,255,0.25)',
                  background: dragOver ? 'rgba(108,99,255,0.06)' : '#F8F7FF',
                }}
              >
                {isProcessing ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="text-4xl mb-3 inline-block"
                  >
                    ⚙️
                  </motion.div>
                ) : (
                  <div className="text-4xl mb-3">📁</div>
                )}
                <div className="font-semibold text-gray-700 mb-1">
                  {isProcessing ? (processingStep || 'Анализируем транзакции...') : 'Нажмите или перетащите файл'}
                </div>
                <div className="text-xs text-gray-400">Альфа-Банк, Сбер, Т-Банк, ВТБ (.xlsx) · Т-Банк PDF</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json,.xlsx,.xls,.pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              <div className="rounded-2xl p-4 mb-3" style={{ background: '#F0EEFF' }}>
                <div className="text-xs font-bold text-purple-700 mb-2">🏦 Как получить выписку</div>
                <div className="text-xs text-purple-600 leading-relaxed space-y-1">
                  <div>1. Откройте мобильное приложение банка</div>
                  <div>2. Перейдите в раздел «Выписка» или «История»</div>
                  <div>3. Выберите период и формат Excel (.xlsx)</div>
                  <div>4. Скачайте файл и загрузите сюда</div>
                </div>
              </div>

              <div className="rounded-2xl p-4" style={{ background: '#E8FFF5' }}>
                <div className="text-xs font-bold text-green-700 mb-2">🤖 Умная категоризация</div>
                <div className="text-xs text-green-600 leading-relaxed">
                  Альфа-Банк: категории определяются по MCC-коду (ISO 18245) — точно и без AI. Groq Llama 3.1 используется только для оставшихся транзакций.
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className="text-6xl mb-4"
              >
                {result.imported > 0 ? '🎉' : '⚠️'}
              </motion.div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {result.imported > 0 ? 'Импорт завершён!' : 'Ничего не импортировано'}
              </h3>
              {result.bankName && (
                <p className="text-sm text-purple-600 font-medium mb-3">
                  🏦 Распознан: {result.bankName}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 mb-5">
                <div className="rounded-2xl p-3 text-center" style={{ background: 'linear-gradient(135deg, #E8FFF5, #D0FFE8)' }}>
                  <div className="text-2xl font-bold text-green-600">{result.imported}</div>
                  <div className="text-xs text-green-500">Импортировано</div>
                </div>
                <div className="rounded-2xl p-3 text-center" style={{ background: 'linear-gradient(135deg, #FFF5F5, #FFE0E0)' }}>
                  <div className="text-2xl font-bold text-red-400">{result.skipped}</div>
                  <div className="text-xs text-red-400">Пропущено</div>
                </div>
              </div>
              {(result.dedupSkipped ?? 0) > 0 && (
                <div className="rounded-2xl p-3 mb-3 text-center" style={{ background: 'linear-gradient(135deg, #FFF8E8, #FFF0C8)' }}>
                  <div className="text-sm font-bold text-amber-600">🔁 {result.dedupSkipped} дублей пропущено</div>
                  <div className="text-xs text-amber-500 mt-0.5">Эти транзакции уже есть в вашей истории</div>
                </div>
              )}
              {result.imported > 0 && (
                <div className="rounded-2xl p-4 mb-4 text-left" style={{ background: '#F0FFF8', border: '1px solid rgba(0,200,150,0.2)' }}>
                  <div className="text-sm font-bold text-green-700 mb-1">✅ Что сделано</div>
                  <div className="text-xs text-green-600 leading-relaxed space-y-1">
                    {(result.preCategCount ?? 0) > 0 && (
                      <div>• {result.preCategCount} транзакций категоризированы по MCC/ключевым словам</div>
                    )}
                    {(result.needsGroqCount ?? 0) > 0 && (
                      <div>• {result.needsGroqCount} транзакций уточнены через Groq AI</div>
                    )}
                    {(result.needsGroqCount ?? 0) === 0 && (result.preCategCount ?? 0) > 0 && (
                      <div>• Groq AI не потребовался — все категории определены точно</div>
                    )}
                    {(result.dedupSkipped ?? 0) > 0 && (
                      <div>• {result.dedupSkipped} дублей автоматически пропущено</div>
                    )}
                    <div>• Внутренние переводы между счетами пропущены</div>
                    <div>• Описания очищены от технических данных</div>
                  </div>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="rounded-2xl p-3 text-left" style={{ background: '#FFF8F0', border: '1px solid rgba(255,107,53,0.2)' }}>
                  <div className="text-xs font-bold text-orange-600 mb-1">⚠️ Предупреждения</div>
                  {result.errors.map((err, i) => (
                    <div key={i} className="text-xs text-orange-500">{err}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {wizarding && (
            <PostImportWizard clarifyIds={clarifyIds} onDone={onClose} />
          )}
        </div>

        {result && !wizarding && (
          <div
            className="flex-shrink-0 px-6 pt-3 border-t border-gray-100"
            style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="flex gap-2">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => { setResult(null); setClarifyIds([]); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                className="flex-1 py-3 rounded-2xl font-semibold text-sm haptic"
                style={{ background: '#F0EEFF', color: '#6C63FF' }}
              >
                Ещё файл
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setWizarding(true)}
                className="flex-1 py-3 text-white rounded-2xl font-bold text-sm haptic"
                style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)' }}
              >
                {clarifyIds.length > 0 ? `Настроить (${clarifyIds.length} вопросов) →` : 'Настроить бюджет →'}
              </motion.button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>,
    document.body
  );
}

// ─── Notification Bottom Sheet (TASK-020) ────────────────────────────────────

function NotificationSheet({ onClose }: { onClose: () => void }) {
  const { notificationSettings, updateNotificationSettings } = useFinanceStore();
  const { openModal, closeModal } = useUIStore();
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openModal();
    return () => closeModal();
  }, [openModal, closeModal]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const prevent = (e: TouchEvent) => { e.preventDefault(); };
    overlay.addEventListener('touchmove', prevent, { passive: false });
    return () => overlay.removeEventListener('touchmove', prevent);
  }, []);

  const settings = [
    {
      key: 'budgetAlerts' as const,
      label: 'Превышение бюджета',
      icon: '⚠️',
      desc: 'Когда расходы достигают 80% или 100% лимита',
    },
    {
      key: 'recurringReminders' as const,
      label: 'Регулярные платежи',
      icon: '📅',
      desc: 'Напоминание за 3 дня до платежа',
    },
    {
      key: 'weeklyReport' as const,
      label: 'Еженедельный отчёт',
      icon: '📊',
      desc: 'Краткая сводка за неделю каждое воскресенье в 21:00',
    },
    {
      key: 'aiInsights' as const,
      label: 'AI-инсайты',
      icon: '🤖',
      desc: 'Персональные советы от FinWise AI',
    },
  ];

  const allEnabled = settings.every((s) => notificationSettings[s.key]);

  /** Sync a partial patch to finance-service (fire-and-forget, offline-safe) */
  const syncToBackend = (patch: Partial<typeof notificationSettings>) => {
    apiClient.put('/settings/notifications', patch).catch(() => {
      // Silent fail — settings are saved locally in Zustand store regardless
    });
  };

  const handleToggle = (key: keyof typeof notificationSettings) => {
    const newVal = !notificationSettings[key];
    updateNotificationSettings({ [key]: newVal });
    syncToBackend({ [key]: newVal });
    toast.success('Настройки сохранены');
  };

  const handleDisableAll = () => {
    const patch = Object.fromEntries(settings.map((s) => [s.key, false])) as Partial<typeof notificationSettings>;
    updateNotificationSettings(patch);
    syncToBackend(patch);
    toast('Все уведомления отключены', { icon: '🔕' });
  };

  return createPortal(
    <motion.div
      ref={overlayRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(26,26,46,0.65)', backdropFilter: 'blur(6px)', touchAction: 'none' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full bg-white rounded-t-3xl overflow-hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="pt-4 pb-1 px-6">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-3 pb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">🔔 Уведомления</h2>
            <p className="text-xs text-gray-400 mt-0.5">Настройте, какие уведомления получать</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 haptic"
            style={{ background: '#F3F4F6' }}
          >
            ✕
          </button>
        </div>

        {/* Toggles */}
        <div className="px-4 pb-2">
          <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            {settings.map((s, i) => (
              <div
                key={s.key}
                className={`flex items-center gap-3 px-4 py-3.5 ${i > 0 ? 'border-t border-gray-50' : ''}`}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                  style={{ background: '#F8F7FF' }}
                >
                  {s.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 text-sm">{s.label}</div>
                  <div className="text-xs text-gray-400 leading-tight mt-0.5">{s.desc}</div>
                </div>
                <button
                  onClick={() => handleToggle(s.key)}
                  className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 haptic ${
                    notificationSettings[s.key] ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                  aria-label={`Toggle ${s.label}`}
                >
                  <motion.div
                    animate={{ x: notificationSettings[s.key] ? 24 : 2 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Disable all */}
        <div className="px-4 pt-2 pb-4">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleDisableAll}
            disabled={!allEnabled}
            className="w-full py-3 rounded-2xl font-semibold text-sm haptic disabled:opacity-40"
            style={{ background: '#FFF5F5', color: '#FF4757' }}
          >
            Отключить все
          </motion.button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

// ─── Profile Page ─────────────────────────────────────────────────────────────

export function ProfilePage() {
  const { user, logout } = useAuthStore();
  const financeStore = useFinanceStore();
  const { streak, transactions, clearAllData } = financeStore;
  const [showFileModal, setShowFileModal] = useState(false);
  const [showNotifSheet, setShowNotifSheet] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // ── Achievements: unlocked + up to 2 closest to completion ──────────────────
  const unlockedAchievements = ACHIEVEMENTS.filter((a) => a.check(financeStore));
  const lockedAchievements = ACHIEVEMENTS.filter((a) => !a.check(financeStore));

  const closestToUnlock = lockedAchievements
    .map((ach) => {
      const p = ach.getProgress(financeStore);
      const ratio = p && p.target > 0 ? p.current / p.target : 0;
      return { ach, p, ratio };
    })
    .filter((x) => x.ratio > 0)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 2);

  const achievementsToShow = [
    ...unlockedAchievements.map((ach) => ({ ach, unlocked: true, p: null })),
    ...closestToUnlock.map(({ ach, p }) => ({ ach, unlocked: false, p })),
  ];

  const sectionLabel = 'text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-2';

  return (
    <div className="px-4 pt-5 pb-4 space-y-3" style={{ background: 'var(--bg-warm)' }}>

      {/* ── User card ──────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-5 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
      >
        <div
          className="absolute -top-6 -right-6 w-28 h-28 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #6C63FF, transparent)' }}
        />
        <div className="flex items-center gap-4 relative">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl overflow-hidden flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.15)' }}
          >
            {user?.photoUrl ? (
              <img src={user.photoUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              '👤'
            )}
          </div>
          <div>
            <div className="text-xl font-bold">
              {user?.firstName ?? 'Пользователь'}{user?.lastName ? ` ${user.lastName}` : ''}
            </div>
            {user?.username ? (
              <div className="text-gray-400 text-sm">@{user.username}</div>
            ) : null}
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-sm">🔥</span>
              <span className="text-orange-300 text-xs font-semibold">{streak} дней подряд</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Achievements ───────────────────────────────────────────────────── */}
      <div>
        <div className={sectionLabel}>
          Достижения · {unlockedAchievements.length} из {ACHIEVEMENTS.length}
        </div>
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
          {achievementsToShow.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="text-4xl mb-2">🎯</div>
              <div className="text-sm font-semibold text-gray-700 mb-1">Начни свой путь</div>
              <div className="text-xs text-gray-400">Добавь первую транзакцию, чтобы начать</div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 p-4">
              {achievementsToShow.map(({ ach, unlocked, p }) => (
                <motion.div
                  key={ach.id}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-2xl p-3 text-center"
                  style={{
                    background: unlocked ? '#F0EEFF' : '#F8F9FA',
                    border: unlocked ? 'none' : '1px dashed #E5E7EB',
                  }}
                >
                  <div className="text-3xl mb-1">{ach.icon}</div>
                  <div className="text-xs font-semibold text-gray-700 leading-tight">{ach.name}</div>
                  {unlocked ? (
                    <div className="text-xs text-purple-500 mt-0.5 font-medium">✅</div>
                  ) : (
                    p && (
                      <div className="mt-1.5">
                        <div className="w-full bg-gray-200 rounded-full h-1 mb-1">
                          <div
                            className="bg-purple-400 h-1 rounded-full transition-all"
                            style={{ width: `${Math.min((p.current / p.target) * 100, 100)}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-gray-400 leading-tight">{p.label}</div>
                      </div>
                    )
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Settings ───────────────────────────────────────────────────────── */}
      <div>
        <div className={sectionLabel}>Настройки</div>
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
          {[
            { icon: '📂', label: 'Импорт выписки из банка', action: () => setShowFileModal(true) },
            { icon: '🔔', label: 'Уведомления', action: () => setShowNotifSheet(true) },
            { icon: '🔒', label: 'Конфиденциальность', action: () => alert('Все данные хранятся локально на вашем устройстве') },
            { icon: '❓', label: 'Помощь', action: () => alert('Напишите нам: @finwise_support') },
          ].map((item, i) => (
            <button
              key={item.label}
              onClick={item.action}
              className={`w-full flex items-center gap-3 px-4 py-4 haptic active:bg-gray-50 ${i > 0 ? 'border-t border-gray-50' : ''}`}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: '#F8F7FF' }}>
                {item.icon}
              </div>
              <span className="flex-1 text-left font-semibold text-gray-800 text-sm">{item.label}</span>
              <span className="text-gray-300 text-lg">›</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Destructive zone ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
        <button
          onClick={() => setShowClearConfirm(true)}
          className="w-full flex items-center gap-3 px-4 py-4 haptic active:bg-red-50"
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: '#FFF5F5' }}>
            🗑️
          </div>
          <span className="flex-1 text-left font-semibold text-sm" style={{ color: '#FF4757' }}>
            Удалить все транзакции
          </span>
          <span className="text-red-200 text-lg">›</span>
        </button>
      </div>

      {/* ── Logout ─────────────────────────────────────────────────────────── */}
      <button
        onClick={logout}
        className="w-full py-4 rounded-2xl font-semibold haptic text-sm"
        style={{ border: '2px solid #FFE0E0', color: '#FF4757', background: '#FFF5F5' }}
      >
        Выйти из аккаунта
      </button>

      {/* ── Modals / Sheets ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showFileModal && <FileImportModal onClose={() => setShowFileModal(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showNotifSheet && <NotificationSheet onClose={() => setShowNotifSheet(false)} />}
      </AnimatePresence>

      {createPortal(
        <AnimatePresence>
          {showClearConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center px-6"
              style={{ background: 'rgba(26,26,46,0.7)', backdropFilter: 'blur(6px)' }}
              onClick={() => setShowClearConfirm(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className="bg-white rounded-3xl p-6 w-full max-w-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-4xl text-center mb-3">🗑️</div>
                <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Удалить все данные?</h3>
                <p className="text-sm text-gray-500 text-center mb-6 leading-relaxed">
                  Все транзакции, цели и история чата будут удалены безвозвратно. Данные также будут удалены из облака.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="flex-1 py-3 rounded-2xl font-semibold text-sm haptic"
                    style={{ background: '#F0EEFF', color: '#6C63FF' }}
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => { clearAllData(); setShowClearConfirm(false); }}
                    className="flex-1 py-3 rounded-2xl font-bold text-sm text-white haptic"
                    style={{ background: 'linear-gradient(135deg, #FF4757, #FF6B81)' }}
                  >
                    Удалить всё
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
