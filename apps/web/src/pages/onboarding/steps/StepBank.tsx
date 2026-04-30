import { motion } from 'framer-motion';
import type { OnboardingData } from '@finwise/shared-types';

interface Props {
  data: Partial<OnboardingData>;
  updateData: (patch: Partial<OnboardingData>) => void;
  onNext: () => void;
}

const BANKS = [
  { id: 'tinkoff', name: 'Т-Банк', icon: '🟡' },
  { id: 'sber', name: 'Сбер', icon: '🟢' },
  { id: 'vtb', name: 'ВТБ', icon: '🔵' },
  { id: 'alfa', name: 'Альфа', icon: '🔴' },
  { id: 'raiffeisen', name: 'Райффайзен', icon: '🟡' },
];

export function StepBank({ updateData, onNext }: Props) {
  return (
    <div className="flex flex-col px-6 py-8 pb-4" style={{ minHeight: '100%' }}>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Подключи банк</h2>
        <p className="text-gray-500">Для автоматического учёта всех трат</p>
        <div className="mt-3 bg-blue-50 rounded-xl px-4 py-2 text-sm text-blue-700">
          💡 87% пользователей подключают банк — это экономит 10 мин в день
        </div>
      </div>

      <div className="space-y-3">
        {BANKS.map((bank, i) => (
          <motion.button
            key={bank.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { updateData({ bankId: bank.id }); onNext(); }}
            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-gray-100 bg-white haptic"
          >
            <span className="text-2xl">{bank.icon}</span>
            <span className="font-semibold text-gray-800">{bank.name}</span>
            <span className="ml-auto text-gray-400">→</span>
          </motion.button>
        ))}
      </div>

      <button
        onClick={onNext}
        className="mt-6 w-full text-gray-400 text-sm py-3 haptic"
      >
        Пропустить — введу вручную
      </button>
    </div>
  );
}
