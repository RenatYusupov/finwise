import { useEffect, useRef, Component, type ReactNode } from 'react';
import { BrowserRouter, MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from './AppLayout';
import { OnboardingPage } from '@/pages/onboarding/OnboardingPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { TransactionsPage } from '@/pages/transactions/TransactionsPage';
import { AddTransactionPage } from '@/pages/transactions/AddTransactionPage';
import { AnalyticsPage } from '@/pages/analytics/AnalyticsPage';
import { CategoryDetailPage } from '@/pages/analytics/CategoryDetailPage';
import { GoalsPage } from '@/pages/goals/GoalsPage';
import { GoalDetailPage } from '@/pages/goals/GoalDetailPage';
import { BudgetPage } from '@/pages/budget/BudgetPage';
import { AiChatPage } from '@/pages/ai-chat/AiChatPage';
import { ProfilePage } from '@/pages/profile/ProfilePage';
import { RecurringPage } from '@/pages/recurring/RecurringPage';
import { useAuthStore } from '@/features/auth/store';
import { rehydrateFromCloud } from '@/features/finance/store';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: 1,
    },
  },
});

/**
 * Frozen Telegram context flag — set synchronously in main.tsx before React mounts.
 * Using a module-level constant avoids re-evaluating the check on every render/effect.
 * Falls back to runtime checks in case this module is loaded before main.tsx sets the flag
 * (e.g. in tests or SSR).
 */
const IS_TELEGRAM: boolean = (() => {
  if (typeof window === 'undefined') return false;
  // Prefer the flag set by main.tsx before ReactDOM.render
  const w = window as unknown as Record<string, unknown>;
  if (typeof w.__isTelegram === 'boolean') return w.__isTelegram as boolean;
  // Fallback: check synchronous signals directly
  if (w.TelegramWebviewProxy) return true;
  if (window.Telegram?.WebApp) return true;
  if (window.location.hash.includes('tgWebApp')) return true;
  return false;
})();

// DEBUG: capture detection signals at module load time for the overlay
const _DEBUG_SIGNALS = (() => {
  if (typeof window === 'undefined') return {};
  const w = window as unknown as Record<string, unknown>;
  return {
    __isTelegram: w.__isTelegram,
    hasTWP: !!w.TelegramWebviewProxy,
    hasTgWebApp: !!(window as any).Telegram?.WebApp,
    hashHasTg: window.location.hash.includes('tgWebApp'),
    hash: window.location.hash.slice(0, 40),
    href: window.location.href.slice(0, 60),
  };
})();

// Global error boundary to catch silent render crashes
interface ErrorBoundaryState { error: Error | null }
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    console.error('[FinWise ErrorBoundary]', error);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: '#333', fontFamily: 'sans-serif' }}>
          <h2 style={{ color: '#c00' }}>Ошибка рендера</h2>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', color: '#c00', background: '#fff0f0', padding: 12, borderRadius: 8 }}>
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppRoutes() {
  const { onboardingCompleted } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const tgInitDone = useRef(false);

  // One-time Telegram WebApp initialization — runs only once on mount.
  // We wait for the SDK to be available (it loads async) before calling
  // ready()/expand(). Poll with a short interval rather than a fixed delay.
  useEffect(() => {
    if (tgInitDone.current) return;

    let pollCount = 0;
    const MAX_POLLS = 20; // 20 × 100ms = 2s max wait

    const tryInit = () => {
      if (!window.Telegram?.WebApp) {
        pollCount++;
        if (pollCount < MAX_POLLS) {
          pollTimer = setTimeout(tryInit, 100);
        }
        return;
      }

      tgInitDone.current = true;
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();

      // Rehydrate from CloudStorage after WebApp.ready()
      // Use 1500ms delay — Telegram Desktop bridge can take longer to expose CloudStorage
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      const dataTimer = setTimeout(() => {
        rehydrateFromCloud().catch(() => {/* ignore */});
        retryTimer = setTimeout(() => {
          rehydrateFromCloud().catch(() => {/* ignore */});
        }, 1500);
      }, 1500);

      // Re-sync when Mini App is re-activated
      const handleActivated = async () => {
        await rehydrateFromCloud().catch(() => {/* ignore */});
      };
      window.Telegram.WebApp.onEvent('activated', handleActivated);

      // Store cleanup refs on the window so the effect cleanup can reach them
      (window as unknown as Record<string, unknown>).__fwDataTimer = dataTimer;
      (window as unknown as Record<string, unknown>).__fwRetryTimer = retryTimer;
      (window as unknown as Record<string, unknown>).__fwHandleActivated = handleActivated;
    };

    let pollTimer: ReturnType<typeof setTimeout> = setTimeout(tryInit, 0);

    return () => {
      clearTimeout(pollTimer);
      const w = window as unknown as Record<string, unknown>;
      if (w.__fwDataTimer) clearTimeout(w.__fwDataTimer as ReturnType<typeof setTimeout>);
      if (w.__fwRetryTimer) clearTimeout(w.__fwRetryTimer as ReturnType<typeof setTimeout>);
      if (w.__fwHandleActivated && window.Telegram?.WebApp) {
        window.Telegram.WebApp.offEvent('activated', w.__fwHandleActivated as () => void);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — one-time init only

  // Onboarding redirect — browser-only.
  // IS_TELEGRAM is a module-level constant frozen at page-load time in main.tsx,
  // so it never changes during the session and cannot cause a race condition.
  useEffect(() => {
    if (IS_TELEGRAM) return; // never redirect in Telegram
    if (!onboardingCompleted && location.pathname !== '/onboarding') {
      navigate('/onboarding');
    }
  }, [onboardingCompleted, navigate, location.pathname]);

  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/" element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="transactions/add" element={<AddTransactionPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="analytics/category/:categoryId" element={<CategoryDetailPage />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="goals/:id" element={<GoalDetailPage />} />
        <Route path="budget" element={<BudgetPage />} />
        <Route path="recurring" element={<RecurringPage />} />
        <Route path="ai" element={<AiChatPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
  );
}

// DEBUG overlay component — shows IS_TELEGRAM detection signals + current route
// REMOVE after diagnosis is confirmed
function DebugOverlayInner() {
  const location = useLocation();
  const s = _DEBUG_SIGNALS as Record<string, unknown>;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
      background: IS_TELEGRAM ? 'rgba(0,150,0,0.92)' : 'rgba(180,0,0,0.92)',
      color: '#fff', fontSize: 10, padding: '4px 8px', fontFamily: 'monospace',
      lineHeight: 1.5, wordBreak: 'break-all',
    }}>
      <b>IS_TG={String(IS_TELEGRAM)} router={IS_TELEGRAM ? 'MEM' : 'BROWSER'} path={location.pathname}</b>{' '}
      __iTG={String(s.__isTelegram)} TWP={String(s.hasTWP)} tgWA={String(s.hasTgWebApp)}{' '}
      hash={String(s.hash).slice(0, 30)}
    </div>
  );
}

// Wrapper that renders outside the router (for IS_TELEGRAM signal display)
// and inside the router (for location.pathname display)
function DebugOverlay() {
  return null; // replaced by DebugOverlayInner inside router
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {IS_TELEGRAM ? (
        <MemoryRouter initialEntries={['/']} initialIndex={0}>
          <DebugOverlayInner />
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </MemoryRouter>
      ) : (
        <BrowserRouter basename="/finwise">
          <DebugOverlayInner />
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </BrowserRouter>
      )}
    </QueryClientProvider>
  );
}
