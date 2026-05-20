# TASK-005 — F-019: Реализация auth-service

**Статус:** 📝 Draft  
**Приоритет:** P0  
**Sprint:** 1 (недели 1–2)  
**RICE Score:** 270  
**Оценка усилий:** M (3–5 дней)

---

## 📋 ТЗ (Product Manager)

### Проблема пользователя

Сейчас приложение работает полностью на клиенте без серверной аутентификации. Это означает:
1. Данные хранятся только в Telegram CloudStorage — нет резервной копии на сервере
2. Нет возможности синхронизировать данные между устройствами
3. Нет защиты API-эндпоинтов от несанкционированного доступа

**Это блокирует:** TASK-006 (finance-service), TASK-007 (ai-service), TASK-009 (notification-service) — все бэкенд-сервисы требуют аутентификации.

### User Story

> Как система, я хочу верифицировать Telegram-пользователя через `initData` и выдавать JWT-токен, чтобы все последующие API-запросы были аутентифицированы и привязаны к конкретному пользователю.

### Функциональные требования

1. **POST /auth/telegram** — принимает `{ initData: string }`, валидирует HMAC-SHA256 подпись, возвращает `{ token: string, expiresIn: number, user: { telegramId, firstName, lastName, username } }`
2. **HMAC-SHA256 валидация** по алгоритму Telegram: `HMAC_SHA256(secret_key, data_check_string)` где `secret_key = HMAC_SHA256("WebAppData", bot_token)`
3. **JWT токен:** payload `{ sub: telegramId, iat, exp }`, срок действия 7 дней, подписан `JWT_SECRET`
4. **GET /auth/me** — защищённый эндпоинт, возвращает данные текущего пользователя по токену
5. **Middleware `authenticate`** — экспортируется для использования в других сервисах через shared package или копирование
6. **Переменные окружения:** `BOT_TOKEN`, `JWT_SECRET` (обязательные, сервис не стартует без них)
7. **Health check:** GET /health → `{ status: "ok", service: "auth-service" }`

### Технический стек

- Fastify + TypeScript (уже настроен в `services/auth-service/`)
- `@fastify/jwt` для JWT
- Нет внешней БД — пользователи идентифицируются только по `telegramId`
- Порт: 3001 (см. `docker-compose.yml`)

### Файлы для изменения

- `services/auth-service/src/index.ts` — основная реализация (сейчас заглушка)
- `services/auth-service/package.json` — добавить зависимости `@fastify/jwt`, `@fastify/cors`
- `.env.example` — добавить `BOT_TOKEN`, `JWT_SECRET`

### API-контракт

```
POST /auth/telegram
Body: { "initData": "query_id=...&user=...&hash=..." }
Response 200: { "token": "eyJ...", "expiresIn": 604800, "user": { "telegramId": 123456, "firstName": "Алексей" } }
Response 401: { "error": "Invalid initData signature" }
Response 400: { "error": "initData expired" } // если auth_date > 24h

GET /auth/me
Header: Authorization: Bearer <token>
Response 200: { "telegramId": 123456, "firstName": "Алексей", "username": "alex" }
Response 401: { "error": "Unauthorized" }
```

### Acceptance Criteria

**AC-1:** Given валидный `initData` от Telegram WebApp, When POST /auth/telegram, Then возвращается JWT токен со статусом 200

**AC-2:** Given невалидный `initData` (подпись не совпадает), When POST /auth/telegram, Then возвращается 401 с `{ "error": "Invalid initData signature" }`

**AC-3:** Given `initData` с `auth_date` старше 24 часов, When POST /auth/telegram, Then возвращается 400 с `{ "error": "initData expired" }`

**AC-4:** Given валидный JWT токен, When GET /auth/me, Then возвращаются данные пользователя

**AC-5:** Given истёкший или невалидный JWT, When GET /auth/me, Then возвращается 401

**AC-6:** Given отсутствующие переменные окружения `BOT_TOKEN` или `JWT_SECRET`, When сервис стартует, Then процесс завершается с ошибкой и понятным сообщением в логах

**AC-7:** Given запущенный сервис, When GET /health, Then возвращается `{ "status": "ok" }` со статусом 200

**AC-8:** Given CORS настройки, When запрос с домена Telegram Mini App, Then CORS заголовки присутствуют в ответе

### Edge Cases

- **Пустой `initData`:** 400 Bad Request
- **`initData` без поля `user`:** 400 Bad Request
- **Очень длинный `initData` (>10KB):** 413 Payload Too Large
- **Concurrent requests:** сервис должен обрабатывать ≥100 RPS без деградации

### Метрики успеха

- **Primary:** 100% запросов к finance-service и ai-service проходят через auth middleware
- **Guardrail:** latency POST /auth/telegram < 100ms (p95)

### Явно вне скоупа

- OAuth через другие провайдеры (Google, Apple)
- Refresh tokens (достаточно 7-дневного JWT)
- Rate limiting (добавить в Sprint 2)
- Хранение пользователей в БД (только in-memory идентификация по telegramId)

---

## 🔍 Валидация аналитика

_Секция заполняется аналитиком перед передачей в разработку_

- [ ] Проверить алгоритм HMAC-SHA256 валидации по официальной документации Telegram
- [ ] Убедиться что `auth_date` проверка (24h) не блокирует dev-тестирование

---

## 💻 Отчёт разработчика

_Секция заполняется разработчиком после реализации_

- [ ] Реализовано
- [ ] Тесты написаны
- [ ] git commit + git push выполнен

**Коммит:** _не заполнено_  
**Дата завершения:** _не заполнено_
