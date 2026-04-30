import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/features/auth/store';
import { useFinanceStore } from '@/features/finance/store';
import { formatCurrency } from '@/shared/utils/format';

const ACHIEVEMENTS = [
  { id: 'first_tx', icon: '🎯', name: 'Первая трата', desc: 'Добавь первую операцию', check: (s: any) => s.transactions.length >= 1 },
  { id: 'saver', icon: '💰', name: 'Копилка', desc: 'Сбережения > 20%', check: (s: any) => s.getMonthSummary().savingsRate >= 20 },
  { id: 'goal_setter', icon: '🎯', name: 'Целеустремлённый', desc: 'Создай первую цель', check: (s: any) => s.goals.length >= 1 },
  { id: 'goal_done', icon: '🏆', name: 'Достигатор', desc: 'Выполни цель на 100%', check: (s: any) => s.goals.some((g: any) => g.currentAmount >= g.targetAmount) },
  { id: 'streak_3', icon: '🔥', name: 'Огонь', desc: '3 дня подряд', check: (s: any) => s.streak >= 3 },
  { id: 'streak_7', icon: '⚡', name: 'Молния', desc: '7 дней подряд', check: (s: any) => s.streak >= 7 },
  { id: 'tx_10', icon: '📊', name: 'Аналитик', desc: '10 операций', check: (s: any) => s.transactions.length >= 10 },
  { id: 'tx_50', icon: '🌟', name: 'Профи', desc: '50 операций', check: (s: any) => s.transactions.length >= 50 },
  { id: 'big_saver', icon: '💎', name: 'Бриллиант', desc: 'Накопи 100 000 ₽', check: (s: any) => s.goals.some((g: any) => g.currentAmount >= 100000) },
];

function BankConnectionModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'list' | 'connect' | 'success'>('list');
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
      className="fixed inset-0 bg-black/50 z-50 flex items-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full bg-white rounded-t-3xl p-6"
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />

        {step === 'list' && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Подключить банк</h2>
            <p className="text-sm text-gray-500 mb-6">Автоматический импорт транзакций</p>
            <div className="space-y-2">
              {banks.map((bank) => (
                <button
                  key={bank.id}
                  onClick={() => { setSelectedBank(bank.name); setStep('connect'); }}
                  className="w-full flex items-center gap-4 p-4 bg-gray-50 rounded-2xl haptic"
                >
                  <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-xl">
                    {bank.icon}
                  </div>
                  <span className="font-medium text-gray-800">{bank.name}</span>
                  <span className="ml-auto text-gray-400">→</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 text-center mt-4">
              🔒 Данные защищены. Мы используем только чтение транзакций.
            </p>
          </>
        )}

        {step === 'connect' && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Подключение {selectedBank}</h2>
            <p className="text-sm text-gray-500 mb-6">
              Для подключения банка необходимо установить полную версию приложения с бэкендом.
              Сейчас приложение работает в демо-режиме.
            </p>
            <div className="bg-blue-50 rounded-2xl p-4 mb-6">
              <div className="text-sm font-semibold text-blue-800 mb-1">💡 Демо-режим</div>
              <div className="text-xs text-blue-600">
                В демо-режиме вы можете вручную добавлять транзакции. Подключение к банкам будет доступно в полной версии.
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep('list')}
                className="flex-1 py-3 border-2 border-gray-200 rounded-2xl font-semibold text-gray-600 haptic"
              >
                Назад
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-semibold haptic"
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
    <div className="px-4 pt-6 pb-4 space-y-4">
      {/* User card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white"
      >
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-3xl">
            {user?.photoUrl ? (
              <img src={user.photoUrl} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              '👤'
            )}
          </div>
          <div>
            <div className="text-xl font-bold">
              {user?.firstName ?? 'Пользователь'} {user?.lastName ?? ''}
            </div>
            <div className="text-blue-200 text-sm">@{user?.username ?? 'finwise_user'}</div>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Дней подряд', value: streak, icon: '🔥' },
          { label: 'Достижений', value: `${unlockedAchievements.length}/${ACHIEVEMENTS.length}`, icon: '🏆' },
          { label: 'Операций', value: transactions.length, icon: '📊' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <div className="text-2xl mb-1">{stat.icon}</div>
            <div className="text-xl font-bold text-gray-900">{stat.value}</div>
            <div className="text-xs text-gray-400">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Finance summary */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="text-sm font-semibold text-gray-700 mb-3">💰 Финансовый итог</div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Доходы за месяц</span>
            <span className="font-semibold text-green-600">{formatCurrency(summary.income)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Расходы за месяц</span>
            <span className="font-semibold text-red-500">{formatCurrency(summary.expenses)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Накоплено в целях</span>
            <span className="font-semibold text-blue-600">{formatCurrency(totalSaved)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Норма сбережений</span>
            <span className={`font-semibold ${summary.savingsRate >= 20 ? 'text-green-600' : 'text-orange-500'}`}>
              {summary.savingsRate}%
            </span>
          </div>
        </div>
      </div>

      {/* Achievements */}
      <div>
        <h2 className="font-semibold text-gray-900 mb-3">🏆 Достижения</h2>
        <div className="grid grid-cols-3 gap-3">
          {ACHIEVEMENTS.map((ach, i) => {
            const unlocked = ach.check(financeStore);
            return (
              <motion.div
                key={ach.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04 }}
                className={`bg-white rounded-2xl p-3 text-center shadow-sm ${!unlocked ? 'opacity-40 grayscale' : ''}`}
              >
                <div className="text-3xl mb-1">{ach.icon}</div>
                <div className="text-xs font-medium text-gray-700 leading-tight">{ach.name}</div>
                {!unlocked && <div className="text-xs text-gray-400 mt-0.5 leading-tight">{ach.desc}</div>}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Settings */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
        {[
          { icon: '🔔', label: 'Уведомления', action: () => alert('Уведомления настраиваются в Telegram') },
          { icon: '🏦', label: 'Банковские счета', action: () => setShowBankModal(true) },
          { icon: '🔒', label: 'Конфиденциальность', action: () => alert('Все данные хранятся локально на вашем устройстве') },
          { icon: '❓', label: 'Помощь', action: () => alert('Напишите нам: @finwise_support') },
        ].map((item, i) => (
          <button
            key={item.label}
            onClick={item.action}
            className={`w-full flex items-center gap-3 px-4 py-4 haptic active:bg-gray-50 ${
              i > 0 ? 'border-t border-gray-50' : ''
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="flex-1 text-left font-medium text-gray-800">{item.label}</span>
            <span className="text-gray-400">→</span>
          </button>
        ))}
      </div>

      {/* Logout */}
      <button
        onClick={logout}
        className="w-full py-4 rounded-2xl border-2 border-red-100 text-red-500 font-semibold haptic active:bg-red-50"
      >
        Выйти
      </button>

      <AnimatePresence>
        {showBankModal && <BankConnectionModal onClose={() => setShowBankModal(false)} />}
      </AnimatePresence>
    </div>
  );
}
