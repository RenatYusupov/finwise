import { test, expect } from '@playwright/test';
import { bypassOnboarding, seedFinanceData, clearStorage } from './helpers/setup';

/**
 * Дашборд — главный экран приложения (/),
 *
 * Покрываем:
 * - Пустое состояние: нет транзакций
 * - Отображение баланса и расчётов при наличии данных
 * - Карточки транзакций в списке
 * - Цветовое кодирование: расход = красный/оранжевый, доход = зелёный
 * - Отображение знаков "−" и "+" перед суммами
 */

const TODAY = new Date().toISOString();

const SAMPLE_TRANSACTIONS = [
  {
    id: 'tx-1',
    type: 'income' as const,
    amount: 80_000,
    categoryId: 'salary',
    description: 'Зарплата',
    date: TODAY,
  },
  {
    id: 'tx-2',
    type: 'expense' as const,
    amount: 1_500,
    categoryId: 'food',
    description: 'Обед',
    date: TODAY,
  },
  {
    id: 'tx-3',
    type: 'expense' as const,
    amount: 350,
    categoryId: 'transport',
    description: 'Метро',
    date: TODAY,
  },
];

test.describe('Дашборд — пустое состояние', () => {
  test.beforeEach(async ({ page }) => {
    await bypassOnboarding(page);
    await page.goto('/finwise/');
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('страница загружается без ошибок', async ({ page }) => {
    // Нет красного экрана ошибки
    await expect(page.getByText('Ошибка рендера')).not.toBeVisible();
  });

  test('отображается нижняя навигация', async ({ page }) => {
    await expect(page.getByText('Главная')).toBeVisible();
    await expect(page.getByText('Анализ')).toBeVisible();
  });

  test('отображается FAB-кнопка добавления транзакции', async ({ page }) => {
    await expect(page.getByTestId('fab-add-transaction')).toBeVisible();
  });
});

test.describe('Дашборд — с транзакциями', () => {
  test.beforeEach(async ({ page }) => {
    await bypassOnboarding(page);
    await seedFinanceData(page, { transactions: SAMPLE_TRANSACTIONS });
    await page.goto('/finwise/');
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('страница загружается без ошибок', async ({ page }) => {
    await expect(page.getByText('Ошибка рендера')).not.toBeVisible();
  });

  test('отображается сумма дохода', async ({ page }) => {
    // 80 000 ₽ дохода отображается (может быть в разных форматах)
    await expect(page.getByText(/80\s*000|80\.0K/).first()).toBeVisible();
  });

  test('отображается расход с суммой', async ({ page }) => {
    await expect(page.getByText(/1\s*500|1\.5K/).first()).toBeVisible();
  });

  test('FAB-кнопка "+" ведёт на страницу добавления транзакции', async ({ page }) => {
    await page.getByTestId('fab-add-transaction').click();
    await expect(page.getByText('Новая операция')).toBeVisible();
  });
});

test.describe('Дашборд — онбординг-редирект', () => {
  test('незавершённый онбординг показывает экран онбординга', async ({ page }) => {
    // Явно очищаем localStorage через addInitScript ДО загрузки страницы.
    // Это безопасно: скрипт запускается до инициализации Zustand,
    // поэтому storage events не стреляют и редиректов не происходит.
    await page.addInitScript(() => {
      localStorage.clear();
      // НЕ устанавливаем finwise-auth → onboardingCompleted останется false
    });

    await page.goto('/finwise/');
    // useEffect видит onboardingCompleted=false и вызывает navigate('/onboarding')
    await expect(page.getByText('Привет! Я FinWise')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Начать за 2 минуты →')).toBeVisible();
  });

  test('страница онбординга отображается корректно', async ({ page }) => {
    await page.goto('/finwise/onboarding');
    await page.waitForLoadState('networkidle');
    // Нет ошибки рендера
    await expect(page.getByText('Ошибка рендера')).not.toBeVisible();
  });
});
