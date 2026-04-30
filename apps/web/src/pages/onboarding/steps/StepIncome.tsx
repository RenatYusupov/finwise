import { useState } from 'react';
import { motion } from 'framer-motion';
import type { OnboardingData } from '@finwise/shared-types';

interface Props {
  data: Partial<OnboardingData>;
  updateData: (patch: Partial<OnboardingData>) => void;
  onNext: () => void;
}

const RANGES = [
  { label: 'до 50 000 ₽', value: 35000 },
  { label: '50–100 000 ₽', value: 75000 },
  { label: '100–200 000 ₽', value: 150000 },
  { label: '200–500 000 ₽', value: 350000 },
  { label: 'более 500 000 ₽', value: 600000 },
];

export function StepIncome({ data, updateData, onNext }: Props) {
  const [selected, setSelected] = useState<number | null>(data.monthlyIncome ?? null);
  const [incomeType, setIncomeType] = useState<'regular' | 'irregular'>(data.incomeType ?? 'regular');

  const handleSelect = (value: number) => {
    setSelected(value);
    updateData({ monthlyIncome: value, incomeType });
  };

  return (
    <div className="flex flex-col px-6 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Сколько ты зарабатываешь?</h2>
        <p className="text-gray-500">Примерно — для точного планирования</p>
      </div>
      <div className="space-y-3">
        {RANGES.map((range, i) => (
          <motion.button
            key={range.value}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelect(range.value)}
            className={`w-full text-left px-5 py-4 rounded-2xl border-2 font-medium transition-all haptic ${
              selected === range.value
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-100 bg-white text-gray-800'
            }`}
          >
            {range.label}
          </motion.button>
        ))}
      </div>
      <div className="mt-4 flex gap-3">
        {(['regular', 'irregular'] as const).map((type) => (
          <button
            key={type}
            onClick={() => {
              setIncomeType(type);
              if (selected) updateData({ incomeType: type });
            }}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all haptic ${
              incomeType === type
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-500'
            }`}
          >
            {type === 'regular' ? '📅 Регулярный' : '🔀 Нерегулярный'}
          </button>
        ))}
      </div>
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onNext}
        disabled={!selected}
        className="mt-4 w-full bg-blue-600 text-white font-semibold text-lg py-4 rounded-2xl haptic disabled:opacity-40"
      >
        Продолжить →
      </motion.button>
    </div>
  );
}
