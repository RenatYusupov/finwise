import { useEffect } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
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

const router = createBrowserRouter(
  [
    {
      path: '/onboarding',
      element: <OnboardingPage />,
    },
    {
      path: '/',
      element: <AppLayout />,
      children: [
        { index: true, element: <DashboardPage /> },
        { path: 'transactions', element: <TransactionsPage /> },
        { path: 'transactions/add', element: <AddTransactionPage /> },
        { path: 'analytics', element: <AnalyticsPage /> },
        { path: 'analytics/category/:categoryId', element: <CategoryDetailPage /> },
        { path: 'goals', element: <GoalsPage /> },
        { path: 'goals/:id', element: <GoalDetailPage /> },
        { path: 'budget', element: <BudgetPage /> },
        { path: 'recurring', element: <RecurringPage /> },
        { path: 'ai', element: <AiChatPage /> },
        { path: 'profile', element: <ProfilePage /> },
      ],
    },
  ],
  { basename: '/finwise' }
);

function AppInner() {
  const { onboardingCompleted } = useAuthStore();

  useEffect(() => {
    // Initialize Telegram WebApp if available
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();

      // After WebApp.ready(), CloudStorage is guaranteed available.
      // Rehydrate: read cloud → merge with local → update store.
      // Do NOT forceSyncToCloud here — that would overwrite cloud with stale
      // local data before the cloud read completes on other devices.
      //
      // Use 1500ms delay on first attempt — Telegram Desktop WebApp bridge
      // can take longer than mobile to expose CloudStorage after ready().
      // If CloudStorage is still not available (tgCloud() returns null inside
      // rehydrateFromCloud), the function returns early and we retry at 3000ms.
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      const timer = setTimeout(() => {
        rehydrateFromCloud().catch(() => {/* ignore */});
        // Retry once more at 3s in case CloudStorage wasn't ready at 1.5s
        // (common on Telegram Desktop first open). rehydrateFromCloud() is
        // idempotent and guarded by _rehydrating so double-calls are safe.
        retryTimer = setTimeout(() => {
          rehydrateFromCloud().catch(() => {/* ignore */});
        }, 1500);
      }, 1500);

      // Re-sync when Mini App is re-activated (user switches back from another chat).
      // Using Telegram's native 'activated' event only — NOT visibilitychange,
      // because visibilitychange fires during page reload and breaks the WebApp bridge.
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

    // Redirect to onboarding if not completed
    if (!onboardingCompleted) {
      router.navigate('/onboarding');
    }
  }, [onboardingCompleted]);

  return <RouterProvider router={router} />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}
