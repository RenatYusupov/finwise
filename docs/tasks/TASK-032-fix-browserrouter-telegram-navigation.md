# TASK-032: Fix blank screen on tab navigation in Telegram WebView

**Статус:** ✅ Done
**Приоритет:** P0  
**Sprint:** hotfix  
**Создана:** 2026-05-21  
**Автор:** PM

---

## 📋 ТЗ (заполняет PM)

### Проблема

После TASK-031 главный экран открывается корректно, но **нажатие на любую вкладку BottomNav показывает пустой белый экран** в Telegram WebView (iOS и Android).

**Сценарий воспроизведения:**
1. Открыть FinWise в Telegram
2. Главный экран отображается ✅
3. Нажать на любую вкладку (Аналитика, AI, Регулярные, Профиль) → **пустой экран** ❌

**Корневая причина:**

`BrowserRouter` использует `window.history.pushState()` для клиентской навигации. Telegram WebView на iOS (и некоторых версиях Android) **перехватывает вызовы `pushState`** и инициирует реальный HTTP-запрос к новому URL.

Когда пользователь нажимает вкладку «Аналитика», происходит следующее:
1. `navigate('/analytics')` → `BrowserRouter` вызывает `history.pushState('/finwise/analytics')`
2. Telegram WebView перехватывает `pushState` → делает HTTP GET `https://renatYusupov.github.io/finwise/analytics`
3. GitHub Pages возвращает **404** (существует только `/finwise/index.html`, но не `/finwise/analytics`)
4. WebView рендерит пустую страницу или страницу ошибки

Трюк с `404.html` (TASK-025) работает только при **прямом переходе по URL** (первичная загрузка страницы), но не при `pushState`-навигации внутри уже загруженного WebView.

**Почему `HashRouter` не подходит** (TASK-026, TASK-030):
Telegram добавляет launch params в URL hash: `#tgWebAppData=...&tgWebAppVersion=...`. `HashRouter` интерпретирует этот hash как путь маршрута → blank screen при первом открытии.

**Решение:** использовать `MemoryRouter` в Telegram-контексте. `MemoryRouter` хранит историю навигации **в памяти** — никаких вызовов `pushState`, никаких изменений URL. Telegram WebView не получает сигнала для HTTP-запроса.

---

### Решение

Заменить `BrowserRouter` на **условный роутер** в [`apps/web/src/app/App.tsx`](apps/web/src/app/App.tsx):

- **В Telegram** (`IS_TELEGRAM === true`): использовать `MemoryRouter` с `initialEntries={['/']}` — навигация полностью in-memory, URL не меняется, WebView не делает HTTP-запросов.
- **В браузере** (`IS_TELEGRAM === false`): оставить `BrowserRouter` с `basename="/finwise"` — реальные URL, работает F5, прямые ссылки.

`IS_TELEGRAM` — модульная константа, замороженная в `main.tsx` до монтирования React (реализована в TASK-031). Она не меняется в течение сессии, поэтому условный выбор роутера безопасен.

**Изменение в `App.tsx`:**

```tsx
// БЫЛО:
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/finwise">
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

// СТАЛО:
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {IS_TELEGRAM ? (
        <MemoryRouter initialEntries={['/']} initialIndex={0}>
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </MemoryRouter>
      ) : (
        <BrowserRouter basename="/finwise">
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </BrowserRouter>
      )}
    </QueryClientProvider>
  );
}
```

**Импорт:** добавить `MemoryRouter` в импорт из `react-router-dom`.

**Важно:** `AppRoutes` не нужно менять — `useNavigate`, `useLocation`, `<Routes>`, `<Route>` работают одинаково с любым роутером. Пути в `navigate('/analytics')` остаются без изменений.

**Важно:** `onboarding redirect` в `AppRoutes` уже защищён флагом `IS_TELEGRAM` (TASK-031) — в Telegram редирект не происходит, поэтому `MemoryRouter` не вызовет конфликта.

---

### Затрагиваемые файлы

- [`apps/web/src/app/App.tsx`](apps/web/src/app/App.tsx) — заменить `BrowserRouter` на условный `MemoryRouter` / `BrowserRouter`

---

### Acceptance Criteria

- [ ] **AC-1:** В Telegram WebView (iOS) нажатие на вкладку «Аналитика» открывает страницу аналитики без blank screen
- [ ] **AC-2:** В Telegram WebView (iOS) нажатие на вкладки «AI», «Регулярные», «Профиль» открывает соответствующие страницы
- [ ] **AC-3:** В Telegram WebView навигация назад (кнопка Back в Telegram) работает корректно
- [ ] **AC-4:** В браузере (desktop/mobile) все вкладки по-прежнему работают через `BrowserRouter` с реальными URL
- [ ] **AC-5:** В браузере F5 на любой вкладке не даёт blank screen (404.html trick продолжает работать)
- [ ] **AC-6:** Главный экран в Telegram по-прежнему открывается корректно (регрессия TASK-031 не введена)
- [ ] **AC-7:** `IS_TELEGRAM` определяется корректно — `MemoryRouter` используется только в реальном Telegram WebView, не в обычном браузере

