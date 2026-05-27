import type { Page } from '@playwright/test';

/**
 * Переходит на страницу через клик по нижней навигации.
 * Использует клиентский роутинг React Router (как реальный пользователь).
 */
export async function navTo(page: Page, section: 'analytics' | 'ai' | 'budget' | 'profile' | 'home') {
  const labels: Record<string, string> = {
    home: 'Главная',
    analytics: 'Анализ',
    ai: 'AI',
    budget: 'Бюджет',
    profile: 'Профиль',
  };
  await page.getByText(labels[section]).click();
  await page.waitForLoadState('load');
}

/**
 * Переходит на страницу добавления транзакции через FAB-кнопку "+".
 */
export async function goToAddTransaction(page: Page) {
  await page.getByTestId('fab-add-transaction').click();
  await page.waitForSelector('text=Новая операция');
}

/**
 * Переходит на страницу целей через дашборд (ссылка "Все →" в секции "Мои цели").
 */
export async function goToGoals(page: Page) {
  // Ищем ссылку "Все →" рядом с заголовком "Мои цели"
  // Если её нет (пустой стейт), кликаем на "Поставь первую цель" или прямой ссылке
  const allLinks = page.locator('a').filter({ hasText: 'Все →' });
  const count = await allLinks.count();
  if (count > 0) {
    await allLinks.first().click();
  } else {
    // Fallback: используем client-side navigate через evaluate
    await page.evaluate(() => {
      window.history.pushState({}, '', '/finwise/goals');
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    });
  }
  await page.waitForSelector('text=Мои цели');
}
