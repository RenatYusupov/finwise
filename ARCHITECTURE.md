# ARCHITECTURE.md — FinWise Technical Invariants

> Этот файл содержит архитектурные решения и инварианты проекта.
> **Developer обязан прочитать этот файл перед любой работой с `apps/web/`.**
> Нарушение инвариантов приводит к трудноотлаживаемым багам в production.

---

## 🌐 SPA Роутинг — HashRouter для GitHub Pages

Приложение хостится на **GitHub Pages** по адресу `https://<user>.github.io/finwise/`.
Используется **`HashRouter`** (React Router v6) — единственный надёжный способ SPA-роутинга на GitHub Pages без серверного конфига.

### Как работает HashRouter

URL выглядит как `https://.../finwise/#/analytics`. Всё после `#` — это hash, который браузер никогда не отправляет на сервер. GitHub Pages всегда отдаёт `index.html`, React Router читает hash и рендерит нужный компонент.

**Преимущества перед BrowserRouter на GitHub Pages:**
- Не нужен `basename`
- Не нужен `404.html` redirect trick
- Не нужен серверный `try_files` fallback
- Прямые URL и F5 работают без дополнительной конфигурации

### Текущий конфиг (3 файла в синхроне)

| Файл | Параметр | Текущее значение | Что делает |
|------|----------|-----------------|------------|
| [`apps/web/vite.config.ts`](apps/web/vite.config.ts) | `base` | `'/finwise/'` | Префикс URL для всех собранных assets (JS, CSS, images) |
| [`apps/web/src/main.tsx`](apps/web/src/main.tsx) | SW `register` path + `scope` | `'/finwise/sw.js'`, `scope: '/finwise/'` | Service Worker — путь и scope должны совпадать с `base` |
| [`apps/web/public/sw.js`](apps/web/public/sw.js) | `CACHE_NAME` | `'finwise-v1'` (deploy заменяет на timestamp) | При смене `base` — обязательно инкрементировать версию кэша |

### ⚠️ Симптомы нарушения

| Симптом | Причина |
|---------|---------|
| Приложение не открывается (blank screen) | `vite base` не совпадает с путём на хостинге — все assets 404 |
| SW не регистрируется | Путь SW не совпадает с `base` |
| Старые assets после деплоя | `CACHE_NAME` не инкрементирован |

### Чеклист при любом изменении роутинга

- [ ] `vite.config.ts` → `base` обновлён?
- [ ] `main.tsx` → SW path и scope совпадают с `base`?
- [ ] `sw.js` → `CACHE_NAME` инкрементирован?
- [ ] Все вкладки BottomNav работают после деплоя?
- [ ] F5 на любой вкладке не даёт blank?

### Дополнительные правила

- `navigate('/analytics')` — путь без `#`, React Router добавляет hash автоматически.
- `location.pathname` внутри router — путь после `#` (например `/analytics`), использовать напрямую для `isActive`-проверок.
- Deploy workflow (`.github/workflows/deploy.yml`) заменяет `finwise-v1` в `sw.js` на timestamp через `sed`. Не менять `CACHE_NAME` вручную на что-то кроме `finwise-v1`.
- **Никогда не переключаться обратно на `createBrowserRouter`** без настройки серверного SPA fallback.

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
