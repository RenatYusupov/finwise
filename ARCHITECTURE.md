# ARCHITECTURE.md — FinWise Technical Invariants

> Этот файл содержит архитектурные решения и инварианты проекта.
> **Developer обязан прочитать этот файл перед любой работой с `apps/web/`.**
> Нарушение инвариантов приводит к трудноотлаживаемым багам в production.

---

## 🌐 SPA Роутинг — двойной роутер (MemoryRouter в Telegram, BrowserRouter в браузере)

Приложение хостится на **GitHub Pages** по адресу `https://renatYusupov.github.io/finwise/`.

### Почему двойной роутер

Ни один из стандартных роутеров не работает одновременно в Telegram WebView и в браузере:

| Роутер | Проблема в Telegram | Проблема в браузере |
|--------|--------------------|--------------------|
| `HashRouter` | Telegram добавляет launch params в hash (`#tgWebAppData=...`) → HashRouter читает их как путь маршрута → blank screen при открытии | — |
| `BrowserRouter` | `pushState('/finwise/analytics')` перехватывается Telegram WebView → реальный HTTP GET → GitHub Pages 404 → blank screen при навигации | Работает корректно |
| `MemoryRouter` | Работает корректно — нет вызовов `pushState`, нет изменений URL | F5 всегда возвращает на `/` — нет прямых ссылок |

**Решение (TASK-032):** использовать `IS_TELEGRAM` (модульная константа, замороженная в `main.tsx` до монтирования React) для выбора роутера:
- `IS_TELEGRAM === true` → `MemoryRouter` — навигация in-memory, URL не меняется
- `IS_TELEGRAM === false` → `BrowserRouter` с `basename="/finwise"` — реальные URL, работает F5

### Текущий конфиг роутера ([`apps/web/src/app/App.tsx`](apps/web/src/app/App.tsx))

```tsx
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {IS_TELEGRAM ? (
        <MemoryRouter initialEntries={['/']} initialIndex={0}>
          <ErrorBoundary><AppRoutes /></ErrorBoundary>
        </MemoryRouter>
      ) : (
        <BrowserRouter basename="/finwise">
          <ErrorBoundary><AppRoutes /></ErrorBoundary>
        </BrowserRouter>
      )}
    </QueryClientProvider>
  );
}
```

### Текущий конфиг (3 файла в синхроне)

| Файл | Параметр | Текущее значение | Что делает |
|------|----------|-----------------|------------|
| [`apps/web/vite.config.ts`](apps/web/vite.config.ts) | `base` | `'/finwise/'` | Префикс URL для всех собранных assets (JS, CSS, images) |
| [`apps/web/src/main.tsx`](apps/web/src/main.tsx) | SW `register` path + `scope` | `'/finwise/sw.js'`, `scope: '/finwise/'` | Service Worker — путь и scope должны совпадать с `base` |
| [`apps/web/public/sw.js`](apps/web/public/sw.js) | `CACHE_NAME` | `'finwise-v1'` (deploy заменяет на timestamp) | При смене `base` — обязательно инкрементировать версию кэша |

### ⚠️ Симптомы нарушения

| Симптом | Причина |
|---------|---------|
| Blank screen при открытии в Telegram | `IS_TELEGRAM` не определён или `HashRouter` используется вместо `MemoryRouter` |
| Blank screen при навигации по вкладкам в Telegram | `BrowserRouter` используется в Telegram — `pushState` перехватывается WebView |
| Blank screen при открытии в браузере | `vite base` не совпадает с путём на хостинге — все assets 404 |
| SW не регистрируется | Путь SW не совпадает с `base` |
| Старые assets после деплоя | `CACHE_NAME` не инкрементирован |

### Чеклист при любом изменении роутинга

- [ ] `App.tsx` → `IS_TELEGRAM` используется для выбора роутера?
- [ ] `main.tsx` → `window.__isTelegram` устанавливается синхронно до `ReactDOM.render`?
- [ ] `vite.config.ts` → `base` обновлён?
- [ ] `main.tsx` → SW path и scope совпадают с `base`?
- [ ] `sw.js` → `CACHE_NAME` инкрементирован?
- [ ] Все вкладки BottomNav работают в Telegram после деплоя?
- [ ] Все вкладки BottomNav работают в браузере после деплоя?
- [ ] F5 на любой вкладке в браузере не даёт blank?

### Дополнительные правила

- `navigate('/analytics')` — путь без `#`, работает одинаково с `MemoryRouter` и `BrowserRouter`.
- `location.pathname` внутри router — путь (например `/analytics`), использовать напрямую для `isActive`-проверок.
- Deploy workflow (`.github/workflows/deploy.yml`) заменяет `finwise-v1` в `sw.js` на timestamp через `sed`. Не менять `CACHE_NAME` вручную на что-то кроме `finwise-v1`.
- **Никогда не использовать `HashRouter`** — конфликтует с Telegram launch params в URL hash.
- **Никогда не использовать только `BrowserRouter` без условия `IS_TELEGRAM`** — `pushState` перехватывается Telegram WebView.
- **`IS_TELEGRAM` определяется в `main.tsx`** через `TelegramWebviewProxy` (синхронный сигнал от нативного WebView) и `window.location.hash.includes('tgWebApp')`. Не переопределять в других местах.

---

## 📦 Zustand + CloudStorage — гибридный persist

Данные хранятся в двух слоях:
- **`localStorage`** — основной, низкая латентность, синхронный
- **Telegram CloudStorage`** — облачный backup, асинхронный, max 4096 байт/ключ

Запись в CloudStorage использует **chunked pattern с commit-маркером** (см. [`store.ts`](apps/web/src/features/finance/store.ts)):
- Данные пишутся чанками по 3500 байт
- Последним пишется ключ-счётчик (`_count`) — это commit-маркер
- При чтении: если `_count` отсутствует — данные не читаются (незавершённая запись)

**Правило:** никогда не менять порядок записи — сначала данные, потом `_count`.

---

## 🔐 Auth — JWT через Telegram initData

- [`services/auth-service`](services/auth-service/src/index.ts) валидирует `initData` через HMAC-SHA-256
- JWT выдаётся на 7 дней, хранится в `localStorage`
- [`apps/web/src/shared/api/client.ts`](apps/web/src/shared/api/client.ts) — axios interceptor добавляет `Authorization: Bearer <token>` к каждому запросу
- `telegramId` — основной идентификатор пользователя во всех сервисах (bigint в Prisma, string в JWT)

---

## 🗄️ Prisma модели — именование

Все финансовые модели имеют префикс `Fin`:
- `FinTransaction`, `FinBudget`, `FinGoal`, `FinRecurringPayment`
- Связь с пользователем — через `telegramId: BigInt`

---

## 🏗️ Микросервисы — внутренняя аутентификация

Сервис-к-сервису запросы (например, `finance-service` → `notification-service`) используют заголовок:
```
Authorization: Bearer <INTERNAL_SECRET>
```
где `INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? 'finwise-internal'`.

Никогда не использовать `INTERNAL_SECRET` в клиентском коде.
