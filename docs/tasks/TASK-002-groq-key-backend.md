# TASK-002: Перенос API-ключа Groq на бэкенд (F-006)

**Статус:** 📝 Draft  
**Приоритет:** P0 (RICE: 1000 — наивысший в продукте)  
**Sprint:** 1  
**Создана:** 2026-05-19  
**Автор:** PM

---

## 📋 ТЗ (заполняет PM)

### Проблема

API-ключ Groq (`gsk_cRht0YjK6MMoLUHOJF0x...`) захардкожен в клиентском коде — виден в исходниках через DevTools любому пользователю. Это **критическая уязвимость безопасности**: любой может использовать ключ за счёт продукта, ключ может быть отозван Groq, что сломает AI-функции для всех пользователей.

### Решение

Все запросы к Groq идут через `ai-service` на бэкенде. Клиент не знает ключ — только отправляет запросы на `/api/ai/chat` и `/api/ai/categorize`.

### Затрагиваемые файлы

- `services/ai-service/src/index.ts` — реализовать реальный прокси вместо заглушки
- `apps/web/src/features/ai/groqParser.ts` — убрать прямые вызовы Groq API
- `apps/web/src/pages/ai-chat/AiChatPage.tsx` — переключить на `/api/ai/chat`
- `apps/web/src/pages/profile/bankImport.ts` — переключить категоризацию на `/api/ai/categorize`
- `apps/web/src/shared/api/client.ts` — добавить эндпоинты ai-service
- `.env.example` — добавить `GROQ_API_KEY`

### Acceptance Criteria

- [ ] AC-1: Клиент отправляет запрос на `POST /api/ai/chat` с `{message, history[], context}` — ключ Groq нигде в клиентском коде не присутствует
- [ ] AC-2: `ai-service` хранит ключ только в env-переменной `GROQ_API_KEY`, делает запрос к Groq и возвращает ответ клиенту
- [ ] AC-3: Rate limiting — не более 20 запросов/мин на userId (in-memory Map достаточно для v1)
- [ ] AC-4: Если `ai-service` недоступен (timeout 5s) → клиент автоматически использует `smartResponses.ts` как fallback
- [ ] AC-5: `POST /api/ai/categorize` принимает батч транзакций, возвращает категории — используется при импорте выписки
- [ ] AC-6: Поиск по кодовой базе не находит строку `gsk_` ни в одном файле, кроме `.env` и `.env.example`
- [ ] AC-7: AI-чат работает корректно end-to-end после переноса

### Метрики успеха

- **Primary**: ключ Groq отсутствует в клиентском коде (проверяется grep)
- **Guardrail**: AI response time < 3s (p95) — не должен вырасти после добавления прокси

---

## 🔍 Валидация аналитика (заполняет Analyst)

_Ожидает валидации_

---

## 💻 Отчёт разработчика (заполняет Developer)

_Ожидает реализации_
