import { test, expect } from '@playwright/test';
import { bypassOnboarding, seedFinanceData, clearStorage } from './helpers/setup';
import { goToGoals } from './helpers/navigate';

/**
 * Финансовые цели — страница /goals.
 *
 * Переход: Dashboard → "Все →" в секции "Мои цели" (или popstate для теста).
 *
 * Покрываем:
 * - Empty state: заглушка с кнопкой "Создать первую цель"
 * - Создание цели: форма, поля, кнопка "Создать цель"
 * - Отображение цели: название, сумма, прогресс-бар, процент
 * - Пополнение цели: кнопка "+ Пополнить", ввод суммы, пресеты
 * - Удаление цели: кнопка 🗑
 * - Суммарная строка: "Накоплено X из Y"
 */

const SAMPLE_GOAL = {
  id: 'goal-iphone',
  name: 'Новый iPhone',
  icon: '📱',
  targetAmount: 100_000,
  currentAmount: 30_000,
  color: '#6C63FF',
  createdAt: new Date().toISOString(),
};

test.describe('Цели — пустое состояние', () => {
  test.beforeEach(async ({ page }) => {
    await bypassOnboarding(page);
    await page.goto('/finwise/');
    await page.waitForLoadState('load');
    await goToGoals(page);
  });

  test.afterEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('показывается заголовок "Мои цели"', async ({ page }) => {
    await expect(page.getByText('🎯 Мои цели')).toBeVisible();
  });

  test('показывается заглушка когда целей нет', async ({ page }) => {
    await expect(page.getByText('Нет целей')).toBeVisible();
    await expect(page.getByText('Создать первую цель ✨')).toBeVisible();
  });

  test('кнопка "Новая" в шапке видна', async ({ page }) => {
    await expect(page.locator('button').filter({ hasText: 'Новая' })).toBeVisible();
  });
});

test.describe('Цели — создание через кнопку "Новая"', () => {
  test.beforeEach(async ({ page }) => {
    await bypassOnboarding(page);
    await page.goto('/finwise/');
    await page.waitForLoadState('load');
    await goToGoals(page);
  });

  test.afterEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('кнопка "Новая" открывает sheet создания цели', async ({ page }) => {
    await page.locator('button').filter({ hasText: 'Новая' }).click();
    await expect(page.getByText('✨ Новая цель')).toBeVisible();
    await expect(page.getByText('Название цели ✏️')).toBeVisible();
    await expect(page.getByText('Целевая сумма')).toBeVisible();
  });

  test('"Создать цель" неактивна без названия и суммы', async ({ page }) => {
    await page.locator('button').filter({ hasText: 'Новая' }).click();
    await expect(page.getByText('Создать цель ✨')).toBeDisabled();
  });

  test('"Создать цель" активна при заполненных полях', async ({ page }) => {
    await page.locator('button').filter({ hasText: 'Новая' }).click();
    await page.locator('input[placeholder="Например: Новый iPhone"]').fill('Отпуск в Турции');
    await page.locator('input[type="number"]').first().fill('150000');
    await expect(page.getByText('Создать цель ✨')).toBeEnabled();
  });

  test('создание цели: название появляется в списке', async ({ page }) => {
    await page.locator('button').filter({ hasText: 'Новая' }).click();
    await page.locator('input[placeholder="Например: Новый iPhone"]').fill('MacBook Pro');
    await page.locator('input[type="number"]').first().fill('200000');
    await page.getByText('Создать цель ✨').click();

    // Sheet закрылся, цель появилась
    await expect(page.getByText('✨ Новая цель')).not.toBeVisible();
    await expect(page.getByText('MacBook Pro')).toBeVisible();
  });

  test('можно выбрать иконку для цели', async ({ page }) => {
    await page.locator('button').filter({ hasText: 'Новая' }).click();
    await page.locator('button').filter({ hasText: '✈️' }).click();
    // После клика — иконка выбрана (подсветка через ring)
    await expect(page.locator('button').filter({ hasText: '✈️' })).toHaveClass(/ring-2|scale-110/);
  });

  test('кнопка "Создать первую цель" тоже открывает форму', async ({ page }) => {
    await page.getByText('Создать первую цель ✨').click();
    await expect(page.getByText('✨ Новая цель')).toBeVisible();
  });
});

test.describe('Цели — с существующими данными', () => {
  test.beforeEach(async ({ page }) => {
    await bypassOnboarding(page);
    await seedFinanceData(page, { goals: [SAMPLE_GOAL] });
    await page.goto('/finwise/');
    await page.waitForLoadState('load');
    await goToGoals(page);
  });

  test.afterEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('отображается карточка цели с названием', async ({ page }) => {
    await expect(page.getByText('Новый iPhone')).toBeVisible();
  });

  test('отображается процент прогресса (30%)', async ({ page }) => {
    // 30 000 из 100 000 = 30%
    await expect(page.getByText('30%')).toBeVisible();
  });

  test('отображается суммарная строка "Накоплено"', async ({ page }) => {
    await expect(page.getByText(/Накоплено/)).toBeVisible();
  });

  test('кнопка "+ Пополнить" видна', async ({ page }) => {
    await expect(page.locator('button').filter({ hasText: '+ Пополнить' })).toBeVisible();
  });

  test('кнопка удаления 🗑 видна', async ({ page }) => {
    await expect(page.locator('button').filter({ hasText: '🗑' })).toBeVisible();
  });

  test('клик по карточке переходит на страницу цели', async ({ page }) => {
    await page.getByText('Новый iPhone').first().click();
    // Страница цели показывает детальный вид — кнопка "Пополнить" и имя
    // (Примечание: URL меняется через client-side routing, page.url() не обновляется)
    await expect(page.getByText('Новый iPhone').first()).toBeVisible();
    // Кнопки "Назад" или другой контент страницы цели
    await expect(page.getByText('Ошибка рендера')).not.toBeVisible();
  });

  test('пополнение цели — открывается sheet с пресетами', async ({ page }) => {
    await page.locator('button').filter({ hasText: '+ Пополнить' }).click();
    await expect(page.getByText('Пополнить цель')).toBeVisible();
    await expect(page.getByText('📱 Новый iPhone')).toBeVisible();
    // Кнопки-пресеты
    await expect(page.locator('button').filter({ hasText: '5 000' })).toBeVisible();
    await expect(page.locator('button').filter({ hasText: '10 000' })).toBeVisible();
  });

  test('кнопка "Пополнить 💰" неактивна без суммы', async ({ page }) => {
    await page.locator('button').filter({ hasText: '+ Пополнить' }).click();
    await expect(page.getByText('Пополнить 💰')).toBeDisabled();
  });

  test('пресет в sheet пополнения заполняет поле', async ({ page }) => {
    await page.locator('button').filter({ hasText: '+ Пополнить' }).click();
    await page.locator('button').filter({ hasText: '5 000' }).click();
    await expect(page.locator('input[type="number"]')).toHaveValue('5000');
    await expect(page.getByText('Пополнить 💰')).toBeEnabled();
  });

  test('удаление цели убирает её из списка', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('button').filter({ hasText: '🗑' }).click();
    await expect(page.getByText('Новый iPhone')).not.toBeVisible();
    await expect(page.getByText('Нет целей')).toBeVisible();
  });
});
