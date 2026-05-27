import type { Page } from '@playwright/test';

/**
 * Пропускает онбординг и гарантирует чистое состояние для каждого теста.
 * Вызывать до page.goto() — initScript запускается ДО любого JS страницы,
 * поэтому localStorage уже готов когда Zustand инициализирует стор.
 *
 * Важно: очищаем localStorage ЗДЕСЬ (не в afterEach), чтобы не вызывать
 * storage events пока страница открыта — иначе Zustand реагирует на изменение
 * и может запустить редирект на /onboarding.
 */
export async function bypassOnboarding(page: Page) {
  await page.addInitScript(() => {
    // Чистим всё — предотвращаем bleeding state между тестами
    localStorage.clear();
    // Устанавливаем auth с пройденным онбордингом
    localStorage.setItem(
      'finwise-auth',
      JSON.stringify({
        state: { onboardingCompleted: true, user: null, token: null },
        version: 0,
      })
    );
  });
}

export async function seedFinanceData(
  page: Page,
  data: {
    transactions?: Array<{
      id: string;
      type: 'expense' | 'income';
      amount: number;
      categoryId: string;
      description: string;
      date: string;
    }>;
    goals?: Array<{
      id: string;
      name: string;
      icon: string;
      targetAmount: number;
      currentAmount: number;
      color: string;
      createdAt: string;
    }>;
  }
) {
  await page.addInitScript((payload) => {
    // Чистим всё (включая финансовый стор от предыдущих тестов)
    localStorage.clear();
    // Восстанавливаем auth
    localStorage.setItem(
      'finwise-auth',
      JSON.stringify({
        state: { onboardingCompleted: true, user: null, token: null },
        version: 0,
      })
    );
    const financeState = {
      state: {
        transactions: payload.transactions ?? [],
        goals: payload.goals ?? [],
        customCategories: [],
        budgets: [],
        recurringPayments: [],
      },
      version: 0,
    };
    localStorage.setItem('finwise-finance', JSON.stringify(financeState));
  }, data);
}

/**
 * no-op: оставлен для обратной совместимости.
 * Очистка происходит автоматически в bypassOnboarding/seedFinanceData через addInitScript.
 * НЕ вызывай localStorage.clear() в afterEach — это вызывает storage events
 * и ломает Zustand (редиректит на /onboarding между тестами).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function clearStorage(_page: Page) {
  // intentionally empty
}