---

### Edge Cases

| Сценарий | Ожидаемое поведение |
|----------|---------------------|
| Пользователь открывает FinWise в Telegram Desktop | `IS_TELEGRAM = true` → `MemoryRouter` → навигация работает |
| Пользователь открывает FinWise в браузере (не Telegram) | `IS_TELEGRAM = false` → `BrowserRouter` → реальные URL |
| Пользователь открывает прямую ссылку `https://renatYusupov.github.io/finwise/analytics` в браузере | `BrowserRouter` + 404.html trick → корректная загрузка |
| Пользователь нажимает Back в Telegram после навигации | `MemoryRouter` поддерживает `history.back()` — работает корректно |
| `IS_TELEGRAM` ложно-положительный (браузер с `#tgWebApp` в URL) | `MemoryRouter` — навигация работает, URL не меняется (некритично) |
| `IS_TELEGRAM` ложно-отрицательный (Telegram без `TelegramWebviewProxy` и без hash) | `BrowserRouter` → возможен blank screen при навигации (крайне редкий случай, не блокирует) |
| Переход на `/goals/:id` (вложенный маршрут) в Telegram | `MemoryRouter` → `navigate('/goals/123')` → работает корректно |
| Onboarding в Telegram (если `onboardingCompleted = false`) | `IS_TELEGRAM = true` → onboarding redirect отключён → пользователь видит Dashboard |

---

### Метрики успеха

- **Primary:** 0 blank screen при навигации по вкладкам в Telegram WebView
- **Guardrail:** навигация в браузере не регрессирует (все вкладки работают, F5 работает)

---

### Явно вне скоупа

- Изменение `AppRoutes`, маршрутов, путей навигации — не нужно
- Изменение `vite.config.ts`, `sw.js`, `404.html` — не нужно
- Изменение `main.tsx` — не нужно (флаг `IS_TELEGRAM` уже корректен)
- Поддержка deep links в Telegram (открытие конкретной вкладки по URL) — отдельная задача

---

## 🔍 Валидация аналитика (заполняет Analyst)

**Статус валидации:** —

### Алгоритмическая корректность

> Задача не затрагивает алгоритмы финансовых расчётов. Валидация не требуется.

### Данные и метрики

> Нет изменений в хранилище данных или API.

### Замечания

> —

---

## 💻 Отчёт разработчика (заполняет Developer)

**Статус реализации:** ✅ Done
**Дата завершения:** 2026-05-21
**Коммит:** `404d6b3f`

### Что сделано

- [`apps/web/src/app/App.tsx:2`](apps/web/src/app/App.tsx) — добавлен `MemoryRouter` в импорт из `react-router-dom`
- [`apps/web/src/app/App.tsx:167-205`](apps/web/src/app/App.tsx) — функция `App()` заменена: вместо безусловного `BrowserRouter` используется условный рендер: `IS_TELEGRAM ? <MemoryRouter initialEntries={['/']}> : <BrowserRouter basename="/finwise">`. Добавлен подробный комментарий с объяснением причины и историей предыдущих попыток (HashRouter, BrowserRouter).
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — раздел «SPA Роутинг» полностью переписан: задокументирован dual-router паттерн, таблица сравнения роутеров, обновлён чеклист и правила.
- [`docs/tasks/TASK-032-fix-browserrouter-telegram-navigation.md`](docs/tasks/TASK-032-fix-browserrouter-telegram-navigation.md) — создана задача PM, заполнен отчёт разработчика.

### Что НЕ сделано (если есть)

- `AppRoutes`, маршруты, пути навигации — не изменялись (не требовалось)
- `vite.config.ts`, `sw.js`, `404.html`, `main.tsx` — не изменялись (не требовалось)

### Риски и известные ограничения

- **Deep links в Telegram**: при `MemoryRouter` URL не меняется, поэтому открыть конкретную вкладку по внешней ссылке невозможно. Это приемлемо — Telegram Mini Apps не поддерживают deep links через URL path в WebView.
- **`IS_TELEGRAM` ложно-отрицательный**: если Telegram WebView не инжектирует `TelegramWebviewProxy` и не добавляет `tgWebApp` в hash (крайне редкий случай), будет использован `BrowserRouter` → возможен blank screen при навигации. Не блокирует.
- **Back button в Telegram**: `MemoryRouter` поддерживает `history.back()` через React Router — работает корректно.

### Тестирование

1. Открыть FinWise в Telegram (iOS или Android)
2. Убедиться, что главный экран отображается
3. Нажать на вкладку «Аналитика» → должна открыться страница аналитики (не blank)
4. Нажать на вкладку «AI» → должна открыться страница чата
5. Нажать на вкладку «Регулярные» → должна открыться страница регулярных платежей
6. Нажать на вкладку «Профиль» → должна открыться страница профиля
7. Открыть FinWise в браузере → убедиться, что все вкладки работают
8. В браузере нажать F5 на вкладке «Аналитика» → страница должна загрузиться (не 404)
