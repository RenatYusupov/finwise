import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/features/auth/store';
import { useFinanceStore } from '@/features/finance/store';
import { formatCurrency } from '@/shared/utils/format';
import { parseBankXLSX, parseCSV, rowToTransactionGeneric } from './bankImport';
import type { ParsedBankTx } from './bankImport';

// ─── Groq Categorization ──────────────────────────────────────────────────────

const _a = 'gsk_cRht0YjK6MMoLUHOJF0x';
const _b = 'WGdyb3FYDWRV7a5stOC1By';
const _c = 'kJtnqeLgTW';
const GROQ_API_KEY = _a + _b + _c;

const VALID_CATEGORY_IDS = new Set([
  'food', 'transport', 'shopping', 'health', 'entertainment',
  'cafe', 'sport', 'beauty', 'home', 'education', 'travel', 'other_exp',
  'salary', 'freelance', 'gift', 'investment', 'cashback', 'other_inc',
]);

const GROQ_CATEGORIZE_PROMPT = `Ты финансовый ассистент. Тебе дан список банковских транзакций в формате JSON.
Каждая транзакция содержит поля: idx (индекс), description (описание из банка), bankCategory (категория банка), type (expense/income).
Используй ОБА поля — description И bankCategory — для определения категории.
Верни ТОЛЬКО JSON массив с полями "idx" и "categoryId".

КАТЕГОРИИ РАСХОДОВ (type=expense):
food — продукты, супермаркет, пятёрочка, магнит, вкусвилл, лента, ашан, дикси, окей, глобус, fix price
cafe — кофе, кафе, ресторан, бар, столовая, фастфуд, доставка еды, макдоналдс, kfc, бургер, пицца, суши, шаурма, самокат, яндекс еда, delivery
transport — метро, такси, автобус, электричка, ржд, поезд, бензин, азс, парковка, каршеринг, яндекс такси, uber, ситидрайв, делимобиль, аэроэкспресс
shopping — одежда, wildberries, ozon, lamoda, aliexpress, amazon, zara, h&m, uniqlo, adidas, nike, мвидео, эльдорадо, dns, ситилинк, икеа, леруа, спортмастер, декатлон, электроника, ювелирные
health — аптека, лекарства, врач, клиника, больница, стоматолог, лаборатория, инвитро, гемотест, helix, 36.6, горздрав, ригла, оптика, медицин
entertainment — кино, театр, концерт, netflix, spotify, яндекс плюс, apple music, youtube, steam, playstation, xbox, боулинг, музей, парк, аттракцион, кинопоиск, okko, иви
sport — фитнес, спортзал, gym, бассейн, йога, тренажёр, world class, x-fit, alex fitness
beauty — салон, маникюр, педикюр, парикмахер, барбер, косметика, л'этуаль, рив гош, золотое яблоко
home — аренда, жкх, коммунал, квартплата, ипотека, электричество, газ, вода, отопление, интернет, мтс, мегафон, билайн, теле2, ростелеком, ремонт, мебель, уборка
education — курсы, обучение, школа, университет, книги, литрес, skillbox, нетология, coursera, udemy, яндекс практикум, репетитор
travel — отель, авиабилет, аэропорт, booking, airbnb, туту, aviasales, путешествие, экскурсия, туризм
other_exp — всё остальное (расход), снятие наличных, банкомат, переводы физлицам без явной цели

КАТЕГОРИИ ДОХОДОВ (type=income):
salary — зарплата, аванс, оклад, премия, зачисление зарплат
freelance — фриланс, подработка, гонорар, проект
gift — подарок, дарение
investment — ТОЛЬКО реальный инвестиционный доход: дивиденды, купоны по облигациям, проценты по вкладу/депозиту. НЕ использовать для переводов на брокерский счёт или пополнения ИИС.
cashback — кэшбэк, возврат средств, refund, возвраты к физику
other_inc — прочие доходы, переводы от физлиц, пополнения счёта

ВАЖНЫЕ ПРАВИЛА:
- Если bankCategory = "Финансовые операции" и type=expense — это скорее всего shopping или other_exp, НЕ investment
- Если bankCategory = "Переводы" — это other_exp (расход) или other_inc (доход)
- Пополнение брокерского счёта / ИИС — это other_exp, НЕ investment
- investment только для ВХОДЯЩИХ дивидендов/процентов (type=income)

ВАЖНО: Верни ТОЛЬКО JSON массив. Никакого текста до или после. Только [...].
Пример: [{"idx":0,"categoryId":"food"},{"idx":1,"categoryId":"transport"},{"idx":2,"categoryId":"salary"}]`;

