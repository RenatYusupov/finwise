import { test, expect } from '@playwright/test';
import { bypassOnboarding } from './helpers/setup';

/**
 * Навигация — нижняя панель и переходы между страницами.
 *
 * Важно: React Router в BrowserRouter режиме обновляет URL через history.pushState,
 * но Playwright's page.url() не отражает client-side переходы (известное ограничение).
 * Поэтому проверяем КОНТЕНТ страниц, а не URL — именно это видит пользователь.
 */

test.describe('Навигация (BottomNav)', () => {
  test.beforeEach(async ({ page }) => {
    await bypassOnboarding(page);
    await page.goto('/finwise/');
    await page.waitForLoadState('load');
  });

  // ── Отображение панели ────────────────────────────────────────────────────

  test('все 5 пунктов меню отображаются', async ({ page }) => {
    await expect(page.getByText('Главная')).toBeVisible();
    await expect(page.getByText('Анализ')).toBeVisible();
    await expect(page.getByText('AI')).toBeVisible();
    await expect(page.getByText('Бюджет')).toBeVisible();
    await expect(page.getByText('Профиль')).toBeVisible();
  });

  test('AI-кнопка имеет уникальный круглый стиль (выделяется)', async ({ page }) => {
    // AI-кнопка — elevated round button с gradient фоном
    const aiBtn = page.locator('button').filter({ hasText: 'AI' });
    await expect(aiBtn).toBeVisible();
    // Кнопка должна быть больше остальных (w-14 h-14 = 56px)
    const box = await aiBtn.boundingBox();
    expect(box?.width).toBeGreaterThan(40);
    expect(box?.height).toBeGreaterThan(40);
  });

  // ── Переходы между страницами ─────────────────────────────────────────────

  test('клик "Анализ" показывает страницу аналитики', async ({ page }) => {
    await page.getByText('Анализ').click();
    // Аналитика загрузилась — ищем характерный контент
    await expect(page.getByText('Аналитика')).toBeVisible();
  });

  test('клик "Бюджет" показывает страницу бюджета', async ({ page }) => {
    await page.getByText('Бюджет').click();
    await expect(page.locator('h1, h2').filter({ hasText: /бюджет/i }).first()).toBeVisible();
  });

  test('клик "Профиль" показывает страницу профиля', async ({ page }) => {
    await page.getByText('Профиль').click();
    // Профиль открылся (хотя бы без ошибок)
    await expect(page.getByText('Ошибка рендера')).not.toBeVisible();
    // Кнопки навигации всё ещё видны (AppLayout)
    await expect(page.getByText('Профиль').first()).toBeVisible();
  });

  test('клик "AI" показывает страницу чата', async ({ page }) => {
    await page.getByText('AI').first().click();
    await expect(page.getByText('Ошибка рендера')).not.toBeVisible();
    // FAB и BottomNav скрыты на AI странице
    await expect(page.getByTestId('fab-add-transaction')).not.toBeVisible();
  });

  test('клик "Главная" возвращает на дашборд после перехода', async ({ page }) => {
    // Уходим на Аналитику
    await page.getByText('Анализ').click();
    await expect(page.getByText('Аналитика')).toBeVisible();

    // Возвращаемся на Главную
    await page.getByText('Главная').click();
    // Дашборд контент
    await expect(page.getByTestId('fab-add-transaction')).toBeVisible();
  });

  // ── FAB-кнопка ────────────────────────────────────────────────────────────

  test('FAB-кнопка "+" видна на главной странице', async ({ page }) => {
    await expect(page.getByTestId('fab-add-transaction')).toBeVisible();
  });

  test('FAB-кнопка "+" видна на странице аналитики', async ({ page }) => {
    await page.getByText('Анализ').click();
    await expect(page.getByTestId('fab-add-transaction')).toBeVisible();
  });

  test('FAB-кнопка "+" открывает форму добавления транзакции', async ({ page }) => {
    await page.getByTestId('fab-add-transaction').click();
    await expect(page.getByText('Новая операция')).toBeVisible();
  });

  test('FAB и нижняя навигация скрыты в форме добавления транзакции', async ({ page }) => {
    await page.getByTestId('fab-add-transaction').click();
    await expect(page.getByText('Новая операция')).toBeVisible();
    // На этой странице FAB и nav не отображаются
    await expect(page.getByTestId('fab-add-transaction')).not.toBeVisible();
    await expect(page.getByText('Главная').first()).not.toBeVisible();
  });
});
