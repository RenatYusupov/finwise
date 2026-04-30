import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { apiClient } from '@/shared/api/client';
import type { UserStreak } from '@finwise/shared-types';

export function StreakBadge() {
  const { data: streak } = useQuery<UserStreak>({
    queryKey: ['streak'],
    queryFn: () => apiClient.get('/gamification/streak').then((r) => r.data.data),
  });

  if (!streak || streak.currentStreak === 0) return null;

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      whileTap={{ scale: 0.9 }}
      className="flex items-center gap-1 bg-orange-50 border border-orange-200 rounded-full px-3 py-1.5 haptic"
    >
      <motion.span
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ repeat: Infinity, duration: 1.5 }}
        className="text-lg"
      >
        🔥
      </motion.span>
      <span className="text-sm font-bold text-orange-600">{streak.currentStreak}</span>
    </motion.div>
  );
}