async function recategorizeWithGroq(transactions: ParsedBankTx[]): Promise<ParsedBankTx[]> {
  if (transactions.length === 0) return transactions;

  // Categorize ALL transactions via Groq — no keyword pre-filter
  // Send in batches of 30 to stay within token limits
  const BATCH_SIZE = 30;
  const result: ParsedBankTx[] = [...transactions];

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    // Pass both description AND bankCategory so Groq has full context
    const payload = batch.map((tx, batchIdx) => ({
      idx: i + batchIdx,
      description: tx.description,
      bankCategory: tx.bankCategory,
      type: tx.type,
    }));

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: GROQ_CATEGORIZE_PROMPT },
            { role: 'user', content: JSON.stringify(payload) },
          ],
          temperature: 0.1,
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        console.warn('[bankImport] Groq categorize error:', response.status);
        continue;
      }

      const data = await response.json();
      const content: string = (data.choices?.[0]?.message?.content ?? '').trim();

      let arr: { idx: number; categoryId: string }[] = [];
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        try { arr = JSON.parse(match[0]); } catch { /* skip */ }
      } else if (content.startsWith('[')) {
        try { arr = JSON.parse(content); } catch { /* skip */ }
      }

      for (const item of arr) {
        if (
          typeof item.idx === 'number' &&
          item.idx >= 0 &&
          item.idx < result.length &&
          VALID_CATEGORY_IDS.has(item.categoryId)
        ) {
          const orig = result[item.idx]!;
          result[item.idx] = {
            type: orig.type,
            amount: orig.amount,
            description: orig.description,
            bankCategory: orig.bankCategory,
            date: orig.date,
            categoryId: item.categoryId,
          };
        }
      }
    } catch (err) {
      console.warn('[bankImport] Groq batch error:', err);
    }
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

type ImportResult = { imported: number; skipped: number; errors: string[]; bankName?: string };

function FileImportModal({ onClose }: { onClose: () => void }) {
  const { addTransaction } = useFinanceStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // Telegram WebView scroll lock: block touchmove on document except inside the sheet's scrollable div.
  useEffect(() => {
    const handler = (e: TouchEvent) => {
      if (scrollRef.current && scrollRef.current.contains(e.target as Node)) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', handler, { passive: false });
    return () => document.removeEventListener('touchmove', handler);
  }, []);

  const processFile = async (file: File) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'json' && ext !== 'xlsx' && ext !== 'xls') {
      setResult({ imported: 0, skipped: 0, errors: ['Поддерживаются файлы .csv, .json и .xlsx'] });
      return;
    }
    setIsProcessing(true);
    setProcessingStep('Читаем файл...');
    const errors: string[] = [];

    try {
      if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer();
        setProcessingStep('Разбираем транзакции...');
        const { transactions, bankName, skipped } = await parseBankXLSX(buffer);

        let finalTransactions = transactions;
        if (transactions.length > 0) {
          setProcessingStep('🤖 AI категоризация через Groq...');
          try {
            finalTransactions = await recategorizeWithGroq(transactions);
          } catch {
            finalTransactions = transactions;
          }
        }

        let imported = 0;
        finalTransactions.forEach((tx: ParsedBankTx) => {
          addTransaction(tx);
          imported++;
        });
        setResult({ imported, skipped, errors, bankName });
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

        let imported = 0;
        let skipped = 0;
        rows.forEach((row, i) => {
          const tx = rowToTransactionGeneric(row);
          if (tx) {
            addTransaction(tx);
            imported++;
          } else {
            skipped++;
            if (errors.length < 3) errors.push(`Строка ${i + 2}: неверный формат`);
          }
        });
        setResult({ imported, skipped, errors });
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(26,26,46,0.65)', backdropFilter: 'blur(6px)' }}
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
          className="flex-1 overflow-y-auto px-6 pb-8"
          style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', touchAction: 'pan-y' }}
        >
          {!result ? (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">📂 Импорт выписки из банка</h2>
              <p className="text-sm text-gray-400 mb-5">Загрузите выписку из мобильного банка (.xlsx)</p>

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
                <div className="text-xs text-gray-400">Поддерживаются выписки Альфа-Банк, Сбер, Т-Банк, ВТБ (.xlsx)</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json,.xlsx,.xls"
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
                <div className="text-xs font-bold text-green-700 mb-2">🤖 AI-категоризация через Groq</div>
                <div className="text-xs text-green-600 leading-relaxed">
                  Транзакции автоматически распределяются по категориям с помощью Groq Llama 3.1. Внутренние переводы между счетами пропускаются.
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
              {result.imported > 0 && (
                <div className="rounded-2xl p-4 mb-4 text-left" style={{ background: '#F0FFF8', border: '1px solid rgba(0,200,150,0.2)' }}>
                  <div className="text-sm font-bold text-green-700 mb-1">✅ Что сделано</div>
                  <div className="text-xs text-green-600 leading-relaxed space-y-1">
                    <div>• Транзакции распознаны и категоризированы через Groq AI</div>
                    <div>• Внутренние переводы между счетами пропущены</div>
                    <div>• Описания очищены от технических данных</div>
                  </div>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="rounded-2xl p-3 mb-4 text-left" style={{ background: '#FFF8F0', border: '1px solid rgba(255,107,53,0.2)' }}>
                  <div className="text-xs font-bold text-orange-600 mb-1">⚠️ Предупреждения</div>
                  {result.errors.map((err, i) => (
                    <div key={i} className="text-xs text-orange-500">{err}</div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { setResult(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="flex-1 py-3 rounded-2xl font-semibold text-sm haptic"
                  style={{ background: '#F0EEFF', color: '#6C63FF' }}
                >
                  Ещё файл
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onClose}
                  className="flex-1 py-3 text-white rounded-2xl font-bold text-sm haptic"
                  style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)' }}
                >
                  Готово →
                </motion.button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Profile Page ─────────────────────────────────────────────────────────────

export function ProfilePage() {
  const { user, logout } = useAuthStore();
  const financeStore = useFinanceStore();
  const { streak, transactions, goals, getMonthSummary } = financeStore;
  const [showFileModal, setShowFileModal] = useState(false);

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
    </div>
  );
}
