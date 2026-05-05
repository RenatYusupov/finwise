import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BottomNav } from '@/shared/ui/BottomNav';
import { AddTransactionFab } from '@/shared/ui/AddTransactionFab';
import { useUIStore } from '@/features/ui/store';

// Pages that need full-height flex layout (not scrollable wrapper)
const FULL_HEIGHT_PAGES = ['/transactions/add', '/ai'];

// Pages where BottomNav should be hidden (they have their own bottom UI)
const HIDE_NAV_PAGES = ['/transactions/add', '/ai'];

export function AppLayout() {
  const location = useLocation();
  const isFullHeight = FULL_HEIGHT_PAGES.some((p) => location.pathname.startsWith(p));
  const hideNav = HIDE_NAV_PAGES.some((p) => location.pathname.startsWith(p));
  const modalOpenCount = useUIStore((s) => s.modalOpenCount);
  const isModalOpen = modalOpenCount > 0;

  // When a modal is open: keep overflow-y-auto so the sheet's inner scroll works,
  // but add touch-action:none + overscroll-behavior:none to prevent Telegram WebView
  // from scrolling the background. The sheet's inner div has touch-action:pan-y to override.
  const mainClass = isFullHeight
    ? 'flex-1 min-h-0 flex flex-col overflow-hidden'
    : 'flex-1 min-h-0 overflow-y-auto scroll-area';

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-warm)' }}>
      {/* Main content area */}
      <main
        className={mainClass}
        style={{
          background: 'var(--bg-warm)',
          // Reserve space for BottomNav (≈64px) + iOS safe-area-inset-bottom
          paddingBottom: isFullHeight ? undefined : 'calc(80px + env(safe-area-inset-bottom, 0px))',
          // When modal is open: block background scroll in Telegram WebView
          // The sheet's inner div has touch-action:pan-y to override.
          ...(isModalOpen ? { touchAction: 'none' as const, overscrollBehavior: 'none' as const } : {}),
        }}
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

      {/* FAB for adding transaction — hidden on pages with own bottom UI */}
      {!hideNav && <AddTransactionFab />}

      {/* Bottom navigation — hidden on pages with own bottom UI (AI chat, add transaction) */}
      {!hideNav && <BottomNav />}
    </div>
  );
}
