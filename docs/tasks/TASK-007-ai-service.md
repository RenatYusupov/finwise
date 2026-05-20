# TASK-007 — F-021: Реализация ai-service

**Статус:** 📝 Draft  
**Приоритет:** P1  
**Sprint:** 1 (недели 1–2)  
**RICE Score:** 320  
**Оценка усилий:** M (3–5 дней)  
**Зависимости:** TASK-005 (auth-service), TASK-002 (Groq key на бэкенде)

---

## 📋 ТЗ (Product Manager)

### Проблема пользователя

Groq API-ключ сейчас захардкожен в клиентском коде (TASK-002 переносит его на бэкенд). ai-service — это бэкенд-прокси, который:
1. Хранит API-ключ безопасно на сервере
2. Добавляет контекст пользователя к каждому запросу (история транзакций, бюджеты)
3. Кэширует результаты категоризации для снижения затрат на API
4. Предоставляет единый интерфейс для всех AI-функций приложения

### User Story

> Как система, я хочу проксировать все AI-запросы через защищённый бэкенд-сервис, чтобы API-ключ не был доступен клиенту, а запросы обогащались финансовым контекстом пользователя.

### Функциональные требования

#### Категоризация транзакций
1. **POST /ai/categorize** — принимает `{ description: string, amount: number, type: "expense"|"income" }`, возвращает `{ category: string, confidence: number, reasoning?: string }`
2. **POST /ai/categorize/bulk** — массовая категоризация до 50 транзакций за раз
3. **Кэширование:** результаты категоризации кэшируются по ключу `hash(description + type)` на 24 часа (in-memory Map)

#### AI-чат
4. **POST /ai/chat** — принимает `{ messages: AiMessage[], context?: FinancialContext }`, возвращает `{ reply: string }`
5. **FinancialContext** включает: `{ monthlyBudget, spentThisMonth, safeToSpend, topCategories, recentTransactions (last 10) }`
6. **Системный промпт** формируется на сервере с финансовым контекстом пользователя

#### Инсайты
7. **GET /ai/insights** — возвращает 3 персонализированных инсайта на основе транзакций пользователя за последние 30 дней
8. **Инсайты кэшируются** на 6 часов per user

#### Общее
9. **Модель:** `llama-3.1-8b-instant` через Groq API
10. **Таймаут:** 10 секунд на запрос к Groq, после — 504 Gateway Timeout
11. **Rate limiting:** 10 запросов/минуту на пользователя
12. **Переменные окружения:** `GROQ_API_KEY`, `JWT_SECRET` (обязательные)

### Технический стек

- Fastify + TypeScript (уже настроен в `services/ai-service/`)
- Groq SDK (`groq-sdk`)
- Аутентификация через JWT middleware
- Порт: 3003 (см. `docker-compose.yml`)

### Файлы для изменения

- `services/ai-service/src/index.ts` — основная реализация
- `services/ai-service/package.json` — добавить `groq-sdk`
- `apps/web/src/features/ai/groqParser.ts` — обновить для работы с бэкендом (после TASK-002)
- `apps/web/src/pages/ai-chat/AiChatPage.tsx` — переключить на `/ai/chat` эндпоинт

### API-контракт

```
POST /ai/categorize
Auth: Bearer <token>
Body: { "description": "Пятёрочка", "amount": 1500, "type": "expense" }
Response 200: { "category": "groceries", "confidence": 0.95 }
Response 429: { "error": "Rate limit exceeded" }

POST /ai/chat
Auth: Bearer <token>
Body: {
  "messages": [{ "role": "user", "content": "Сколько я потратил на еду?" }],
  "context": { "monthlyBudget": 50000, "spentThisMonth": 32000, "safeToSpend": 1200 }
}
Response 200: { "reply": "За этот месяц вы потратили 8 500 ₽ на продукты..." }

GET /ai/insights
Auth: Bearer <token>
Response 200: {
  "insights": [
    { "type": "warning", "text": "Расходы на кафе выросли на 40% по сравнению с прошлым месяцем" },
    { "type": "tip", "text": "Вы тратите больше всего по пятницам — 23% недельного бюджета" }
  ],
  "generatedAt": "2026-05-19T10:00:00Z"
}
```

### Acceptance Criteria

**AC-1:** Given POST /ai/categorize с описанием "Пятёрочка", When запрос выполнен, Then возвращается `{ "category": "groceries", "confidence": >= 0.7 }`

**AC-2:** Given одинаковый запрос категоризации дважды, When второй запрос выполнен, Then ответ возвращается из кэша (без обращения к Groq API), latency < 10ms

**AC-3:** Given POST /ai/chat с контекстом пользователя, When запрос выполнен, Then ответ содержит персонализированную информацию (упоминает конкретные суммы из контекста)

**AC-4:** Given пользователь превысил 10 запросов/минуту, When следующий запрос, Then возвращается 429 с `{ "error": "Rate limit exceeded", "retryAfter": 60 }`

**AC-5:** Given Groq API недоступен (таймаут), When POST /ai/chat, Then возвращается 504 с `{ "error": "AI service timeout" }` через 10 секунд

**AC-6:** Given запрос без Authorization header, When любой эндпоинт, Then возвращается 401

**AC-7:** Given GET /ai/insights, When запрос выполнен, Then возвращается массив из 1–5 инсайтов, каждый с полями `type` и `text`

**AC-8:** Given `GROQ_API_KEY` не задан, When сервис стартует, Then процесс завершается с ошибкой в логах

### Edge Cases

- **Пустое описание транзакции:** возвращает `{ "category": "other", "confidence": 0.1 }`
- **Очень длинный чат (>50 сообщений):** берутся последние 20 сообщений + системный промпт
- **Groq вернул невалидный JSON:** fallback на `{ "category": "other", "confidence": 0 }`
- **Bulk categorize с 0 транзакциями:** возвращает `[]`

### Метрики успеха

- **Primary:** % транзакций с confidence ≥ 0.7 ≥ 80% (vs текущих ~60% без суммы в промпте)
- **Guardrail:** стоимость Groq API < $5/месяц при 1000 активных пользователях (кэширование критично)

### Явно вне скоупа

- Streaming ответов от Groq (добавить в Sprint 3)
- Fine-tuning модели на данных пользователей
- Поддержка других AI-провайдеров (OpenAI, Anthropic)
- Персистентное кэширование в Redis (достаточно in-memory для MVP)

---

## 🔍 Валидация аналитика

_Секция заполняется аналитиком перед передачей в разработку_

- [ ] Проверить промпт для категоризации (ALG-002, Изменение 2): сумма должна быть в payload
- [ ] Оценить hit rate кэша: при 500 транзакциях/пользователь ~70% попаданий ожидается
- [ ] Проверить что системный промпт для чата включает все необходимые финансовые данные

---

## 💻 Отчёт разработчика

_Секция заполняется разработчиком после реализации_

- [ ] Реализовано
- [ ] Тесты написаны
- [ ] git commit + git push выполнен

**Коммит:** _не заполнено_  
**Дата завершения:** _не заполнено_
