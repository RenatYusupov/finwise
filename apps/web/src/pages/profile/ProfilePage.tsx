import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/features/auth/store';
import { useFinanceStore, debugCloudStorage, rehydrateFromCloud, forceSyncToCloud, clearCloudStorage, cancelScheduledUpload } from '@/features/finance/store';
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

  // Only send transactions that were NOT already confidently categorized by MCC/keyword.
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
    // Send all uncategorized transactions to backend in one request (backend handles batching)
    const payload = needsGroq.map((item, batchIdx) => ({
      idx: batchIdx,
      description: item.tx.description,
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
        // Map batch index back to original transaction index
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

const ACHIEVEMENTS = [
  { id: 'first_tx', icon: '🎯', name: 'Первая трата', desc: 'Добавь первую операцию', check: (s: any) => s.transactions.length >= 1 },
  { id: 'saver', icon: '💰', name: 'Копилка', desc: 'Сбережения > 20%', check: (s: any) => s.getMonthSummary().savingsRate >= 20 },
  { id: 'goal_setter', icon: '🌟', name: 'Целеустремлённый', desc: 'Создай первую цель', check: (s: any) => s.goals.length >= 1 },
  { id: 'goal_done', icon: '🏆', name: 'Достигатор', desc: 'Выполни цель на 100%', check: (s: any) => s.goals.some((g: any) => g.currentAmount >= g.targetAmount) },
  { id: 'streak_3', icon: '🔥', name: 'Огонь', desc: '3 дня подряд', check: (s: any) => s.streak >= 3 },
  { id: 'streak_7', icon: '⚡', name: 'Молния', desc: '7 дней подряд', check: (s: any) => s.streak >= 7 },
  { id: 'tx_10', icon: '📊', name: 'Аналитик', desc: '10 операций', check: (s: any) => s.transactions.length >= 10 },
  { id: 'tx_50', icon: '💎', name: 'Профи', desc: '50 операций', check: (s: any) => s.transactions.length >= 50 },
  { id: 'big_saver', icon: '👑', name: 'Бриллиант', desc: 'Накопи 100 000 ₽', check: (s: any) => s.goals.some((g: any) => g.currentAmount >= 100000) },
];

// ─── File Import Modal ────────────────────────────────────────────────────────

type ImportResult = {
  imported: number;
  skipped: number;
  /** Transactions skipped because they were exact duplicates */
  dedupSkipped?: number;
  errors: string[];
  bankName?: string;
  /** Transactions categorized by MCC/keyword — did NOT need Groq */
  preCategCount?: number;
  /** Transactions that were sent to Groq */
  needsGroqCount?: number;
};

// ─── Category Clarification Step ─────────────────────────────────────────────
// Shown after import result for transactions that need clarification.
//
// Selection logic:
//   1. Only transactions with amount ≥ MIN_CLARIFY_AMOUNT (5000 ₽)
//   2. Only other_exp / other_inc (truly uncategorized)
//   3. Ask the minimum number needed to reach 90% category coverage
//      within the current month's expense amount.
//      Coverage = (total expense amount - other_exp amount) / total expense amount
//   4. Hard cap at MAX_CLARIFY questions to avoid fatigue.

const MAX_CLARIFY = 15;
const MIN_CLARIFY_AMOUNT = 1000;

/**
 * Given newly imported transactions, compute which ones to ask about.
 *
 * Strategy: show ALL newly imported other_exp / other_inc transactions
 * with amount ≥ MIN_CLARIFY_AMOUNT, sorted by amount descending, capped
 * at MAX_CLARIFY to avoid fatigue.
 *
 * We no longer use the greedy 90%-coverage heuristic here — that caused
 * only 1 question to be shown when a single large transaction covered the
 * gap. The wizard is a full onboarding flow, so we want to clarify as many
 * uncategorized transactions as reasonably possible.
 */
function computeClarifyQueue(
  newTxs: import('@/features/finance/store').Transaction[],
  _allTxs: import('@/features/finance/store').Transaction[],
): string[] {
  return newTxs
    .filter(
      (t) =>
        (t.categoryId === 'other_exp' || t.categoryId === 'other_inc') &&
        t.amount >= MIN_CLARIFY_AMOUNT,
    )
    .sort((a, b) => b.amount - a.amount)
    .slice(0, MAX_CLARIFY)
    .map((t) => t.id);
}

const CLARIFY_EXPENSE_CATS = [
  { id: 'food',          icon: '🍔', name: 'Еда' },
  { id: 'cafe',          icon: '☕', name: 'Кафе' },
  { id: 'transport',     icon: '🚗', name: 'Транспорт' },
  { id: 'shopping',      icon: '🛍️', name: 'Покупки' },
  { id: 'health',        icon: '💊', name: 'Здоровье' },
  { id: 'entertainment', icon: '🎮', name: 'Развлечения' },
  { id: 'sport',         icon: '🏋️', name: 'Спорт' },
  { id: 'beauty',        icon: '💄', name: 'Красота' },
  { id: 'home',          icon: '🏠', name: 'Дом' },
  { id: 'education',     icon: '📚', name: 'Учёба' },
  { id: 'travel',        icon: '✈️', name: 'Путешествия' },
  { id: 'other_exp',     icon: '💸', name: 'Другое' },
];

const CLARIFY_INCOME_CATS = [
  { id: 'salary',     icon: '💼', name: 'Зарплата' },
  { id: 'freelance',  icon: '💻', name: 'Фриланс' },
  { id: 'gift',       icon: '🎁', name: 'Подарок' },
  { id: 'investment', icon: '📈', name: 'Инвестиции' },
  { id: 'cashback',   icon: '💳', name: 'Кэшбэк' },
  { id: 'other_inc',  icon: '💰', name: 'Другое' },
];

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
    // All done — call onDone on next tick to avoid render-during-render
    setTimeout(onDone, 0);
    return null;
  }

  const tx = queue[index]!;
  const cats = tx.type === 'income' ? CLARIFY_INCOME_CATS : CLARIFY_EXPENSE_CATS;
  const progress = index + 1;
  const total = queue.length;

  const pick = (categoryId: string) => {
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
        {/* Progress */}
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

        {/* Transaction card */}
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

        {/* Category chips */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {cats.map((cat) => (
            <motion.button
              key={cat.id}
              whileTap={{ scale: 0.93 }}
              onClick={() => pick(cat.id)}
              className="flex flex-col items-center gap-1 py-3 rounded-2xl text-center haptic"
              style={{
                background: tx.categoryId === cat.id ? '#6C63FF' : '#F3F4F6',
                color: tx.categoryId === cat.id ? '#fff' : '#374151',
              }}
            >
              <span className="text-xl leading-none">{cat.icon}</span>
              <span className="text-xs font-medium leading-tight">{cat.name}</span>
            </motion.button>
          ))}
        </div>

        {/* Skip */}
        <button
          onClick={skip}
          className="w-full py-2 text-xs text-gray-400 haptic"
        >
          Пропустить →
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── File Import Modal ────────────────────────────────────────────────────────

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
  /** IDs of imported transactions that need category clarification */
  const [clarifyIds, setClarifyIds] = useState<string[]>([]);
  /** Whether we're in the post-import wizard (after result screen) */
  const [wizarding, setWizarding] = useState(false);

  useEffect(() => {
    openModal();
    return () => closeModal();
  }, [openModal, closeModal]);

  // Block background scroll in Telegram WebView (passive:false required for preventDefault)
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

        // Count how many are already confidently categorized (MCC / keyword / Alfa text)
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
          // Small delay so user sees the message
          await new Promise((r) => setTimeout(r, 600));
        }

        // Snapshot IDs before import so we can identify newly added transactions
        const idsBefore = new Set(useFinanceStore.getState().transactions.map((t) => t.id));

        const { imported, skipped: dedupSkipped } = addTransactionsBatch(finalTransactions);

        // Fire cloud sync in the background — do NOT await it.
        // Data is already safely in localStorage at this point.
        // Awaiting forceSyncToCloud() with 1500 transactions blocks the UI for
        // 10–30s while each chunk round-trips to Telegram CloudStorage.
        if (imported > 0) {
          cancelScheduledUpload(); // cancel pending debounce to avoid double-write
          forceSyncToCloud().catch(() => {/* ignore — local data is safe */});
        }

        // Compute which newly imported transactions need category clarification.
        // Uses 90% monthly coverage logic — only asks the minimum needed.
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
        {/* Drag handle — fixed, not scrollable */}
        <div className="flex-shrink-0 pt-4 pb-2 px-6">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
        </div>

        {/* Scrollable content area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 pb-4"
          style={{
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'none',
            touchAction: 'pan-y',
          }}
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

          {/* Post-import wizard — shown after result screen */}
          {wizarding && (
            <PostImportWizard
              clarifyIds={clarifyIds}
              onDone={onClose}
            />
          )}
        </div>

        {/* Fixed footer — always visible, never scrolls away */}
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

// ─── Cloud Sync Debug Panel ───────────────────────────────────────────────────

function CloudSyncPanel({ localTxCount }: { localTxCount: number }) {
  const [status, setStatus] = useState<string>('Нажмите "Проверить" для диагностики');
  const [loading, setLoading] = useState(false);
  const [cloudTxCount, setCloudTxCount] = useState<number | null>(null);

  const check = async () => {
    setLoading(true);
    setStatus('Проверяем...');
    const info = await debugCloudStorage();
    if (!info.available) {
      setStatus('❌ CloudStorage недоступен на этом устройстве\n(Telegram Desktop старой версии или браузер)');
      setCloudTxCount(null);
    } else if (info.error) {
      setStatus(`❌ Ошибка чтения: ${info.error}\n⚠️ Данные в облаке повреждены — нажмите "Сбросить облако" затем "↑ В облако"`);
      setCloudTxCount(0);
    } else {
      const ct = info.txCount ?? 0;
      setCloudTxCount(ct);
      setStatus(
        `☁️ Cloud: ${ct} транзакций\n📱 Local: ${localTxCount} транзакций`
      );
    }
    setLoading(false);
  };

  // Pull from cloud → merge into local (safe: only adds, never removes)
  const pullFromCloud = async () => {
    setLoading(true);
    setStatus('Загружаем из облака...');
    await rehydrateFromCloud().catch(() => {});
    setStatus(`✅ Данные из облака загружены\n📱 Local: ${localTxCount} транзакций`);
    setLoading(false);
  };

  // Clear corrupted cloud data, then re-upload local data cleanly
  const resetAndPush = async () => {
    setLoading(true);
    setStatus('Очищаем облако...');
    await clearCloudStorage().catch(() => {});
    setStatus('Записываем данные в облако...');
    const result = await forceSyncToCloud().catch(() => '❌ Ошибка записи');
    setStatus(result);
    setLoading(false);
  };

  // Push local → cloud (upload this device's data)
  const pushToCloud = async () => {
    setLoading(true);
    setStatus('Загружаем в облако...');
    const result = await forceSyncToCloud().catch(() => '❌ Ошибка');
    setStatus(result);
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(108,99,255,0.15)' }}>
      <div className="text-sm font-bold text-gray-800 mb-1">☁️ Синхронизация</div>
      <div className="text-xs text-gray-400 mb-2">Данные синхронизируются между устройствами через Telegram CloudStorage</div>
      <div className="text-xs text-gray-600 whitespace-pre-line mb-3 min-h-[2.5rem] p-2 rounded-xl" style={{ background: '#F8F7FF' }}>{status}</div>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={check}
          disabled={loading}
          className="flex-1 py-2 rounded-xl text-xs font-semibold haptic disabled:opacity-50"
          style={{ background: '#F0EEFF', color: '#6C63FF', minWidth: '70px' }}
        >
          Проверить
        </button>
        <button
          onClick={pullFromCloud}
          disabled={loading || cloudTxCount === 0}
          className="flex-1 py-2 rounded-xl text-xs font-semibold haptic disabled:opacity-50"
          style={{ background: '#E8FFF5', color: '#00C896', minWidth: '70px' }}
        >
          ↓ Из облака
        </button>
        <button
          onClick={pushToCloud}
          disabled={loading}
          className="flex-1 py-2 rounded-xl text-xs font-semibold haptic disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)', color: 'white', minWidth: '70px' }}
        >
          ↑ В облако
        </button>
        <button
          onClick={resetAndPush}
          disabled={loading}
          className="flex-1 py-2 rounded-xl text-xs font-semibold haptic disabled:opacity-50"
          style={{ background: '#FFF5F5', color: '#FF4757', minWidth: '70px' }}
        >
          Сбросить
        </button>
      </div>
    </div>
  );
}

// ─── Profile Page ─────────────────────────────────────────────────────────────

export function ProfilePage() {
  const { user, logout } = useAuthStore();
  const financeStore = useFinanceStore();
  const { streak, transactions, goals, getMonthSummary, clearAllData } = financeStore;
  const [showFileModal, setShowFileModal] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const summary = getMonthSummary();
  const unlockedAchievements = ACHIEVEMENTS.filter((a) => a.check(financeStore));
  const totalSaved = goals.reduce((s, g) => s + g.currentAmount, 0);

  return (
    <div className="px-4 pt-5 pb-4 space-y-3" style={{ background: 'var(--bg-warm)' }}>
      {/* User card */}
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
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl overflow-hidden"
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
              {user?.firstName ?? 'Пользователь'} {user?.lastName ?? ''}
            </div>
            <div className="text-gray-400 text-sm">@{user?.username ?? 'finwise_user'}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-sm">🔥</span>
              <span className="text-orange-300 text-xs font-semibold">{streak} дней подряд</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Достижений', value: unlockedAchievements.length + '/' + ACHIEVEMENTS.length, icon: '🏆', color: '#FFB800', bg: '#FFFBEB' },
          { label: 'Операций', value: String(transactions.length), icon: '📊', color: '#6C63FF', bg: '#F0EEFF' },
          { label: 'Накоплено', value: formatCurrency(totalSaved), icon: '💰', color: '#00C896', bg: '#E8FFF5' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl p-3 text-center" style={{ background: stat.bg }}>
            <div className="text-2xl mb-1">{stat.icon}</div>
            <div className="text-base font-bold" style={{ color: stat.color }}>{stat.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Finance summary */}
      <div className="bg-white rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="text-sm font-bold text-gray-800 mb-3">💰 Финансовый итог</div>
        <div className="space-y-2.5">
          {[
            { label: 'Доходы за месяц', value: formatCurrency(summary.income), color: '#00C896' },
            { label: 'Расходы за месяц', value: formatCurrency(summary.expenses), color: '#FF4757' },
            { label: 'Накоплено в целях', value: formatCurrency(totalSaved), color: '#6C63FF' },
            { label: 'Норма сбережений', value: summary.savingsRate + '%', color: summary.savingsRate >= 20 ? '#00C896' : '#FFB800' },
          ].map((item) => (
            <div key={item.label} className="flex justify-between items-center">
              <span className="text-sm text-gray-500">{item.label}</span>
              <span className="text-sm font-bold" style={{ color: item.color }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Achievements */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-gray-900 text-sm">🏆 Достижения</h2>
          <span className="text-xs text-gray-400">{unlockedAchievements.length} из {ACHIEVEMENTS.length}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {ACHIEVEMENTS.map((ach, i) => {
            const unlocked = ach.check(financeStore);
            return (
              <motion.div
                key={ach.id}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04 }}
                className="bg-white rounded-2xl p-3 text-center"
                style={{
                  boxShadow: 'var(--shadow-card)',
                  opacity: unlocked ? 1 : 0.4,
                  filter: unlocked ? 'none' : 'grayscale(1)',
                }}
              >
                <div className="text-3xl mb-1">{ach.icon}</div>
                <div className="text-xs font-semibold text-gray-700 leading-tight">{ach.name}</div>
                {!unlocked && <div className="text-xs text-gray-400 mt-0.5 leading-tight">{ach.desc}</div>}
                {unlocked && <div className="text-xs text-green-500 mt-0.5 font-medium">✅</div>}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Settings */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
        {[
          { icon: '🔔', label: 'Уведомления', action: () => alert('Уведомления настраиваются в Telegram') },
          { icon: '📂', label: 'Импорт выписки из банка', action: () => setShowFileModal(true) },
          { icon: '🔒', label: 'Конфиденциальность', action: () => alert('Все данные хранятся локально на вашем устройстве') },
          { icon: '❓', label: 'Помощь', action: () => alert('Напишите нам: @finwise_support') },
          { icon: '🗑️', label: 'Удалить все транзакции', action: () => setShowClearConfirm(true) },
        ].map((item, i) => (
          <button
            key={item.label}
            onClick={item.action}
            className={`w-full flex items-center gap-3 px-4 py-4 haptic active:bg-gray-50 ${i > 0 ? 'border-t border-gray-50' : ''}`}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: '#F8F7FF' }}>
              {item.icon}
            </div>
            <span className="flex-1 text-left font-semibold text-gray-800 text-sm">{item.label}</span>
            <span className="text-gray-300 text-lg">›</span>
          </button>
        ))}
      </div>

      {/* Cloud sync debug panel */}
      <CloudSyncPanel localTxCount={transactions.length} />

      {/* Logout */}
      <button
        onClick={logout}
        className="w-full py-4 rounded-2xl font-semibold haptic text-sm"
        style={{ border: '2px solid #FFE0E0', color: '#FF4757', background: '#FFF5F5' }}
      >
        Выйти из аккаунта
      </button>

      <AnimatePresence>
        {showFileModal && <FileImportModal onClose={() => setShowFileModal(false)} />}
      </AnimatePresence>

      {/* Confirm delete all dialog — portal with AnimatePresence INSIDE */}
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
                    onClick={() => {
                      clearAllData();
                      setShowClearConfirm(false);
                    }}
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
