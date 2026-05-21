# ARCHITECTURE.md — FinWise Technical Invariants

> Этот файл содержит архитектурные решения и инварианты проекта.
> **Developer обязан прочитать этот файл перед любой работой с `apps/web/`.**
> Нарушение инвариантов приводит к трудноотлаживаемым багам в production.

---

## 🌐 SPA Роутинг — GitHub Pages конфиг (5 файлов всегда в синхроне)

Приложение хостится на **GitHub Pages** по адресу `https://<user>.github.io/finwise/`.
Это означает, что base path = `/finwise/`. Все 5 файлов ниже **должны быть изменены вместе**.

| Файл | Параметр | Текущее значение | Что делает |
|------|----------|-----------------|------------|
| [`apps/web/vite.config.ts`](apps/web/vite.config.ts) | `base` | `'/finwise/'` | Префикс URL для всех собранных assets (JS, CSS, images) |
| [`apps/web/src/app/App.tsx`](apps/web/src/app/App.tsx) | `basename` в `createBrowserRouter` | `'/finwise'` | Префикс, который React Router вырезает из `location.pathname` |
| [`apps/web/public/404.html`](apps/web/public/404.html) | redirect script | encodes path → `?p=` | GitHub Pages SPA fallback: 404 → index.html с закодированным путём |
| [`apps/web/src/main.tsx`](apps/web/src/main.tsx) | SW `register` path + `scope` | `'/finwise/sw.js'`, `scope: '/finwise/'` | Service Worker — путь и scope должны совпадать с `base` |
| [`apps/web/public/sw.js`](apps/web/public/sw.js) | `CACHE_NAME` | `'finwise-v1'` (deploy заменяет на timestamp) | При смене `base` — обязательно инкрементировать версию кэша |

### ⚠️ Почему именно такой конфиг

GitHub Pages **не имеет** `try_files` fallback (в отличие от nginx). При прямом переходе на
`https://<user>.github.io/finwise/analytics` GitHub Pages вернёт 404, потому что файла
`analytics/index.html` не существует.

**Решение — `404.html` trick:**
1. [`apps/web/public/404.html`](apps/web/public/404.html) кодирует путь в `?p=` и редиректит на `index.html`
2. [`apps/web/index.html`](apps/web/index.html) декодирует `?p=` и восстанавливает правильный `history` entry
3. React Router инициализируется уже с правильным pathname

### ⚠️ Симптомы нарушения

| Симптом | Причина |
|---------|---------|
| Все вкладки кроме главной — пустые | `basename` не совпадает с реальным URL-путём |
| Приложение не открывается (blank screen) | `vite base` не совпадает с путём на хостинге — все assets 404 |
| Прямой URL `/finwise/analytics` → 404 | Нет `404.html` или он не задеплоен |
| SW не регистрируется | Путь SW не совпадает с `base` |
| Старые assets после деплоя | `CACHE_NAME` не инкрементирован |

### Чеклист при любом изменении роутинга

- [ ] `vite.config.ts` → `base` обновлён?
- [ ] `App.tsx` → `basename` в `createBrowserRouter` = `base` без trailing slash?
- [ ] `main.tsx` → SW path и scope совпадают с `base`?
- [ ] `sw.js` → `CACHE_NAME` инкрементирован?
- [ ] `404.html` → slice index совпадает с глубиной пути (сейчас `slice(0, 2)` для `/finwise/`)?
- [ ] Все 5 вкладок BottomNav работают после деплоя?
- [ ] Обновление страницы (F5) на любой вкладке не даёт blank/404?

### Дополнительные правила

- `navigate('/analytics')` внутри router **не включает** basename — React Router добавляет его автоматически. Никогда не дублировать префикс вручную.
- `location.pathname` внутри router уже stripped от basename — использовать напрямую для `isActive`-проверок.
- Deploy workflow (`.github/workflows/deploy.yml`) заменяет `finwise-v1` в `sw.js` на timestamp через `sed`. Не менять `CACHE_NAME` вручную на что-то кроме `finwise-v1`.

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
