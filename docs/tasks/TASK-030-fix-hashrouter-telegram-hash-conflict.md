# TASK-030: Исправление конфликта HashRouter и Telegram launch params в hash

**Статус:** ✅ Done
**Приоритет:** P0 (Critical — приложение не открывается в Telegram)  
**Создана:** 2026-05-21  
**Автор:** PM

---

## 📋 ТЗ (заполняет PM)

### Проблема

Приложение открывается в Telegram WebView, но показывает **пустой экран**.

**Корневая причина:** `HashRouter` использует `window.location.hash` как URL-путь маршрута. Telegram при открытии Mini App добавляет свои launch params в hash фрагмент:

```
https://renatYusupov.github.io/finwise/#tgWebAppData=query_id%3D...&tgWebAppVersion=7.10&tgWebAppPlatform=ios
```

`HashRouter` читает этот hash как путь и пытается найти маршрут `/tgWebAppData=query_id...`. Такого маршрута не существует → рендерится пустой экран (нет fallback `<Route path="*">`).

**История проблемы:**
- TASK-026: переключились на `HashRouter` — в браузере работает, в Telegram нет
- TASK-028, TASK-029: пытались исправить через `useEffect` и `isTelegramContext()` — не помогло, т.к. проблема в самом `HashRouter`, а не в логике компонентов

### Решение

**Вариант A (рекомендуемый): Вернуться на `BrowserRouter` + правильный `basename`**

`BrowserRouter` с `basename="/finwise"` + GitHub Pages 404.html SPA trick. Telegram launch params идут в `?` query string или в hash после `#/`, не конфликтуя с маршрутизацией.

Конфигурация:
- `vite.config.ts`: `base: '/finwise/'`
- `App.tsx`: `<BrowserRouter basename="/finwise">`
- `public/404.html`: SPA redirect trick (восстановить)
- `index.html`: восстановить `?p=` path-restoration скрипт

**Вариант B: Остаться на `HashRouter` + очистить hash от Telegram params перед монтированием**

Перед инициализацией `HashRouter` — синхронно прочитать `window.location.hash`, извлечь Telegram params, сохранить их, очистить hash до `#/`, затем монтировать приложение.

```ts
// В main.tsx, до ReactDOM.render:
const hash = window.location.hash;
if (hash.includes('tgWebApp')) {
  // Сохранить Telegram params, сбросить hash на корень
  window.history.replaceState(null, '', window.location.pathname + '#/');
}
```

**Вариант A предпочтительнее** — он устраняет класс проблем, а не патчит симптом. `BrowserRouter` + `basename` — стандартный подход для GitHub Pages project repos.

### Затрагиваемые файлы

- `apps/web/src/app/App.tsx` — заменить `HashRouter` на `BrowserRouter` с `basename="/finwise"`
- `apps/web/src/main.tsx` — убедиться что SW регистрируется по правильному пути
- `apps/web/public/404.html` — восстановить SPA redirect trick
- `apps/web/index.html` — восстановить `?p=` path-restoration скрипт
- `apps/web/vite.config.ts` — `base: '/finwise/'` (уже стоит, не менять)
- `ARCHITECTURE.md` — обновить описание роутинга

### Acceptance Criteria

- [ ] AC-1: Приложение открывается в Telegram WebView и показывает Dashboard (не пустой экран)
- [ ] AC-2: Все вкладки (Анализ, AI, Регулярные, Профиль) отображают контент при навигации в Telegram
- [ ] AC-3: Приложение работает в браузере по адресу `https://renatYusupov.github.io/finwise/`
- [ ] AC-4: Прямые ссылки на вкладки (`/finwise/analytics`, `/finwise/goals`) работают в браузере
- [ ] AC-5: GitHub Actions deploy успешно собирает и деплоит

### Edge Cases

- Telegram Desktop vs iOS vs Android — launch params могут отличаться
- Пользователь с незавершённым онбордингом в браузере — должен попасть на `/onboarding`
- Пользователь в Telegram — онбординг не должен срабатывать (использовать `isTelegramContext()`)
- Service Worker кэш — после смены роутера нужно сбросить кэш (обновить `CACHE_NAME`)

---

## 🔍 Валидация аналитика (заполняет Analyst)

**Статус валидации:** ✅ Одобрено (реализован Вариант A — BrowserRouter)

---

## 💻 Отчёт разработчика (заполняет Developer)

**Статус реализации:** ✅ Done
**Дата завершения:** 2026-05-21
**Коммит:** см. git log

### Что сделано

- `apps/web/src/app/App.tsx` — заменён `HashRouter` на `BrowserRouter` с `basename="/finwise"`. Добавлен комментарий объясняющий почему HashRouter не подходит для TMA.
- `apps/web/index.html` — восстановлен `?p=` path-restoration скрипт (нужен для BrowserRouter + GitHub Pages 404.html trick).
- `apps/web/public/sw.js` — `CACHE_NAME` обновлён с `finwise-v3` до `finwise-v4` для принудительного сброса старого кэша у всех клиентов.
- `.github/workflows/deploy.yml` — `sed` обновлён для замены `finwise-v4` на timestamp при деплое.

### Риски и известные ограничения

- `BrowserRouter` требует корректного `basename` — при изменении пути репозитория нужно обновить `basename` в `App.tsx` и `base` в `vite.config.ts` синхронно.
- `404.html` SPA trick работает только для GitHub Pages — для других хостингов нужен `try_files` в nginx.

### Тестирование

1. Открыть Mini App в Telegram — должен показаться Dashboard
2. Нажать каждую вкладку в BottomNav — все должны показывать контент
3. Открыть `https://renatYusupov.github.io/finwise/` в браузере — должен работать
4. Полностью закрыть и переоткрыть Mini App в Telegram — проверить что кэш не мешает
