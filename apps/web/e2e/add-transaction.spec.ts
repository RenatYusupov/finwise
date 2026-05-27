import { test, expect } from '@playwright/test';
import { bypassOnboarding, clearStorage } from './helpers/setup';
import { goToAddTransaction } from './helpers/navigate';

/**
 * Добавление транзакции — ключевой пользовательский сценарий.
 *
 * Переход: Dashboard → FAB "+" → AddTransactionPage.
 *
 * Покрываем:
 * - Отображение формы: заголовок, переключатель типа, поле суммы, категории, кнопка сохранения
 * - Кнопки-пресеты (100, 500, 1000, 3000) — клик подставляет сумму
 * - Валидация: кнопка сохранения неактивна без суммы и без категории
 * - Полный флоу: заполнить форму → сохранить → вернуться на предыдущую страницу
 * - Переключение типа меняет набор категорий
 * - Голосовой ввод (режим "Надиктовать")
 */

test.describe('Добавление транзакции', () => {
  test.beforeEach(async ({ page }) => {
    await bypassOnboarding(page);
    await page.goto('/finwise/');
    await page.waitForLoadState('load');
    await goToAddTransaction(page);
  });

  test.afterEach(async ({ page }) => {
    await clearStorage(page);
  });

  // ── Внешний вид формы ─────────────────────────────────────────────────────

  test('отображается заголовок "Новая операция"', async ({ page }) => {
    await expect(page.getByText('Новая операция')).toBeVisible();
  });

  test('отображается переключатель тип расход/доход', async ({ page }) => {
    await expect(page.getByText('↓ Расход')).toBeVisible();
    await expect(page.getByText('↑ Доход')).toBeVisible();
  });

  test('отображается поле ввода суммы', async ({ page }) => {
    const amountInput = page.locator('input[type="number"]').first();
    await expect(amountInput).toBeVisible();
    // Знак рубля
    await expect(page.getByText('₽').first()).toBeVisible();
  });

  test('отображаются кнопки-пресеты сумм', async ({ page }) => {
    await expect(page.getByRole('button', { name: '100' })).toBeVisible();
    await expect(page.getByRole('button', { name: '500' })).toBeVisible();
    await expect(page.getByRole('button', { name: '1 000' })).toBeVisible();
    await expect(page.getByRole('button', { name: '3 000' })).toBeVisible();
  });

  test('отображается раздел категорий расходов', async ({ page }) => {
    await expect(page.getByText('Категория')).toBeVisible();
    await expect(page.getByText('Еда')).toBeVisible();
    await expect(page.getByText('Транспорт')).toBeVisible();
    await expect(page.getByText('Кафе')).toBeVisible();
  });

  test('отображается кнопка сохранения', async ({ page }) => {
    await expect(page.getByText('↓ Записать расход')).toBeVisible();
  });

  test('отображается кнопка "Надиктовать"', async ({ page }) => {
    await expect(page.getByText('Надиктовать')).toBeVisible();
  });

  test('нижняя навигация скрыта на этой странице', async ({ page }) => {
    // На AddTransactionPage нет BottomNav и FAB
    await expect(page.getByTestId('fab-add-transaction')).not.toBeVisible();
    await expect(page.getByText('Главная').first()).not.toBeVisible();
  });

  // ── Кнопки-пресеты сумм ───────────────────────────────────────────────────

  test('клик на пресет 500 подставляет сумму', async ({ page }) => {
    await page.getByRole('button', { name: '500' }).click();
    await expect(page.locator('input[type="number"]').first()).toHaveValue('500');
  });

  test('клик на пресет 1000 подставляет сумму', async ({ page }) => {
    await page.getByRole('button', { name: '1 000' }).click();
    await expect(page.locator('input[type="number"]').first()).toHaveValue('1000');
  });

  test('ручной ввод суммы работает', async ({ page }) => {
    const input = page.locator('input[type="number"]').first();
    await input.fill('1500');
    await expect(input).toHaveValue('1500');
  });

  // ── Валидация ─────────────────────────────────────────────────────────────

  test('кнопка сохранения неактивна без суммы и категории', async ({ page }) => {
    await expect(page.getByText('↓ Записать расход')).toBeDisabled();
  });

  test('кнопка сохранения неактивна если есть сумма, но нет категории', async ({ page }) => {
    await page.locator('input[type="number"]').first().fill('500');
    await expect(page.getByText('↓ Записать расход')).toBeDisabled();
  });

  test('кнопка сохранения неактивна если нет суммы, но есть категория', async ({ page }) => {
    await page.getByText('Еда').click();
    await expect(page.getByText('↓ Записать расход')).toBeDisabled();
  });

  test('кнопка сохранения активна при заполненных сумме и категории', async ({ page }) => {
    await page.locator('input[type="number"]').first().fill('500');
    await page.getByText('Еда').click();
    await expect(page.getByText('↓ Записать расход')).toBeEnabled();
  });

  // ── Переключение типа ─────────────────────────────────────────────────────

  test('переключение на "Доход" меняет текст кнопки сохранения', async ({ page }) => {
    await page.getByText('↑ Доход').click();
    await expect(page.getByText('↑ Записать доход')).toBeVisible();
    await expect(page.getByText('↓ Записать расход')).not.toBeVisible();
  });

  test('переключение на "Доход" показывает категории доходов', async ({ page }) => {
    await page.getByText('↑ Доход').click();
    await expect(page.getByText('Зарплата')).toBeVisible();
    await expect(page.getByText('Фриланс')).toBeVisible();
    await expect(page.getByText('Транспорт')).not.toBeVisible();
  });

  test('переключение назад на "Расход" восстанавливает категории', async ({ page }) => {
    await page.getByText('↑ Доход').click();
    await page.getByText('↓ Расход').click();
    await expect(page.getByText('Еда')).toBeVisible();
    await expect(page.getByText('Зарплата')).not.toBeVisible();
  });

  // ── Полный флоу добавления расхода ────────────────────────────────────────

  test('добавление расхода: заполнить и сохранить', async ({ page }) => {
    await page.locator('input[type="number"]').first().fill('750');
    await page.getByText('Кафе').click();
    await page.locator('input[placeholder="Комментарий (необязательно)"]').fill('Кофе с утра');

    await page.getByText('↓ Записать расход').click();

    // После сохранения возвращаемся на Dashboard
    await expect(page.getByTestId('fab-add-transaction')).toBeVisible();
  });

  test('добавление дохода: заполнить и сохранить', async ({ page }) => {
    await page.getByText('↑ Доход').click();
    await page.getByRole('button', { name: '1 000' }).click();
    await page.getByText('Зарплата').click();

    await page.getByText('↑ Записать доход').click();

    await expect(page.getByTestId('fab-add-transaction')).toBeVisible();
  });

  test('кнопка "←" возвращает на дашборд', async ({ page }) => {
    await page.locator('button').filter({ hasText: '←' }).click();
    await expect(page.getByTestId('fab-add-transaction')).toBeVisible();
  });

  // ── Голосовой ввод ────────────────────────────────────────────────────────

  test('кнопка "Надиктовать" открывает экран голосового ввода', async ({ page }) => {
    await page.getByText('Надиктовать').click();
    await expect(page.getByText('Голосовой ввод')).toBeVisible();
    await expect(page.getByText('Как использовать')).toBeVisible();
  });

  test('кнопка "←" в голосовом вводе возвращает на форму', async ({ page }) => {
    await page.getByText('Надиктовать').click();
    await expect(page.getByText('Голосовой ввод')).toBeVisible();
    await page.locator('button').filter({ hasText: '←' }).click();
    await expect(page.getByText('Новая операция')).toBeVisible();
  });

  test('примеры фраз заполняют поле ввода', async ({ page }) => {
    await page.getByText('Надиктовать').click();
    await page.getByText('«потратил 500 на кофе»').click();
    await expect(page.locator('textarea')).toHaveValue('потратил 500 на кофе');
  });
});
