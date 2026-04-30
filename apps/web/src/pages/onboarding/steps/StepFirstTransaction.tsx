import { useState } from 'react';
import { motion } from 'framer-motion';
import type { OnboardingData } from '@finwise/shared-types';

interface Props {
  data: Partial<OnboardingData>;
  updateData: (patch: Partial<OnboardingData>) => void;
  onNext: () => void;
}

const QUICK_CATEGORIES = [
  { id: 'food', icon: '🍕', label: 'Еда' },
  { id: 'transport', icon: '🚗', label: 'Транспорт' },
  { id: 'shopping', icon: '🛍️', label: 'Покупки' },
  { id: 'entertainment', icon: '🎬', label: 'Развлечения' },
  { id: 'health', icon: '💊', label: 'Здоровье' },
  { id: 'other', icon: '📦', label: 'Другое' },
];

export function StepFirstTransaction({ updateData, onNext }: Props) {
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const handleNext = () => {
    if (amount && categoryId) {
      updateData({
        firstTransaction: {
          accountId: 'default',
          categoryId,
          amount: parseFloat(amount),
          type: 'expense',
          date: new Date().toISOString().split('T')[0] ?? '',
        },
      });
    }
    onNext();
  };

  return (
    <div className="flex flex-col px-6 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Добавь последнюю трату</h2>
        <p className="text-gray-500">Займёт 10 секунд — обещаю!</p>
      </div>
      <div className="bg-white rounded-2xl p-6 mb-4 text-center shadow-sm">
        <div className="text-gray-400 text-sm mb-2">Сумма</div>
        <div className="flex items-center justify-center gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="amount-input"
            autoFocus
          />
          <span className="text-3xl font-bold text-gray-400">₽</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-6">
        {QUICK_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategoryId(cat.id)}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 haptic transition-all ${
              categoryId === cat.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white'
            }`}
          >
            <span className="text-2xl">{cat.icon}</span>
            <span className="text-xs text-gray-600">{cat.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-6 space-y-3">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleNext}
          disabled={!amount || !categoryId}
          className="w-full bg-blue-600 text-white font-semibold text-lg py-4 rounded-2xl haptic disabled:opacity-40"
        >
          Добавить →
        </motion.button>
        <button onClick={onNext} className="w-full text-gray-400 text-sm py-2 haptic">
          Пропустить
        </button>
      </div>
    </div>
  );
}
