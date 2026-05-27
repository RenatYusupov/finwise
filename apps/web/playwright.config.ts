import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['line']],
  // GitHub Pages медленнее локального сервера — даём 60с на каждый тест
  timeout: 60_000,

  use: {
    // Задеплоенный сайт на GitHub Pages
    baseURL: 'https://renatyusupov.github.io',
    // Эмулируем мобильный экран — именно так пользователь видит TMA
    viewport: { width: 390, height: 844 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    // Отключаем анимации framer-motion чтобы тесты не ждали их завершения
    reducedMotion: 'reduce',
    // Увеличенный таймаут навигации для GitHub Pages
    navigationTimeout: 60_000,
    actionTimeout: 30_000,
  },

  projects: [
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

});
