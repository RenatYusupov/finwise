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

function BankConnectionModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'list' | 'connect'>('list');
  const [selectedBank, setSelectedBank] = useState('');

  const banks = [
    { id: 'sber', name: 'Сбербанк', icon: '🟢', color: '#21A038' },
    { id: 'tinkoff', name: 'Т-Банк', icon: '🟡', color: '#FFDD2D' },
    { id: 'vtb', name: 'ВТБ', icon: '🔵', color: '#009FDF' },
    { id: 'alfa', name: 'Альфа-Банк', icon: '🔴', color: '#EF3124' },
    { id: 'raiffeisen', name: 'Райффайзен', icon: '🟠', color: '#FFE600' },
    { id: 'ozon', name: 'Озон Банк', icon: '🔷', color: '#005BFF' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(26,26,46,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full bg-white rounded-t-3xl p-6"
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

        {step === 'list' && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-1">🏦 Подключить банк</h2>
            <p className="text-sm text-gray-400 mb-5">Автоматический импорт транзакций</p>
            <div className="space-y-2">
              {banks.map((bank) => (
                <button
                  key={bank.id}
                  onClick={() => { setSelectedBank(bank.name); setStep('connect'); }}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl haptic transition-all"
                  style={{ background: '#F8F7FF' }}
                >
                  <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-xl">
                    {bank.icon}
                  </div>
                  <span className="font-semibold text-gray-800 flex-1 text-left">{bank.name}</span>
                  <span className="text-gray-300 text-lg">›</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 text-center mt-4">
              🔒 Данные защищены. Только чтение транзакций.
            </p>
          </>
        )}

        {step === 'connect' && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Подключение {selectedBank}</h2>
            <p className="text-sm text-gray-500 mb-5">
              Для подключения банка необходима полная версия с бэкендом.
              Сейчас приложение работает в демо-режиме.
            </p>
            <div className="rounded-2xl p-4 mb-5"
              style={{ background: 'linear-gradient(135deg, #F0EEFF, #EDE8FF)', border: '1px solid rgba(108,99,255,0.12)' }}>
              <div className="text-sm font-bold text-purple-700 mb-1">💡 Демо-режим</div>
              <div className="text-xs text-purple-600 leading-relaxed">
                В демо-режиме добавляй транзакции вручную. Подключение к банкам будет доступно в полной версии.
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep('list')}
                className="flex-1 py-3.5 rounded-2xl font-semibold text-gray-600 haptic"
                style={{ border: '2px solid #E5E7EB' }}
              >
                Назад
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3.5 text-white rounded-2xl font-semibold haptic"
                style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)' }}
              >
                Понятно
              </button>
            </div>
          </>
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
        <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #6C63FF, transparent)' }} />
        <div className="flex items-center gap-4 relative">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
            style={{ background: 'rgba(255,255,255,0.15)' }}>
            {user?.photoUrl ? (
              <img src={user.photoUrl} alt="" className="w-full h-full rounded-2xl object-cover" />
            ) : '👤'}
          </div>
          <div>
            <div className="text-xl font-bold">
              {user?.firstName ?? 'Пользователь'} {user?.lastName ?? ''}
            </div>
            <div className="text-gray-400 text-sm">@{user?.username ?? 'finwise_user'}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="streak-fire text-sm">🔥</span>
              <span className="text-orange-300 text-xs font-semibold">{streak} дней подряд</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Достижений', value: `${unlockedAchievements.length}/${ACHIEVEMENTS.length}`, icon: '🏆', color: '#FFB800', bg: '#FFFBEB' },
          { label: 'Операций', value: transactions.length, icon: '📊', color: '#6C63FF', bg: '#F0EEFF' },
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
            {
              label: 'Норма сбережений',
              value: `${summary.savingsRate}%`,
              color: summary.savingsRate >= 20 ? '#00C896' : '#FFB800',
            },
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
          { icon: '🏦', label: 'Банковские счета', action: () => setShowBankModal(true) },
          { icon: '🔒', label: 'Конфиденциальность', action: () => alert('Все данные хранятся локально на вашем устройстве') },
          { icon: '❓', label: 'Помощь', action: () => alert('Напишите нам: @finwise_support') },
        ].map((item, i) => (
          <button
            key={item.label}
            onClick={item.action}
            className={`w-full flex items-center gap-3 px-4 py-4 haptic active:bg-gray-50 ${i > 0 ? 'border-t border-gray-50' : ''}`}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
              style={{ background: '#F8F7FF' }}>
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
