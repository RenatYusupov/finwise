# 💰 FinWise — Telegram Mini App для личных финансов

> Полнофункциональное приложение для управления личными финансами внутри Telegram с AI-консультантом, геймификацией и аналитикой.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-4-black)](https://fastify.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748)](https://www.prisma.io/)
[![pnpm](https://img.shields.io/badge/pnpm-9-orange)](https://pnpm.io/)

---

## 📋 Содержание

- [Возможности](#-возможности)
- [Архитектура](#-архитектура)
- [Структура проекта](#-структура-проекта)
- [Быстрый старт](#-быстрый-старт)
- [Разработка](#-разработка)
- [Переменные окружения](#-переменные-окружения)
- [API](#-api)
- [Деплой](#-деплой)
- [Соответствие законодательству](#-соответствие-законодательству)

---

## ✨ Возможности

### 💳 Финансовый учёт
- Ручное добавление доходов и расходов
- Категоризация транзакций (еда, транспорт, развлечения и др.)
- Несколько счетов (наличные, карты, накопительные)
- История транзакций с фильтрацией и поиском

### 🤖 AI-консультант (YandexGPT)
- Персонализированный анализ расходов
- Советы по экономии на основе реальных данных
- Чат с финансовым ассистентом
- Автоматические инсайты и аномалии

### 🎯 Цели и бюджеты
- Постановка финансовых целей с прогресс-баром
- Бюджетирование по категориям
- Алерты при превышении бюджета
- Прогноз достижения цели

### 📊 Аналитика
- Графики расходов по категориям (Recharts)
- Сравнение месяц к месяцу
- Тренды и паттерны трат
- Экспорт данных

### 🏆 Геймификация
- Серии (streaks) за ежедневный учёт
- Достижения и бейджи
- Уровни и очки опыта
- Еженедельные челленджи

### 🔔 Уведомления
- Еженедельные отчёты в Telegram
- Алерты при превышении бюджета
- Напоминания о целях
- Уведомления о достижениях

---

## 🏗 Архитектура

```
┌─────────────────────────────────────────────────────────┐
│                    Telegram Client                       │
│              (Telegram Mini App WebView)                 │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────┐
│                  React Frontend (Vite)                   │
│     TMA SDK · React Router · Zustand · TanStack Query   │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────────┐
│                   API Gateway (3000)                     │
│              Fastify · Rate Limiting · CORS              │
└──┬──────────┬──────────┬──────────┬────────────────────┘
   │          │          │          │
   ▼          ▼          ▼          ▼
Auth(3001) Finance(3002) AI(3003) Notify(3004)
   │          │          │          │
   └──────────┴──────────┴──────────┘
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
    PostgreSQL 16           Redis 7
    (Prisma ORM)         (Cache + BullMQ)
```

### Сервисы

| Сервис | Порт | Описание |
|--------|------|----------|
| `api-gateway` | 3000 | HTTP-прокси, маршрутизация, rate limiting |
| `auth-service` | 3001 | TMA initData валидация, JWT |
| `finance-service` | 3002 | Транзакции, цели, бюджеты, аналитика |
| `ai-service` | 3003 | YandexGPT интеграция, чат, инсайты |
| `notification-service` | 3004 | BullMQ очереди, Telegram уведомления |
| `bot` | 3005 | Telegraf бот, /start, webhook |
| `web` | 5173 | React TMA фронтенд |

---

## 📁 Структура проекта

```
finwise/
├── apps/
│   ├── web/                    # React TMA фронтенд
│   │   ├── src/
│   │   │   ├── app/            # Провайдеры, роутер, стили
│   │   │   ├── features/       # Фичи (auth, gamification, analytics)
│   │   │   ├── pages/          # Страницы (dashboard, transactions, goals...)
│   │   │   └── shared/         # UI-компоненты, утилиты, API-клиент
│   │   ├── Dockerfile
│   │   └── nginx.conf
│   └── bot/                    # Telegraf Telegram бот
│       ├── src/index.ts
│       └── Dockerfile
├── services/
│   ├── api-gateway/            # Fastify HTTP прокси
│   ├── auth-service/           # JWT + TMA валидация
│   ├── finance-service/        # Финансовая логика
│   ├── ai-service/             # YandexGPT интеграция
│   └── notification-service/   # BullMQ + Telegram уведомления
├── packages/
│   ├── shared-types/           # Общие TypeScript типы
│   └── db-schema/              # Prisma схема и миграции
├── docker-compose.yml
├── package.json                # pnpm workspaces root
├── tsconfig.base.json
└── .env.example
```

---

## 🚀 Быстрый старт

### Требования

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 9
- [Docker](https://www.docker.com/) + Docker Compose
- Telegram Bot Token (от [@BotFather](https://t.me/BotFather))

### 1. Клонирование и установка

```bash
git clone <repo-url>
cd finwise

# Установить зависимости
pnpm install
```

### 2. Настройка окружения

```bash
cp .env.example .env
```

Заполните `.env`:

```env
# Обязательно
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
JWT_SECRET=your_super_secret_jwt_key_min_32_chars

# Для AI (опционально — без него работает mock)
YANDEX_GPT_API_KEY=your_yandex_cloud_api_key
YANDEX_GPT_FOLDER_ID=your_yandex_cloud_folder_id

# URL вашего задеплоенного фронтенда
WEBAPP_URL=https://your-finwise-app.com
```

### 3. Запуск через Docker Compose

```bash
# Запустить все сервисы (БД, Redis, бэкенд, фронтенд, бот)
docker compose up -d

# Применить миграции БД
docker compose run --rm migrate

# Проверить статус
docker compose ps
```

### 4. Открыть приложение

- **Фронтенд**: http://localhost:5173
- **API Gateway**: http://localhost:3000
- **Telegram бот**: найдите вашего бота в Telegram и нажмите `/start`

---

## 💻 Разработка

### Локальный запуск без Docker

```bash
# 1. Запустить только инфраструктуру (PostgreSQL + Redis)
docker compose up -d postgres redis

# 2. Применить миграции
cd packages/db-schema
DATABASE_URL="postgresql://finwise:finwise_secret@localhost:5432/finwise" \
  npx prisma migrate dev

# 3. Сгенерировать Prisma Client
npx prisma generate

# 4. Запустить все сервисы параллельно (из корня)
cd ../..
pnpm dev
```

### Запуск отдельных сервисов

```bash
# Только фронтенд
pnpm --filter @finwise/web dev

# Только auth-service
pnpm --filter @finwise/auth-service dev

# Только finance-service
pnpm --filter @finwise/finance-service dev

# Только ai-service
pnpm --filter @finwise/ai-service dev

# Только notification-service
pnpm --filter @finwise/notification-service dev

# Только бот
pnpm --filter @finwise/bot dev
```

### Prisma — работа с БД

```bash
cd packages/db-schema

# Создать новую миграцию
npx prisma migrate dev --name add_new_field

# Открыть Prisma Studio (GUI для БД)
npx prisma studio

# Сбросить БД (осторожно!)
npx prisma migrate reset

# Применить миграции в production
npx prisma migrate deploy
```

### Тестирование TMA локально

Для тестирования Telegram Mini App локально используйте [ngrok](https://ngrok.com/):

```bash
# Запустить фронтенд
pnpm --filter @finwise/web dev

# В другом терминале — создать туннель
ngrok http 5173

# Скопируйте HTTPS URL и установите его в BotFather:
# /mybots → выберите бота → Bot Settings → Menu Button → Edit Menu Button URL
```

Для обхода TMA валидации в dev-режиме используйте `initData = 'dev'` в запросах к auth-service.

---

## 🔧 Переменные окружения

| Переменная | Описание | Обязательно |
|-----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Токен бота от @BotFather | ✅ |
| `JWT_SECRET` | Секрет для подписи JWT (мин. 32 символа) | ✅ |
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `REDIS_URL` | Redis connection string | ✅ |
| `YANDEX_GPT_API_KEY` | API ключ Yandex Cloud | ❌ (mock без него) |
| `YANDEX_GPT_FOLDER_ID` | Folder ID в Yandex Cloud | ❌ |
| `WEBAPP_URL` | URL задеплоенного фронтенда | ✅ для прода |
| `WEBHOOK_DOMAIN` | Домен для Telegram webhook | ❌ (polling без него) |
| `NODE_ENV` | `development` или `production` | ❌ |

---

## 📡 API

### Аутентификация

Все запросы (кроме `/api/auth/*`) требуют заголовок:
```
Authorization: Bearer <jwt_token>
```

### Эндпоинты

#### Auth Service (`/api/auth`)
```
POST /api/auth/telegram    — Авторизация через TMA initData
POST /api/auth/onboarding  — Завершение онбординга
GET  /api/auth/me          — Текущий пользователь
```

#### Finance Service
```
# Транзакции
GET    /api/transactions          — Список транзакций
POST   /api/transactions          — Создать транзакцию
DELETE /api/transactions/:id      — Удалить транзакцию

# Счета
GET    /api/accounts              — Список счетов
POST   /api/accounts              — Создать счёт

# Категории
GET    /api/categories            — Список категорий

# Цели
GET    /api/goals                 — Список целей
POST   /api/goals                 — Создать цель
PATCH  /api/goals/:id             — Обновить цель
DELETE /api/goals/:id             — Удалить цель
POST   /api/goals/:id/contribute  — Пополнить цель

# Бюджеты
GET    /api/budgets                — Список бюджетов
POST   /api/budgets                — Создать бюджет
PATCH  /api/budgets/:id            — Обновить бюджет
DELETE /api/budgets/:id            — Удалить бюджет

# Аналитика
GET    /api/analytics/summary     — Сводка за период
GET    /api/analytics/categories  — Расходы по категориям

# Геймификация
GET    /api/gamification/streak   — Текущая серия
GET    /api/gamification/achievements — Достижения
```

#### AI Service (`/api/ai`)
```
POST /api/ai/chat         — Отправить сообщение AI
GET  /api/ai/chat/history — История чата
GET  /api/ai/insights     — AI инсайты
POST /api/ai/insights/generate — Сгенерировать инсайты
```

#### Notification Service (`/api/notifications`)
```
POST /api/notifications/send                    — Отправить уведомление
POST /api/notifications/weekly-reports/trigger  — Запустить еженедельные отчёты
GET  /api/notifications/stats                   — Статистика очереди
```

---

## 🚢 Деплой

### Production с Docker Compose

```bash
# Создать .env для production
cp .env.example .env.production
# Заполните все переменные

# Запустить
NODE_ENV=production docker compose --env-file .env.production up -d

# Применить миграции
docker compose --env-file .env.production run --rm migrate
```

### Рекомендуемые платформы

| Компонент | Платформа |
|-----------|-----------|
| Фронтенд | Vercel / Cloudflare Pages |
| Бэкенд | Yandex Cloud / VPS с Docker |
| БД | Yandex Managed PostgreSQL |
| Redis | Yandex Managed Redis |
| Домен + SSL | Cloudflare |

### Настройка Telegram Webhook (production)

```bash
# Установить webhook
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-domain.com/webhook"}'

# Проверить webhook
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

### Настройка Mini App в BotFather

1. Откройте [@BotFather](https://t.me/BotFather)
2. `/mybots` → выберите бота
3. **Bot Settings** → **Menu Button** → **Edit Menu Button URL**
4. Введите URL вашего фронтенда
5. **Bot Settings** → **Configure Mini App** → включите Mini App

---

## ⚖️ Соответствие законодательству

### 152-ФЗ (Персональные данные)
- Все данные хранятся на серверах в России (Yandex Cloud)
- Шифрование данных в покое (AES-256) и в транзите (TLS 1.3)
- Минимальный сбор данных (только необходимые поля)
- Возможность удаления аккаунта и всех данных

### 161-ФЗ (Национальная платёжная система)
- Банковские токены хранятся в зашифрованном виде (AES-256-GCM)
- Не хранятся CVV/CVC коды
- Используется только Open Banking API

### YandexGPT вместо OpenAI
- Данные пользователей не передаются за рубеж
- Соответствие требованиям локализации данных
- Обработка финансовых данных внутри РФ

---

## 🛠 Технологический стек

### Frontend
| Технология | Версия | Назначение |
|-----------|--------|-----------|
| React | 18 | UI фреймворк |
| TypeScript | 5.4 | Типизация |
| Vite | 5 | Сборщик |
| Tailwind CSS | 3 | Стилизация |
| Framer Motion | 11 | Анимации |
| Zustand | 4 | Клиентский стейт |
| TanStack Query | 5 | Серверный стейт |
| React Router | 6 | Маршрутизация |
| Recharts | 2 | Графики |
| React Hook Form | 7 | Формы |
| @telegram-apps/sdk-react | 2 | TMA SDK |

### Backend
| Технология | Версия | Назначение |
|-----------|--------|-----------|
| Fastify | 4 | HTTP сервер |
| TypeScript | 5.4 | Типизация |
| Prisma | 5 | ORM |
| PostgreSQL | 16 | База данных |
| Redis | 7 | Кэш + очереди |
| BullMQ | 5 | Job queues |
| Telegraf | 4 | Telegram Bot API |
| Zod | 3 | Валидация схем |
| jsonwebtoken | 9 | JWT |

---

## 📝 Лицензия

MIT © 2024 FinWise Team

---

## 🤝 Контрибьюция

1. Fork репозитория
2. Создайте ветку: `git checkout -b feature/amazing-feature`
3. Commit изменений: `git commit -m 'feat: add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Откройте Pull Request
