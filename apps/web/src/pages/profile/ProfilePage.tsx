import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/features/auth/store';
import { useFinanceStore } from '@/features/finance/store';
import { formatCurrency } from '@/shared/utils/format';

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

type MockTx = { type: 'expense' | 'income'; amount: number; categoryId: string; description: string; date: string };

function daysAgo(d: number): string {
  const date = new Date();
  date.setDate(date.getDate() - d);
  return date.toISOString();
}

function generateMockTransactions(bankId: string): MockTx[] {
  const sber: MockTx[] = [
    { type: 'expense', amount: 4320, categoryId: 'food', description: 'Пятёрочка', date: daysAgo(0) },
    { type: 'expense', amount: 890, categoryId: 'transport', description: 'Яндекс.Такси', date: daysAgo(1) },
    { type: 'expense', amount: 2150, categoryId: 'food', description: 'ВкусВилл', date: daysAgo(2) },
    { type: 'expense', amount: 650, categoryId: 'entertainment', description: 'Кофе Хауз', date: daysAgo(2) },
    { type: 'income', amount: 85000, categoryId: 'salary', description: 'Зарплата', date: daysAgo(3) },
    { type: 'expense', amount: 3200, categoryId: 'shopping', description: 'Wildberries', date: daysAgo(4) },
    { type: 'expense', amount: 1890, categoryId: 'food', description: 'Перекрёсток', date: daysAgo(5) },
    { type: 'expense', amount: 450, categoryId: 'transport', description: 'Метро', date: daysAgo(6) },
    { type: 'expense', amount: 5600, categoryId: 'health', description: 'Аптека 36.6', date: daysAgo(7) },
    { type: 'expense', amount: 12500, categoryId: 'housing', description: 'Коммунальные услуги', date: daysAgo(8) },
    { type: 'expense', amount: 780, categoryId: 'entertainment', description: 'Яндекс Плюс', date: daysAgo(9) },
    { type: 'expense', amount: 3400, categoryId: 'food', description: 'Магнит', date: daysAgo(10) },
    { type: 'expense', amount: 1200, categoryId: 'transport', description: 'Яндекс.Такси', date: daysAgo(11) },
    { type: 'expense', amount: 8900, categoryId: 'shopping', description: 'Ozon', date: daysAgo(12) },
    { type: 'expense', amount: 2300, categoryId: 'food', description: 'Ресторан', date: daysAgo(13) },
    { type: 'income', amount: 15000, categoryId: 'other_income', description: 'Фриланс', date: daysAgo(14) },
    { type: 'expense', amount: 990, categoryId: 'entertainment', description: 'Кинотеатр', date: daysAgo(15) },
    { type: 'expense', amount: 4100, categoryId: 'food', description: 'Лента', date: daysAgo(16) },
    { type: 'expense', amount: 2800, categoryId: 'health', description: 'Фитнес-клуб', date: daysAgo(17) },
    { type: 'expense', amount: 560, categoryId: 'transport', description: 'Метро', date: daysAgo(18) },
    { type: 'expense', amount: 6700, categoryId: 'shopping', description: 'H&M', date: daysAgo(19) },
    { type: 'expense', amount: 1450, categoryId: 'food', description: 'Кафе', date: daysAgo(20) },
    { type: 'expense', amount: 3900, categoryId: 'food', description: 'Пятёрочка', date: daysAgo(21) },
    { type: 'expense', amount: 750, categoryId: 'entertainment', description: 'Spotify', date: daysAgo(22) },
    { type: 'expense', amount: 2100, categoryId: 'transport', description: 'Яндекс.Такси', date: daysAgo(23) },
    { type: 'expense', amount: 15000, categoryId: 'housing', description: 'Аренда', date: daysAgo(24) },
    { type: 'expense', amount: 3200, categoryId: 'food', description: 'ВкусВилл', date: daysAgo(25) },
    { type: 'expense', amount: 890, categoryId: 'entertainment', description: 'Бар', date: daysAgo(26) },
    { type: 'expense', amount: 4500, categoryId: 'shopping', description: 'Wildberries', date: daysAgo(27) },
    { type: 'expense', amount: 1100, categoryId: 'food', description: 'Суши', date: daysAgo(28) },
  ];

  const tinkoff: MockTx[] = [
    { type: 'expense', amount: 3890, categoryId: 'food', description: 'Перекрёсток', date: daysAgo(0) },
    { type: 'expense', amount: 1200, categoryId: 'transport', description: 'Яндекс.Такси', date: daysAgo(1) },
    { type: 'income', amount: 120000, categoryId: 'salary', description: 'Зарплата ООО Ромашка', date: daysAgo(2) },
    { type: 'expense', amount: 5400, categoryId: 'shopping', description: 'Ozon', date: daysAgo(3) },
    { type: 'expense', amount: 890, categoryId: 'entertainment', description: 'Нетфликс', date: daysAgo(4) },
    { type: 'expense', amount: 2300, categoryId: 'food', description: 'Магнит', date: daysAgo(5) },
    { type: 'expense', amount: 18000, categoryId: 'housing', description: 'Аренда квартиры', date: daysAgo(6) },
    { type: 'expense', amount: 4200, categoryId: 'health', description: 'Стоматология', date: daysAgo(7) },
    { type: 'expense', amount: 670, categoryId: 'transport', description: 'Метро', date: daysAgo(8) },
    { type: 'expense', amount: 3100, categoryId: 'food', description: 'Ресторан', date: daysAgo(9) },
    { type: 'expense', amount: 9800, categoryId: 'shopping', description: 'Zara', date: daysAgo(10) },
    { type: 'expense', amount: 1890, categoryId: 'food', description: 'ВкусВилл', date: daysAgo(11) },
    { type: 'income', amount: 25000, categoryId: 'other_income', description: 'Кэшбэк Т-Банк', date: daysAgo(12) },
    { type: 'expense', amount: 560, categoryId: 'entertainment', description: 'Яндекс Музыка', date: daysAgo(13) },
    { type: 'expense', amount: 3400, categoryId: 'food', description: 'Пятёрочка', date: daysAgo(14) },
    { type: 'expense', amount: 2800, categoryId: 'health', description: 'Фитнес', date: daysAgo(15) },
    { type: 'expense', amount: 1100, categoryId: 'transport', description: 'Такси', date: daysAgo(16) },
    { type: 'expense', amount: 7200, categoryId: 'shopping', description: 'Wildberries', date: daysAgo(17) },
    { type: 'expense', amount: 4500, categoryId: 'food', description: 'Лента', date: daysAgo(18) },
    { type: 'expense', amount: 990, categoryId: 'entertainment', description: 'Кино', date: daysAgo(19) },
    { type: 'expense', amount: 2100, categoryId: 'food', description: 'Кафе', date: daysAgo(20) },
    { type: 'expense', amount: 12000, categoryId: 'housing', description: 'Коммуналка', date: daysAgo(21) },
    { type: 'expense', amount: 3600, categoryId: 'food', description: 'Магнит', date: daysAgo(22) },
    { type: 'expense', amount: 780, categoryId: 'transport', description: 'Метро', date: daysAgo(23) },
    { type: 'expense', amount: 5100, categoryId: 'shopping', description: 'Ozon', date: daysAgo(24) },
  ];

  const vtb: MockTx[] = [
    { type: 'income', amount: 95000, categoryId: 'salary', description: 'Зарплата', date: daysAgo(1) },
    { type: 'expense', amount: 4100, categoryId: 'food', description: 'Ашан', date: daysAgo(2) },
    { type: 'expense', amount: 1500, categoryId: 'transport', description: 'Яндекс.Такси', date: daysAgo(3) },
    { type: 'expense', amount: 16000, categoryId: 'housing', description: 'Аренда', date: daysAgo(4) },
    { type: 'expense', amount: 3200, categoryId: 'food', description: 'Перекрёсток', date: daysAgo(5) },
    { type: 'expense', amount: 8900, categoryId: 'shopping', description: 'М.Видео', date: daysAgo(6) },
    { type: 'expense', amount: 2400, categoryId: 'health', description: 'Аптека', date: daysAgo(7) },
    { type: 'expense', amount: 890, categoryId: 'entertainment', description: 'Кинотеатр', date: daysAgo(8) },
    { type: 'expense', amount: 3700, categoryId: 'food', description: 'Пятёрочка', date: daysAgo(9) },
    { type: 'expense', amount: 5600, categoryId: 'shopping', description: 'Wildberries', date: daysAgo(10) },
    { type: 'expense', amount: 1200, categoryId: 'transport', description: 'Метро', date: daysAgo(11) },
    { type: 'expense', amount: 2900, categoryId: 'food', description: 'Ресторан', date: daysAgo(12) },
    { type: 'income', amount: 10000, categoryId: 'other_income', description: 'Перевод', date: daysAgo(13) },
    { type: 'expense', amount: 4300, categoryId: 'food', description: 'Магнит', date: daysAgo(14) },
    { type: 'expense', amount: 780, categoryId: 'entertainment', description: 'Подписка', date: daysAgo(15) },
    { type: 'expense', amount: 3100, categoryId: 'health', description: 'Фитнес', date: daysAgo(16) },
    { type: 'expense', amount: 6700, categoryId: 'shopping', description: 'Ozon', date: daysAgo(17) },
    { type: 'expense', amount: 1800, categoryId: 'food', description: 'ВкусВилл', date: daysAgo(18) },
    { type: 'expense', amount: 11000, categoryId: 'housing', description: 'Коммуналка', date: daysAgo(19) },
    { type: 'expense', amount: 2200, categoryId: 'transport', description: 'Такси', date: daysAgo(20) },
  ];

  const fallback: MockTx[] = [
    { type: 'income', amount: 75000, categoryId: 'salary', description: 'Зарплата', date: daysAgo(2) },
    { type: 'expense', amount: 3500, categoryId: 'food', description: 'Продукты', date: daysAgo(3) },
    { type: 'expense', amount: 15000, categoryId: 'housing', description: 'Аренда', date: daysAgo(5) },
    { type: 'expense', amount: 2100, categoryId: 'transport', description: 'Транспорт', date: daysAgo(7) },
    { type: 'expense', amount: 4800, categoryId: 'shopping', description: 'Покупки', date: daysAgo(10) },
    { type: 'expense', amount: 1200, categoryId: 'entertainment', description: 'Развлечения', date: daysAgo(12) },
    { type: 'expense', amount: 3200, categoryId: 'food', description: 'Продукты', date: daysAgo(15) },
    { type: 'expense', amount: 2800, categoryId: 'health', description: 'Здоровье', date: daysAgo(18) },
    { type: 'expense', amount: 5600, categoryId: 'shopping', description: 'Одежда', date: daysAgo(22) },
    { type: 'expense', amount: 1900, categoryId: 'food', description: 'Кафе', date: daysAgo(25) },
  ];

  const map: Record<string, MockTx[]> = { sber, tinkoff, vtb };
  return map[bankId] ?? fallback;
}

