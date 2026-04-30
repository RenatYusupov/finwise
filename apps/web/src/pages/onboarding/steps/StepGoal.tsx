import { useState } from 'react';
import { motion } from 'framer-motion';
import type { OnboardingGoalType, OnboardingData } from '@finwise/shared-types';

interface Props {
  data: Partial<OnboardingData>;
  updateData: (patch: Partial<OnboardingData>) => void;
  onNext: () => void;
}

const GOALS = [
  { type: 'housing' as OnboardingGoalType, icon: '🏠', label: 'Накопить на жильё' },
  { type: 'travel' as OnboardingGoalType, icon: '✈️', label: 'Путешествия' },
  { type: 'car' as OnboardingGoalType, icon: '🚗', label: 'Купить авто' },
  { type: 'emergency_fund' as OnboardingGoalType, icon: '🛡️', label: 'Подушка безопасности' },
  { type: 'investment' as OnboardingGoalType, icon: '📈', label: 'Начать инвестировать' },
  { type: 'other' as OnboardingGoalType, icon: '🎯', label: 'Другое' },
];

export function StepGoal({ data, updateData, onNext }: Props) {
  const [selected, setSelected] = useState<OnboardingGoalType | null>(data.goalType ?? null);

  const handleSelect = (type: OnboardingGoalType) => {
    setSelected(type);
    updateData({ goalType: type });
  };

  return (
    <div className="flex flex-col h-full px-6 py-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Какая твоя главная финансовая цель?</h2>
        <p className="text-gray-500">Это поможет мне давать точные советы</p>
      </div>
      <div className="grid grid-cols-2 gap-3 flex-1">
        {GOALS.map((goal, i) => (
          <motion.button
            key={goal.type}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleSelect(goal.type)}
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all haptic ${
              selected === goal.type
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-100 bg-white text-gray-700'
            }`}
          >
            <span className="text-3xl">{goal.icon}</span>
            <span className="text-sm font-medium text-center leading-tight">{goal.label}</span>
          </motion.button>
        ))}
      </div>
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onNext}
        disabled={!selected}
        className="mt-6 w-full bg-blue-600 text-white font-semibold text-lg py-4 rounded-2xl haptic disabled:opacity-40"
      >
        Продолжить →
      </motion.button>
    </div>
  );
}
