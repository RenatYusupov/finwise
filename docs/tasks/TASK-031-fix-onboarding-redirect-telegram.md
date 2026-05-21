# TASK-031: Исправление onboarding redirect в Telegram — вкладки показывают пустой экран

**Статус:** ✅ Done
**Приоритет:** P0 (Critical — все вкладки кроме главной пустые в Telegram)  
**Создана:** 2026-05-21  
**Автор:** PM

---

## 📋 ТЗ (заполняет PM)

### Проблема

После TASK-030 главный экран открывается в Telegram, но все остальные вкладки (Анализ, AI, Регулярные, Профиль) показывают пустой экран.

**Корневая причина:** В [`AppRoutes`](apps/web/src/app/App.tsx) есть onboarding redirect:

```ts
useEffect(() => {
  if (isTelegramContext()) return; // guard
  if (!onboardingCompleted && location.pathname !== '/onboarding') {
    navigate('/onboarding');
  }
}, [onboardingCompleted, navigate, location.pathname]);
```

`isTelegramContext()` использует три сигнала:
1. `window.TelegramWebviewProxy` — есть только на нативных iOS/Android
2. `window.Telegram?.WebApp` — SDK загружается асинхронно, может быть `undefined`
3. `window.location.hash.includes('tgWebApp')` — с `BrowserRouter` hash пустой при навигации

При навигации на вкладку `/analytics`:
- `location.pathname` меняется → эффект перезапускается
- `isTelegramContext()` может вернуть `false` (SDK ещё не загружен, hash пустой)
- `onboardingCompleted = false` (Zustand persist не гидрирован или Telegram не сохраняет localStorage)
- Результат: `navigate('/onboarding')` → пустой экран

**Почему главная работает:** При первом открытии `location.pathname = '/'` — эффект не срабатывает (уже на главной). При навигации на другую вкладку — срабатывает.

### Решение

**Вариант A (рекомендуемый): Убрать onboarding redirect полностью из Telegram**

Использовать `isTelegramContext()` как **постоянный флаг**, вычисленный один раз при загрузке страницы (до React), а не при каждом рендере. Сохранить результат в `window.__isTelegram` синхронно в `index.html` или `main.tsx`.

```ts
// В main.tsx, до ReactDOM.render — синхронно, один раз:
const IS_TELEGRAM = !!(
  (window as any).TelegramWebviewProxy ||
  window.Telegram?.WebApp ||
  window.location.hash.includes('tgWebApp')
);
(window as any).__isTelegram = IS_TELEGRAM;
```

Затем в `App.tsx`:
```ts
const isTg = (window as any).__isTelegram === true;
useEffect(() => {
  if (isTg) return;
  if (!onboardingCompleted && location.pathname !== '/onboarding') {
    navigate('/onboarding');
  }
}, [onboardingCompleted, navigate, location.pathname]);
```

**Вариант B: Установить `onboardingCompleted = true` при первом открытии в Telegram**

В Telegram онбординг не нужен — пользователь уже авторизован через Telegram. При обнаружении Telegram-контекста принудительно установить `onboardingCompleted = true` в Zustand store.

**Вариант A предпочтительнее** — он не меняет бизнес-логику онбординга, только исправляет guard.

### Затрагиваемые файлы

- `apps/web/src/main.tsx` — добавить синхронное вычисление `window.__isTelegram` до `ReactDOM.render`
- `apps/web/src/app/App.tsx` — использовать `window.__isTelegram` вместо `isTelegramContext()` в onboarding effect

### Acceptance Criteria

- [ ] AC-1: Все вкладки (Анализ, AI, Регулярные, Профиль) отображают контент в Telegram WebView
- [ ] AC-2: Главный экран продолжает работать в Telegram
- [ ] AC-3: Onboarding redirect работает в браузере при `onboardingCompleted=false`
- [ ] AC-4: В Telegram onboarding redirect никогда не срабатывает, независимо от состояния `onboardingCompleted`

### Edge Cases

- Telegram Desktop (tdesktop) — `TelegramWebviewProxy` может отсутствовать, но `window.Telegram?.WebApp` доступен синхронно
- Telegram iOS — `TelegramWebviewProxy` есть, SDK загружается чуть позже
- Telegram Android — аналогично iOS
- Браузер с `?tgWebApp` в URL — не должен ложно определяться как Telegram

---

## 🔍 Валидация аналитика (заполняет Analyst)

**Статус валидации:** ✅ Одобрено (реализован Вариант A — frozen flag)

---

## 💻 Отчёт разработчика (заполняет Developer)

**Статус реализации:** ✅ Done
**Дата завершения:** 2026-05-21
**Коммит:** см. git log

### Что сделано

- `apps/web/src/main.tsx` — добавлено синхронное вычисление `window.__isTelegram` до `ReactDOM.render`. Использует `TelegramWebviewProxy` (нативный WebView) и `window.location.hash.includes('tgWebApp')` (URL params). Результат заморожен на всю сессию.

- `apps/web/src/app/App.tsx` — заменена функция `isTelegramContext()` на модульную константу `IS_TELEGRAM`, которая читает `window.__isTelegram` один раз при загрузке модуля. Onboarding redirect теперь использует `IS_TELEGRAM` — значение никогда не меняется в течение сессии, race condition невозможен.

### Тестирование

1. Открыть Mini App в Telegram → нажать "Анализ" → должен показаться экран аналитики
2. Нажать "AI" → должен показаться AI-чат
3. Нажать "Регулярные" → должен показаться экран регулярных платежей
4. Нажать "Профиль" → должен показаться профиль
5. Открыть в браузере без `onboardingCompleted` → должен редиректить на `/onboarding`