const BANKS = [
  { id: 'sber', name: 'Сбербанк', emoji: '🟢', color: '#21A038', txCount: 30 },
  { id: 'tinkoff', name: 'Т-Банк', emoji: '🟡', color: '#FFDD2D', txCount: 25 },
  { id: 'vtb', name: 'ВТБ', emoji: '🔵', color: '#009FDF', txCount: 20 },
  { id: 'alfa', name: 'Альфа-Банк', emoji: '🔴', color: '#EF3124', txCount: 18 },
  { id: 'raiffeisen', name: 'Райффайзен', emoji: '🟠', color: '#FFE600', txCount: 15 },
  { id: 'ozon', name: 'Озон Банк', emoji: '🔷', color: '#005BFF', txCount: 12 },
];

type BankItem = typeof BANKS[0];
type BankStep = 'list' | 'connecting' | 'importing' | 'success';

function BankConnectionModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<BankStep>('list');
  const [selectedBank, setSelectedBank] = useState<BankItem | null>(null);
  const [progress, setProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const { addTransaction } = useFinanceStore();

  const handleSelectBank = (bank: BankItem) => {
    setSelectedBank(bank);
    setStep('connecting');
    setProgress(0);

    let p = 0;
    const connectTimer = setInterval(() => {
      p += 8;
      setProgress(Math.min(p, 40));
      if (p >= 40) {
        clearInterval(connectTimer);
        setStep('importing');
        let p2 = 40;
        const importTimer = setInterval(() => {
          p2 += 5;
          setProgress(Math.min(p2, 100));
          if (p2 >= 100) {
            clearInterval(importTimer);
            const txs = generateMockTransactions(bank.id);
            txs.forEach((tx) => addTransaction(tx));
            setImportedCount(txs.length);
            setStep('success');
          }
        }, 80);
      }
    }, 60);
  };

  const canDismiss = step !== 'connecting' && step !== 'importing';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(26,26,46,0.65)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget && canDismiss) onClose(); }}
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

        {step === 'list' && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-1">🏦 Подключить банк</h2>
            <p className="text-sm text-gray-400 mb-5">Импорт транзакций за последние 30 дней</p>
            <div className="space-y-2">
              {BANKS.map((bank) => (
                <motion.button
                  key={bank.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSelectBank(bank)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl haptic"
                  style={{ background: '#F8F7FF' }}
                >
                  <div className="w-11 h-11 rounded-xl bg-white shadow-sm flex items-center justify-center text-2xl flex-shrink-0">
                    {bank.emoji}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-gray-800">{bank.name}</div>
                    <div className="text-xs text-gray-400">~{bank.txCount} операций за месяц</div>
                  </div>
                  <span className="text-gray-300 text-lg">›</span>
                </motion.button>
              ))}
            </div>
            <p className="text-xs text-gray-400 text-center mt-5">
              🔒 Демо-режим · Используются тестовые данные
            </p>
          </>
        )}

        {(step === 'connecting' || step === 'importing') && selectedBank && (
          <div className="text-center py-6">
            <motion.div
              animate={step === 'connecting' ? { rotate: 360 } : { scale: [1, 1.08, 1] }}
              transition={
                step === 'connecting'
                  ? { repeat: Infinity, duration: 1.2, ease: 'linear' }
                  : { repeat: Infinity, duration: 0.7 }
              }
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-md"
              style={{
                background: selectedBank.color + '22',
                border: '2px solid ' + selectedBank.color,
              }}
            >
              {step === 'connecting' ? selectedBank.emoji : '📥'}
            </motion.div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              {step === 'connecting'
                ? 'Подключение к ' + selectedBank.name
                : 'Импортируем транзакции'}
            </h3>
            <p className="text-sm text-gray-400 mb-6">
              {step === 'connecting'
                ? 'Устанавливаем защищённое соединение...'
                : 'Загружаем историю из ' + selectedBank.name + '...'}
            </p>
            <div className="w-full bg-gray-100 rounded-full h-2.5 mb-2 overflow-hidden">
              <motion.div
                className="h-2.5 rounded-full"
                style={{
                  background: 'linear-gradient(90deg, #6C63FF, #9B59B6)',
                  width: progress + '%',
                }}
                transition={{ duration: 0.08 }}
              />
            </div>
            <p className="text-xs text-gray-400">{progress}%</p>
          </div>
        )}

        {step === 'success' && selectedBank && (
          <div className="text-center py-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className="text-6xl mb-4"
            >
              🎉
            </motion.div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Готово!</h3>
            <p className="text-sm text-gray-500 mb-5">
              Импортировано{' '}
              <span className="font-bold text-purple-600">{importedCount} операций</span>{' '}
              из {selectedBank.name}
            </p>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {[
                { icon: '📥', label: 'Операций', value: String(importedCount) },
                { icon: '📅', label: 'Дней', value: '30' },
                { icon: '🏦', label: 'Банк', value: selectedBank.name.split(' ')[0] ?? selectedBank.name },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl p-3 text-center"
                  style={{ background: 'linear-gradient(135deg, #F0EEFF, #EDE8FF)' }}
                >
                  <div className="text-xl mb-1">{item.icon}</div>
                  <div className="text-sm font-bold text-purple-700">{item.value}</div>
                  <div className="text-xs text-purple-400">{item.label}</div>
                </div>
              ))}
            </div>
            <div
              className="rounded-2xl p-4 mb-5 text-left"
              style={{ background: '#F0FFF8', border: '1px solid rgba(0,200,150,0.2)' }}
            >
              <div className="text-sm font-bold text-green-700 mb-1">✅ Что импортировано</div>
              <div className="text-xs text-green-600 leading-relaxed space-y-1">
                <div>• Расходы: продукты, транспорт, развлечения, покупки</div>
                <div>• Доходы: зарплата и прочие поступления</div>
                <div>• Все операции за последние 30 дней</div>
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onClose}
              className="w-full py-4 text-white rounded-2xl font-bold text-base haptic"
              style={{
                background: 'linear-gradient(135deg, #6C63FF, #9B59B6)',
                boxShadow: '0 4px 20px rgba(108,99,255,0.35)',
              }}
            >
              Отлично! Смотреть аналитику →
            </motion.button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export function ProfilePage() {
  const { user, logout } = useAuthStore();
  const financeStore = useFinanceStore();
  const { streak, transactions, goals, getMonthSummary } = financeStore;
  const [showBankModal, setShowBankModal] = useState(false);

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
          { icon: '🏦', label: 'Банковские счета', action: () => setShowBankModal(true) },
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
        {showBankModal && <BankConnectionModal onClose={() => setShowBankModal(false)} />}
      </AnimatePresence>
    </div>
  );
}
