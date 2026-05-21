import { useEffect, useRef, Component, type ReactNode } from 'react';
import { HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
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

  // One-time Telegram WebApp initialization — runs only once on mount
  useEffect(() => {
    if (tgInitDone.current) return;
    tgInitDone.current = true;

    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();

      // Rehydrate from CloudStorage after WebApp.ready()
      // Use 1500ms delay — Telegram Desktop bridge can take longer to expose CloudStorage
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      const timer = setTimeout(() => {
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

      return () => {
        clearTimeout(timer);
        if (retryTimer) clearTimeout(retryTimer);
        window.Telegram?.WebApp?.offEvent('activated', handleActivated);
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — one-time init only

  // Separate effect for onboarding redirect (browser-only, not in Telegram)
  useEffect(() => {
    if (window.Telegram?.WebApp) return; // Telegram handles its own flow
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
      <HashRouter>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </HashRouter>
    </QueryClientProvider>
  );
}
