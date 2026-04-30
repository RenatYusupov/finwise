import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  onFinish: () => void;
  isLoading: boolean;
}

const INSIGHTS = [
  '💡 Анализирую твои финансовые паттерны...',
  '🎯 Строю персональный план...',
  '🤖 Готовлю первые рекомендации...',
  '✅ Всё готово!',
];

export function StepReady({ onFinish, isLoading }: Props) {
  const [insightIdx, setInsightIdx] = useState(0);
  const [showCta, setShowCta] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setInsightIdx((i) => {
        if (i >= INSIGHTS.length - 1) {
          clearInterval(interval);
          setTimeout(() => setShowCta(true), 400);
          return i;
        }
        return i + 1;
      });
    }, 700);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-10 text-center">
      <motion.div
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="text-8xl mb-8"
      >
        🦉
      </motion.div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Твой финансовый план готов!</h2>
      <div className="space-y-2 mb-8 w-full">
        {INSIGHTS.map((insight, i) => (
          <motion.div
            key={i}
            animate={{ opacity: insightIdx >= i ? 1 : 0.2 }}
            className={`text-left px-4 py-2 rounded-xl text-sm ${
              insightIdx >= i ? 'text-gray-800 bg-white shadow-sm' : 'text-gray-300'
            }`}
          >
            {insight}
          </motion.div>
        ))}
      </div>
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: showCta ? 1 : 0, y: showCta ? 0 : 20 }}
        whileTap={{ scale: 0.97 }}
        onClick={onFinish}
        disabled={isLoading || !showCta}
        className="w-full bg-blue-600 text-white font-semibold text-lg py-4 rounded-2xl haptic"
        style={{ boxShadow: '0 4px 20px rgba(45,125,210,0.35)' }}
      >
        {isLoading ? 'Загрузка...' : 'Открыть FinWise 🚀'}
      </motion.button>
    </div>
  );
}
