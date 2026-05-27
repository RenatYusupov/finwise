import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['line']],

  use: {
    // Vite отдаёт приложение на /finwise/ (base в vite.config.ts)
    baseURL: 'https://renatyusupov.github.io',
    // Эмулируем мобильный экран — именно так пользователь видит TMA
    viewport: { width: 390, height: 844 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    // Отключаем анимации framer-motion чтобы тесты не ждали их завершения
    reducedMotion: 'reduce',
  },

  projects: [
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

});
