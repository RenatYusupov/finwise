import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { apiClient } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/store';
import type { UserStreak, Achievement } from '@finwise/shared-types';

export function ProfilePage() {
  const { user, logout } = useAuthStore();

  const { data: streak } = useQuery<UserStreak>({
    queryKey: ['streak'],
    queryFn: () => apiClient.get('/gamification/streak').then((r) => r.data.data),
  });

  const { data: achievements } = useQuery<Achievement[]>({
    queryKey: ['achievements'],
    queryFn: () => apiClient.get('/gamification/achievements').then((r) => r.data.data),
  });

  const unlockedCount = achievements?.filter((a) => a.unlockedAt).length ?? 0;

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
              {user?.firstName} {user?.lastName}
            </div>
            <div className="text-blue-200 text-sm">@{user?.username ?? 'пользователь'}</div>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Дней подряд', value: streak?.currentStreak ?? 0, icon: '🔥' },
          { label: 'Достижений', value: `${unlockedCount}/${achievements?.length ?? 0}`, icon: '🏆' },
          { label: 'Уровень', value: streak?.level ?? 1, icon: '⭐' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <div className="text-2xl mb-1">{stat.icon}</div>
            <div className="text-xl font-bold text-gray-900">{stat.value}</div>
            <div className="text-xs text-gray-400">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Achievements */}
      {achievements && achievements.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-900 mb-3">🏆 Достижения</h2>
          <div className="grid grid-cols-3 gap-3">
            {achievements.map((ach, i) => (
              <motion.div
                key={ach.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className={`bg-white rounded-2xl p-3 text-center shadow-sm ${
                  !ach.unlockedAt ? 'opacity-40 grayscale' : ''
                }`}
              >
                <div className="text-3xl mb-1">{ach.icon}</div>
                <div className="text-xs font-medium text-gray-700 leading-tight">{ach.name}</div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
        {[
          { icon: '🔔', label: 'Уведомления', action: () => {} },
          { icon: '🏦', label: 'Банковские счета', action: () => {} },
          { icon: '🔒', label: 'Конфиденциальность', action: () => {} },
          { icon: '❓', label: 'Помощь', action: () => {} },
        ].map((item, i) => (
          <button
            key={item.label}
            onClick={item.action}
            className={`w-full flex items-center gap-3 px-4 py-4 haptic ${
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
        className="w-full py-4 rounded-2xl border-2 border-red-100 text-red-500 font-semibold haptic"
      >
        Выйти
      </button>
    </div>
  );
}
