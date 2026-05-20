# TASK-006 — F-020: Реализация finance-service

**Статус:** 📝 Draft  
**Приоритет:** P0  
**Sprint:** 1 (недели 1–2)  
**RICE Score:** 270  
**Оценка усилий:** L (1–2 недели)  
**Зависимости:** TASK-005 (auth-service должен быть готов)

---

## 📋 ТЗ (Product Manager)

### Проблема пользователя

Все финансовые данные хранятся только в Telegram CloudStorage (лимит ~100KB, нет резервирования). При очистке данных Telegram или смене устройства пользователь теряет всю историю транзакций, бюджеты и цели.

**Это блокирует:** надёжное хранение данных, синхронизацию между устройствами, аналитику на сервере.

### User Story

> Как пользователь, я хочу чтобы мои транзакции, бюджеты и цели хранились на сервере, чтобы не потерять данные при переустановке Telegram или смене устройства.

### Функциональные требования

#### Транзакции
1. **GET /transactions** — список транзакций пользователя, параметры: `?from=YYYY-MM-DD&to=YYYY-MM-DD&category=&type=expense|income&limit=50&offset=0`
2. **POST /transactions** — создать транзакцию
3. **PUT /transactions/:id** — обновить транзакцию (только своя)
4. **DELETE /transactions/:id** — удалить транзакцию (только своя)
5. **POST /transactions/bulk** — массовое создание (для импорта из банка, до 500 транзакций)

#### Бюджеты
6. **GET /budgets** — список бюджетов пользователя
7. **POST /budgets** — создать бюджет
8. **PUT /budgets/:id** — обновить бюджет
9. **DELETE /budgets/:id** — удалить бюджет

#### Цели
10. **GET /goals** — список целей
11. **POST /goals** — создать цель
12. **PUT /goals/:id** — обновить цель (включая `currentAmount`)
13. **DELETE /goals/:id** — удалить цель

#### Регулярные платежи
14. **GET /recurring-payments** — список регулярных платежей
15. **POST /recurring-payments** — создать
16. **PUT /recurring-payments/:id** — обновить
17. **DELETE /recurring-payments/:id** — удалить

#### Синхронизация
18. **GET /sync** — возвращает все данные пользователя одним запросом (для первичной загрузки)
19. **POST /sync** — принимает полный snapshot данных (для первичной миграции из CloudStorage)

### Технический стек

- Fastify + TypeScript (уже настроен в `services/finance-service/`)
- Prisma + PostgreSQL (схема в `packages/db-schema/prisma/schema.prisma`)
- Аутентификация через JWT middleware из auth-service
- Порт: 3002 (см. `docker-compose.yml`)

### Файлы для изменения

- `services/finance-service/src/index.ts` — основная реализация
- `services/finance-service/package.json` — добавить `@prisma/client`
- `packages/db-schema/prisma/schema.prisma` — проверить/дополнить схему
- `apps/web/src/shared/api/client.ts` — добавить методы для работы с finance-service

### Структура данных (Prisma)

```prisma
model Transaction {
  id          String   @id @default(cuid())
  telegramId  BigInt
  amount      Float
  type        String   // "expense" | "income"
  category    String
  description String
  date        DateTime
  userCorrected Boolean @default(false)
  requiresUserInput Boolean @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Budget {
  id         String  @id @default(cuid())
  telegramId BigInt
  category   String
  limit      Float
  period     String  // "month"
  createdAt  DateTime @default(now())
}

model Goal {
  id            String  @id @default(cuid())
  telegramId    BigInt
  title         String
  targetAmount  Float
  currentAmount Float   @default(0)
  deadline      DateTime?
  categoryId    String?
  createdAt     DateTime @default(now())
}

model RecurringPayment {
  id          String  @id @default(cuid())
  telegramId  BigInt
  label       String
  amount      Float
  dayOfMonth  Int
  category    String
  active      Boolean @default(true)
  confidence  Float
  lastSeen    DateTime
  createdAt   DateTime @default(now())
}
```

### Acceptance Criteria

**AC-1:** Given аутентифицированный пользователь, When GET /transactions?from=2026-05-01&to=2026-05-31, Then возвращается список транзакций только этого пользователя за май

**AC-2:** Given POST /transactions с валидным телом, When запрос выполнен, Then транзакция сохранена в БД и возвращена с присвоенным `id`

**AC-3:** Given PUT /transactions/:id где id принадлежит другому пользователю, When запрос выполнен, Then возвращается 403 Forbidden

**AC-4:** Given POST /transactions/bulk с массивом из 500 транзакций, When запрос выполнен, Then все транзакции сохранены, время ответа < 2 секунды

**AC-5:** Given GET /sync, When запрос выполнен, Then возвращается объект `{ transactions, budgets, goals, recurringPayments }` — все данные пользователя

**AC-6:** Given POST /sync с полным snapshot, When запрос выполнен, Then данные сохранены (upsert по id), дубликаты не создаются

**AC-7:** Given запрос без Authorization header, When любой защищённый эндпоинт, Then возвращается 401

**AC-8:** Given GET /health, When запрос выполнен, Then `{ "status": "ok", "db": "connected" }` со статусом 200

### Edge Cases

- **Транзакция с будущей датой:** принимается (пользователь может планировать)
- **Отрицательная сумма:** 400 Bad Request
- **Bulk import с дубликатами:** upsert по `id`, не создавать дубликаты
- **Пользователь без транзакций:** GET /transactions возвращает `[]`, не 404
- **Очень большой диапазон дат:** лимит 1000 транзакций на запрос, пагинация обязательна

### Метрики успеха

- **Primary:** 100% новых транзакций сохраняются в БД (не только в CloudStorage)
- **Guardrail:** GET /transactions latency < 200ms (p95) для 1000 транзакций

### Явно вне скоупа

- Полнотекстовый поиск по транзакциям (TASK-013)
- Аналитические агрегации на сервере (Sprint 3)
- Мультивалютность
- Шифрование данных в БД (добавить в v2)

---

## 🔍 Валидация аналитика

_Секция заполняется аналитиком перед передачей в разработку_

- [ ] Проверить Prisma схему на соответствие типам в `packages/shared-types/src/index.ts`
- [ ] Убедиться что bulk import корректно обрабатывает `requiresUserInput` флаг
- [ ] Оценить объём данных: средний пользователь ~500 транзакций/год → индексы по `telegramId + date`

---

## 💻 Отчёт разработчика

_Секция заполняется разработчиком после реализации_

- [ ] Реализовано
- [ ] Тесты написаны
- [ ] git commit + git push выполнен

**Коммит:** _не заполнено_  
**Дата завершения:** _не заполнено_
