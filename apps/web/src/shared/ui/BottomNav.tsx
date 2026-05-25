import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const NAV_ITEMS = [
  { path: '/', label: 'Главная', icon: '🏠' },
  { path: '/analytics', label: 'Анализ', icon: '📊' },
  { path: '/ai', label: 'AI', icon: '🦉', isAi: true },
  { path: '/budget', label: 'Бюджет', icon: '💰' },
  { path: '/profile', label: 'Профиль', icon: '👤' },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 safe-bottom">
      {/* Glass background */}
      <div className="glass border-t border-white/60 px-3 pt-2 pb-2">
        <div className="flex items-center justify-around">
          {NAV_ITEMS.map((item) => {
            const isActive = item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);

            if (item.isAi) {
              return (
                <motion.button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  whileTap={{ scale: 0.92 }}
                  className="relative flex flex-col items-center -mt-5"
                >
                  <motion.div
                    animate={isActive ? { scale: [1, 1.05, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-lg"
                    style={{
                      background: isActive
                        ? 'linear-gradient(135deg, #6C63FF 0%, #9B59B6 100%)'
                        : 'linear-gradient(135deg, #8B83FF 0%, #B07FD4 100%)',
                      boxShadow: isActive
                        ? '0 4px 20px rgba(108, 99, 255, 0.5)'
                        : '0 4px 16px rgba(108, 99, 255, 0.3)',
                    }}
                  >
                    {item.icon}
                  </motion.div>
                  <span className="text-xs font-semibold mt-1" style={{ color: '#6C63FF' }}>
                    {item.label}
                  </span>
                </motion.button>
              );
            }

            return (
              <motion.button
                key={item.path}
                onClick={() => navigate(item.path)}
                whileTap={{ scale: 0.92 }}
                className="relative flex flex-col items-center gap-0.5 px-3 py-1 rounded-2xl"
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-bg"
                    className="absolute inset-0 rounded-2xl"
                    style={{ background: 'rgba(108, 99, 255, 0.08)' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="text-xl relative z-10">{item.icon}</span>
                <span
                  className="text-xs font-medium relative z-10"
                  style={{ color: isActive ? '#6C63FF' : '#9CA3AF' }}
                >
                  {item.label}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="nav-dot"
                    className="absolute -bottom-1 w-1 h-1 rounded-full"
                    style={{ background: '#6C63FF' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
