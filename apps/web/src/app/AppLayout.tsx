import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BottomNav } from '@/shared/ui/BottomNav';
import { AddTransactionFab } from '@/shared/ui/AddTransactionFab';

export function AppLayout() {
  const location = useLocation();
  const isAddPage = location.pathname === '/transactions/add';

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Main scrollable content */}
      <main className="flex-1 overflow-y-auto scroll-area pb-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="h-full"
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
