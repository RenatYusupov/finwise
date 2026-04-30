import { motion } from 'framer-motion';

interface Props {
  onNext: () => void;
}

const FEATURES = [
  { icon: '📊', title: 'Умная аналитика', desc: 'Понимай, куда уходят деньги' },
  { icon: '🤖', title: 'AI-советник', desc: 'Персональные рекомендации' },
  { icon: '🎯', title: 'Цели', desc: 'Достигай финансовых мечт' },
];

export function StepWelcome({ onNext }: Props) {
  return (
    <div className="flex flex-col items-center justify-between min-h-[calc(100svh-80px)] px-6 py-10">
      {/* Mascot */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="text-8xl"
        >
          🦉
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Привет! Я FinWise
          </h1>
          <p className="text-gray-500 text-lg">
            Твой умный финансовый помощник
          </p>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="w-full space-y-3 mt-4"
        >
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.1 }}
              className="flex items-center gap-4 bg-white rounded-2xl p-4 shadow-sm"
            >
              <span className="text-3xl">{f.icon}</span>
              <div>
                <div className="font-semibold text-gray-900">{f.title}</div>
                <div className="text-sm text-gray-500">{f.desc}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* CTA */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
        whileTap={{ scale: 0.97 }}
        onClick={onNext}
        className="w-full bg-blue-600 text-white font-semibold text-lg py-4 rounded-2xl haptic shadow-lg"
        style={{ boxShadow: '0 4px 20px rgba(45, 125, 210, 0.35)' }}
      >
        Начать за 2 минуты →
      </motion.button>
    </div>
  );
}
