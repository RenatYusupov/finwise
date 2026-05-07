import { useEffect } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from './AppLayout';
import { OnboardingPage } from '@/pages/onboarding/OnboardingPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { TransactionsPage } from '@/pages/transactions/TransactionsPage';
import { AddTransactionPage } from '@/pages/transactions/AddTransactionPage';
import { AnalyticsPage } from '@/pages/analytics/AnalyticsPage';
import { GoalsPage } from '@/pages/goals/GoalsPage';
import { BudgetPage } from '@/pages/budget/BudgetPage';
import { AiChatPage } from '@/pages/ai-chat/AiChatPage';
import { ProfilePage } from '@/pages/profile/ProfilePage';
import { useAuthStore } from '@/features/auth/store';
import { forceSyncToCloud, rehydrateFromCloud } from '@/features/finance/store';

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
        { path: 'goals', element: <GoalsPage /> },
        { path: 'budget', element: <BudgetPage /> },
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
      // Sequential: rehydrate first (read cloud → merge → update store),
      // then upload the merged result back to cloud.
      setTimeout(async () => {
        await rehydrateFromCloud().catch(() => {/* ignore */});
        await forceSyncToCloud().catch(() => {/* ignore */});
      }, 300);

      // Re-sync when Mini App is re-activated (user switches back from another chat).
      // Using Telegram's native 'activated' event only — NOT visibilitychange,
      // because visibilitychange fires during page reload and breaks the WebApp bridge.
      const handleActivated = async () => {
        await rehydrateFromCloud().catch(() => {/* ignore */});
      };

      window.Telegram.WebApp.onEvent('activated', handleActivated);

      return () => {
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
