import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BottomNav } from '@/shared/ui/BottomNav';
import { AddTransactionFab } from '@/shared/ui/AddTransactionFab';

// Pages that need full-height flex layout (not scrollable wrapper)
const FULL_HEIGHT_PAGES = ['/transactions/add', '/ai'];

export function AppLayout() {
  const location = useLocation();
  const isAddPage = location.pathname === '/transactions/add';
  const isFullHeight = FULL_HEIGHT_PAGES.some((p) => location.pathname.startsWith(p));

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-warm)' }}>
      {/* Main content area */}
      <main
        className={`flex-1 min-h-0 ${isFullHeight ? 'flex flex-col overflow-hidden' : 'overflow-y-auto scroll-area pb-20'}`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={isFullHeight ? 'flex flex-col flex-1 min-h-0' : 'min-h-full'}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* FAB for adding transaction */}
      {!isAddPage && <AddTransactionFab />}

      {/* Bottom navigation */}
      <BottomNav />
    </div>
  );
}
