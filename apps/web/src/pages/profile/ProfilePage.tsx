import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/features/auth/store';
import { useFinanceStore } from '@/features/finance/store';
import { formatCurrency } from '@/shared/utils/format';
import { parseBankXLSX, parseCSV, rowToTransactionGeneric } from './bankImport';
import type { ParsedBankTx } from './bankImport';

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
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const processFile = async (file: File) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'json' && ext !== 'xlsx' && ext !== 'xls') {
      setResult({ imported: 0, skipped: 0, errors: ['Поддерживаются файлы .csv, .json и .xlsx'] });
      return;
    }
    setIsProcessing(true);
    const errors: string[] = [];

    try {
      if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer();
        const { transactions, bankName, skipped } = await parseBankXLSX(buffer);
        let imported = 0;
        transactions.forEach((tx: ParsedBankTx) => {
          addTransaction(tx);
          imported++;
        });
        setResult({ imported, skipped, errors, bankName });
      } else {
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
        className="w-full bg-white rounded-t-3xl p-6 pb-8"
        style={{ maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

        {!result ? (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-1">📂 Импорт выписки из банка</h2>
            <p className="text-sm text-gray-400 mb-5">Загрузите выписку из мобильного банка (.xlsx)</p>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
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
                {isProcessing ? 'Анализируем транзакции...' : 'Нажмите или перетащите файл'}
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
              <div className="text-xs font-bold text-green-700 mb-2">🤖 AI-категоризация</div>
              <div className="text-xs text-green-600 leading-relaxed">
                Транзакции автоматически распределяются по категориям: еда, транспорт, покупки, развлечения и др. Внутренние переводы между счетами пропускаются.
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
                  <div>• Транзакции распознаны и категоризированы AI</div>
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
                style={{ boxShadow: 'var(--shadow-card)', opacity: unlocked ? 1 : 0.4, filter: unlocked ? 'none' : 'grayscale(1)' }}
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
