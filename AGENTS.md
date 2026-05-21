# AGENTS.md — FinWise Project Rules
> Этот файл читается автоматически всеми агентами. Следуй правилам без исключений.

---

## 📁 Структура проекта

```
finwise/
├── AGENTS.md              ← этот файл, не изменять
├── README.md              ← публичное описание
├── PRODUCT_SPEC.md        ← источник правды по продукту и фичам
├── ALGORITHM_SPEC.md      ← спецификация алгоритмов (ALG-001–ALG-004)
├── ARCHITECTURE.md        ← архитектурные инварианты (роутинг, storage, auth, сервисы)
├── docs/
│   ├── analysis/          ← аналитические артефакты, JSON-результаты
│   └── tasks/             ← задачи: ТЗ от PM, валидация аналитика, отчёт разработчика
│       ├── TASK-TEMPLATE.md   ← шаблон для новых задач
│       └── TASK-NNN-*.md      ← конкретные задачи (NNN = порядковый номер)
├── scripts/               ← все .py, .mjs, .sh скрипты
├── apps/
│   ├── web/               ← React TMA (основной фронтенд)
│   └── bot/               ← Telegram Bot companion
├── services/              ← Fastify микросервисы
├── packages/
│   ├── shared-types/      ← общие TypeScript типы
│   └── db-schema/         ← Prisma schema
```

---

## 🚫 Правила для всех агентов

1. Никаких новых файлов в корне — только README.md, AGENTS.md, PRODUCT_SPEC.md, ALGORITHM_SPEC.md и конфиги
2. Скрипты (.py, .mjs, .sh) → только в `scripts/`
3. Аналитические артефакты (JSON, временные заметки) → только в `docs/analysis/`
4. Задачи (ТЗ, валидация, отчёты) → только в `docs/tasks/`
5. Не дублировать спецификации — один источник правды: PRODUCT_SPEC.md и ALGORITHM_SPEC.md
6. Перед началом работы прочитать PRODUCT_SPEC.md и ALGORITHM_SPEC.md

---

## 👥 Роли и зоны ответственности

### 🎯 Product Manager
- **Читает:** AGENTS.md, PRODUCT_SPEC.md, docs/tasks/
- **Пишет:** только PRODUCT_SPEC.md + создаёт новые задачи в docs/tasks/ (заполняет секции "ТЗ" и "Acceptance Criteria")
- **Не трогает:** код, ALGORITHM_SPEC.md, apps/, services/

### 📊 Analyst
- **Читает:** AGENTS.md, PRODUCT_SPEC.md, ALGORITHM_SPEC.md, docs/tasks/
- **Пишет:** ALGORITHM_SPEC.md, docs/analysis/, scripts/ + заполняет секцию "Валидация аналитика" в задаче
- **Не трогает:** apps/, services/, PRODUCT_SPEC.md

### 💻 Developer
- **Читает:** AGENTS.md, PRODUCT_SPEC.md, ALGORITHM_SPEC.md, **ARCHITECTURE.md** — обязательно перед реализацией
- **Читает задачу:** docs/tasks/TASK-NNN-*.md — перед началом работы
- **Пишет:** apps/, services/, packages/ + заполняет секцию "Отчёт разработчика" в задаче
- **Не трогает:** PRODUCT_SPEC.md, ALGORITHM_SPEC.md
- **После реализации:** git commit + git push (обязательно, см. Git Workflow)

---

## 🔄 Workflow

```
PM создаёт docs/tasks/TASK-NNN-*.md (заполняет ТЗ + Acceptance Criteria)
        ↓
Analyst читает задачу → валидирует алгоритмы → заполняет "Валидация аналитика"
        ↓
Developer читает задачу + оба spec → реализует → заполняет "Отчёт разработчика"
        ↓
Developer делает git commit + git push
        ↓
PM/Analyst проверяют статус задачи
```

---

## 🤖 Обязательные скиллы для Developer

### telegram-mini-app скилл
**Загружать ВСЕГДА** при любой работе с кодом в `apps/web/` или `apps/bot/`.
Это Telegram Mini App — скилл содержит критические паттерны для:
- Telegram WebApp SDK (CloudStorage, HapticFeedback, initData)
- Zustand persist с гибридным localStorage/CloudStorage
- Uncontrolled inputs в Telegram WebView
- Safe-area insets и keyboard-aware layouts
- Groq AI интеграция с 3-стратегийным JSON-парсером
- Fastify микросервисы с @fastify/http-proxy

**Правило:** если задача затрагивает `apps/web/**` или `apps/bot/**` — загрузить скилл `telegram-mini-app` перед началом работы.

---

## 🔀 Git Workflow (обязательно для Developer)

После каждой завершённой задачи Developer обязан:

```bash
# 1. Проверить изменённые файлы
git status

# 2. Добавить изменённые файлы
git add <изменённые файлы>

# 3. Сделать коммит с номером задачи
git commit -m "feat(TASK-NNN): краткое описание изменений"

# 4. Запушить
git push
```

**Формат commit message:**
- `feat(TASK-NNN): описание` — новая функциональность
- `fix(TASK-NNN): описание` — исправление бага
- `refactor(TASK-NNN): описание` — рефакторинг без изменения поведения

**Правило:** задача считается завершённой только после успешного `git push`. Статус в docs/tasks/ обновляется на `✅ Done` только после пуша.

---

## 📋 Система задач (docs/tasks/)

Каждая задача — отдельный файл `docs/tasks/TASK-NNN-slug.md`.

**Жизненный цикл задачи:**
```
📝 Draft (PM пишет ТЗ)
    ↓
🔍 In Review (Analyst валидирует)
    ↓
🚧 In Progress (Developer реализует)
    ↓
✅ Done (после git push + отчёта)
```

**Шаблон:** `docs/tasks/TASK-TEMPLATE.md`

При создании новой задачи PM копирует шаблон и заполняет свои секции. Аналитик и разработчик заполняют свои секции по мере работы.
