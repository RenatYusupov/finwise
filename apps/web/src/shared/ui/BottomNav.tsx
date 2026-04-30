import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';

const NAV_ITEMS = [
  { path: '/', label: 'Главная', icon: '🏠' },
  { path: '/analytics', label: 'Аналитика', icon: '📊' },
  { path: '/goals', label: 'Цели', icon: '🎯' },
  { path: '/ai', label: 'AI', icon: '🤖' },
  { path: '/profile', label: 'Профиль', icon: '👤' },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 safe-bottom z-50">
      <div className="flex items-center justify-around px-2 pt-2 pb-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path);

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={clsx(
                'relative flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all haptic',
                isActive ? 'text-blue-600' : 'text-gray-400'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute inset-0 bg-blue-50 rounded-xl -z-10"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="text-xl">{item.icon}</span>
              <span className={clsx(
                'text-xs font-medium',
                isActive ? 'text-blue-600' : 'text-gray-400'
              )}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
