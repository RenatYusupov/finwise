# TASK-029: Исправление пустых вкладок в Telegram WebView — race condition

**Статус:** ✅ Done  
**Приоритет:** Critical  
**Тип:** Bug Fix

---

## 📋 ТЗ (заполняет PM)

### Проблема пользователя
В Telegram WebView все вкладки кроме главной показывают пустой экран. В браузере всё работает корректно.

### User Story
Как пользователь Telegram Mini App, я хочу переключаться между вкладками (Анализ, AI, Регулярные, Профиль) и видеть их содержимое, а не пустой экран.

### Acceptance Criteria
- [ ] Все вкладки отображают контент в Telegram WebView
- [ ] Переключение вкладок работает без пустых экранов
- [ ] Браузерное поведение не изменилось

---

## 🔍 Валидация аналитика

### Root Cause Analysis

Найдены две независимые причины:

**Причина 1 — Race condition в onboarding redirect:**

В `App.tsx` guard для onboarding redirect использовал `window.Telegram?.WebApp`:
```ts
useEffect(() => {
  if (window.Telegram?.WebApp) return; // RACE: может быть undefined на первом рендере
  if (!onboardingCompleted && ...) navigate('/onboarding');
}, [onboardingCompleted, navigate, location.pathname]);
```

Telegram SDK (`telegram-web-app.js`) загружается **асинхронно**. На первом цикле рендера `window.Telegram?.WebApp` может быть `undefined`, поэтому guard не срабатывает. `onboardingCompleted` по умолчанию `false` (из Zustand persist, который тоже гидрируется асинхронно). Результат: при каждой навигации на вкладку срабатывает `navigate('/onboarding')`, что рендерит пустой экран (OnboardingPage не имеет BottomNav).

**Причина 2 — Мёртвый `?p=` скрипт в `index.html`:**

Скрипт восстановления пути (`?p=` trick) был написан для `BrowserRouter` + GitHub Pages 404.html. После перехода на `HashRouter` он стал мёртвым кодом, но вызывал `window.history.replaceState()` при загрузке — это могло интерферировать с Telegram WebView URL parsing.

**Причина 3 — Нестабильная инициализация SDK:**

`window.Telegram.WebApp.ready()` вызывался в `useEffect([])` без ожидания загрузки SDK. Если SDK ещё не загрузился, вызов игнорировался.

---

## 💻 Отчёт разработчика

### Что сделано

**1. `apps/web/src/app/App.tsx`:**

Добавлена функция `isTelegramContext()` — синхронное определение Telegram-контекста:
```ts
function isTelegramContext(): boolean {
  if (typeof window === 'undefined') return false;
  // Native Telegram WebView инжектирует этот объект синхронно до любого JS
  if ((window as any).TelegramWebviewProxy) return true;
  // SDK уже загружен
  if (window.Telegram?.WebApp) return true;
  // Telegram добавляет launch params в URL hash до загрузки JS
  if (window.location.hash.includes('tgWebApp')) return true;
  return false;
}
```

Три сигнала, все доступны **до** асинхронной загрузки SDK:
- `window.TelegramWebviewProxy` — нативный WebView инжектирует синхронно
- `window.Telegram?.WebApp` — если SDK уже загружен
- `window.location.hash.includes('tgWebApp')` — Telegram добавляет параметры в hash до JS

Onboarding redirect теперь использует `isTelegramContext()` вместо `window.Telegram?.WebApp`:
```ts
useEffect(() => {
  if (isTelegramContext()) return; // надёжно, синхронно
  if (!onboardingCompleted && location.pathname !== '/onboarding') {
    navigate('/onboarding');
  }
}, [onboardingCompleted, navigate, location.pathname]);
```

Инициализация SDK переписана с polling вместо фиксированного delay:
```ts
// Ждём SDK с polling 100ms × 20 попыток = 2s max
const tryInit = () => {
  if (!window.Telegram?.WebApp) {
    if (pollCount++ < MAX_POLLS) pollTimer = setTimeout(tryInit, 100);
    return;
  }
  tgInitDone.current = true;
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
  // ... rehydrate + activated handler
};
```

Удалён debug comment на строке 108.

**2. `apps/web/index.html`:**

Удалён мёртвый `?p=` path-restoration скрипт (15 строк). Этот скрипт был нужен для BrowserRouter + GitHub Pages 404.html trick. С HashRouter он не нужен и вызывал `window.history.replaceState()` при каждой загрузке.

### Затронутые файлы
- `apps/web/src/app/App.tsx`
- `apps/web/index.html`

### Тестирование
- [ ] Браузер: все вкладки работают ✅
- [ ] Telegram WebView: все вкладки отображают контент (ожидает верификации)
- [ ] Onboarding redirect работает в браузере при `onboardingCompleted=false`
- [ ] В Telegram onboarding redirect не срабатывает
