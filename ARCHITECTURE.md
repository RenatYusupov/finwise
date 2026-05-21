# ARCHITECTURE.md — FinWise Technical Invariants

> Этот файл содержит архитектурные решения и инварианты проекта.
> **Developer обязан прочитать этот файл перед любой работой с `apps/web/`.**
> Нарушение инвариантов приводит к трудноотлаживаемым багам в production.

---

## 🌐 SPA Роутинг — три конфига, которые всегда должны быть согласованы

Приложение использует React Router v6 с `createBrowserRouter`. Три файла управляют роутингом и **должны быть изменены вместе**:

| Файл | Параметр | Текущее значение | Что делает |
|------|----------|-----------------|------------|
| [`apps/web/vite.config.ts`](apps/web/vite.config.ts) | `base` | `'/'` | Префикс URL для всех собранных assets (JS, CSS, images) |
| [`apps/web/src/app/App.tsx`](apps/web/src/app/App.tsx) | `basename` в `createBrowserRouter` | *(не задан — корень)* | Префикс, который React Router вырезает из `location.pathname` |
| [`apps/web/nginx.conf`](apps/web/nginx.conf) | `try_files` fallback | `try_files $uri $uri/ /index.html` | Какой `index.html` отдаётся при 404 (SPA fallback) |

### Правило: `vite base` = nginx serving path = router `basename`

Telegram Mini App открывается по `t.me/bot/appname` — URL всегда начинается с корня домена. Поэтому:
- `vite base: '/'` — assets на корне
- `basename` в router — **не задаётся** (по умолчанию `'/'`)
- nginx fallback — `/index.html`

### ⚠️ Симптом нарушения

Если `basename` в router не совпадает с реальным URL-путём приложения — **все вкладки кроме главной (`/`) будут пустыми**. Router не матчит маршруты, потому что ожидает другой префикс.

### Чеклист при любом изменении роутинга

- [ ] `vite.config.ts` → `base` обновлён?
- [ ] `App.tsx` → `basename` в `createBrowserRouter` согласован с `base`?
- [ ] `nginx.conf` → `try_files` fallback указывает на правильный `index.html`?
- [ ] Все 5 вкладок BottomNav работают после изменения?
- [ ] Обновление страницы (F5) на любой вкладке не даёт blank/404?

### Дополнительные правила

- `navigate('/analytics')` внутри router **не включает** basename — React Router добавляет его автоматически. Никогда не дублировать префикс вручную.
- `location.pathname` внутри router уже stripped от basename — использовать напрямую для `isActive`-проверок.

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
