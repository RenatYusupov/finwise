import { Outlet, useLocation } from 'react-router-dom';
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

  const mainClass = isFullHeight
    ? 'flex-1 min-h-0 flex flex-col overflow-hidden'
    : 'flex-1 min-h-0 overflow-y-auto scroll-area';

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-warm)' }}>
      {/* Main content area — AnimatePresence removed for debug (TASK-033) */}
      <main
        className={mainClass}
        style={{
          background: 'var(--bg-warm)',
          paddingBottom: isFullHeight ? undefined : 'calc(80px + env(safe-area-inset-bottom, 0px))',
          ...(isModalOpen ? { touchAction: 'none' as const, overscrollBehavior: 'none' as const } : {}),
        }}
      >
        <div
          key={location.pathname}
          className={isFullHeight ? 'flex flex-col flex-1 min-h-0' : 'min-h-full'}
        >
          <Outlet />
        </div>
      </main>

      {!hideNav && <AddTransactionFab />}
      {!hideNav && <BottomNav />}
    </div>
  );
}
