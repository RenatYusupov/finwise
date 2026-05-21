import { useEffect, useRef, Component, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
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
 * Synchronous Telegram context detection.
 *
 * window.Telegram?.WebApp is populated by the SDK script which loads
 * asynchronously — it may be undefined on the very first render cycle.
 * We therefore use three additional synchronous signals:
 *   1. window.TelegramWebviewProxy — injected by the native Telegram app
 *      into the WebView before any JS runs.
 *   2. URL hash containing "tgWebApp" — Telegram appends launch params to
 *      the hash fragment synchronously before the page loads.
 *   3. window.Telegram?.WebApp — available once the SDK script has run.
 *
 * This function is safe to call at module level or during render.
 */
function isTelegramContext(): boolean {
  if (typeof window === 'undefined') return false;
  // Native Telegram WebView injects this proxy object synchronously
  if ((window as unknown as { TelegramWebviewProxy?: unknown }).TelegramWebviewProxy) return true;
  // SDK already loaded
  if (window.Telegram?.WebApp) return true;
  // Telegram appends launch params to the URL hash before JS runs
  if (window.location.hash.includes('tgWebApp')) return true;
  return false;
}

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
  // Uses isTelegramContext() which is synchronous and reliable even before
  // the Telegram SDK script finishes loading, preventing a race condition
  // where window.Telegram?.WebApp is undefined on the first render cycle.
  useEffect(() => {
    if (isTelegramContext()) return; // never redirect in Telegram
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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* BrowserRouter with basename="/finwise" for GitHub Pages project repo.
          HashRouter was tried (TASK-026) but Telegram appends launch params to
          the URL hash (e.g. #tgWebAppData=...) which HashRouter interprets as a
          route path, causing a blank screen. BrowserRouter avoids this entirely. */}
      <BrowserRouter basename="/finwise">
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
