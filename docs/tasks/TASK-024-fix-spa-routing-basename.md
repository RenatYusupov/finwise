# TASK-024: Исправление SPA-роутинга — несоответствие basename и nginx fallback

**Статус:** 📝 Draft  
**Приоритет:** P0  
**Sprint:** hotfix  
**Создана:** 2026-05-21  
**Автор:** PM

---

## 📋 ТЗ (заполняет PM)

### Проблема

Все вкладки приложения, кроме главной (`/`), не отображают контент. При переходе через BottomNav на `/analytics`, `/recurring`, `/profile`, `/goals`, `/budget`, `/ai` — страница либо пустая, либо показывает 404/blank.

**Корневая причина — несоответствие трёх конфигураций:**

1. **`vite.config.ts`**: `base: '/finwise/'` — все JS/CSS assets собираются с префиксом `/finwise/`
2. **`App.tsx`**: `createBrowserRouter([...], { basename: '/finwise' })` — React Router ожидает, что все URL начинаются с `/finwise/`
3. **`nginx.conf`**: `try_files $uri $uri/ /index.html` — SPA fallback возвращает `/index.html` (корневой), а не `/finwise/index.html`

**Сценарий поломки:**
- Пользователь нажимает "Анализ" в BottomNav → браузер переходит на `/finwise/analytics`
- Если страница обновляется или открывается по прямой ссылке, nginx ищет файл `/finwise/analytics`, не находит, отдаёт `/index.html`
- `index.html` загружается, React Router с `basename='/finwise'` видит путь `/finwise/analytics`, корректно матчит маршрут — **это работает**
- **НО**: если приложение развёрнуто так, что URL не содержит `/finwise` (например, на корне домена или в Telegram WebApp с другим URL), то `basename: '/finwise'` ломает все переходы — `navigate('/analytics')` внутри router с basename превращается в `/finwise/analytics`, но `location.pathname` внутри router уже stripped, поэтому `isActive` в BottomNav работает некорректно

**Дополнительная проблема — `isActive` в BottomNav:**
```tsx
// BottomNav.tsx:22-24
const isActive = item.path === '/'
  ? location.pathname === '/'
  : location.pathname.startsWith(item.path);
```
`location.pathname` внутри router с `basename` возвращает путь **без** basename-префикса. Но `item.path` — это `/analytics`, `/recurring` и т.д. Это должно работать корректно. Проблема в другом — см. ниже.

**Главная гипотеза:** В Telegram Mini App приложение открывается по URL без `/finwise` в пути (например, `https://t.me/...` открывает `https://your-domain.com/`). Router с `basename: '/finwise'` не находит совпадений ни для одного маршрута кроме корня, потому что все дочерние пути определены относительно basename. Нужно либо убрать basename и настроить nginx правильно, либо согласовать все три конфига.

### Решение

**Вариант A (рекомендуемый): убрать basename, оставить base в vite, исправить nginx**

Если приложение всегда открывается с корня домена (типично для Telegram Mini App):

1. **`App.tsx`**: убрать `{ basename: '/finwise' }` из `createBrowserRouter` — роутер работает от корня `/`
2. **`nginx.conf`**: исправить fallback с `/index.html` на `/finwise/index.html` (или настроить `location /finwise/` блок)
3. **`vite.config.ts`**: оставить `base: '/finwise/'` без изменений — assets по-прежнему под `/finwise/`

**Вариант B: согласовать basename с реальным URL**

Если приложение действительно живёт по пути `/finwise/` на сервере:

1. **`nginx.conf`**: добавить `location /finwise/` блок с правильным `try_files $uri $uri/ /finwise/index.html`
2. **`App.tsx`**: оставить `basename: '/finwise'` без изменений
3. **`vite.config.ts`**: оставить `base: '/finwise/'` без изменений

**Вариант C: использовать HashRouter вместо BrowserRouter**

Для Telegram Mini App HashRouter (`/#/analytics`) полностью избегает проблем с серверным роутингом — сервер всегда отдаёт `index.html`, а маршрут читается из hash. Минус — некрасивые URL.

**Рекомендация: Вариант A** — убрать basename из router, исправить nginx fallback. Это самый чистый вариант для Telegram Mini App, где URL всегда начинается с корня.

### Затрагиваемые файлы

- [`apps/web/src/app/App.tsx`](apps/web/src/app/App.tsx) — убрать `{ basename: '/finwise' }` из `createBrowserRouter`
- [`apps/web/nginx.conf`](apps/web/nginx.conf) — исправить `try_files` fallback
- [`apps/web/vite.config.ts`](apps/web/vite.config.ts) — проверить `base`, возможно изменить на `'/'` если Telegram Mini App открывается с корня

### Acceptance Criteria

- [ ] AC-1: Переход на вкладку "Анализ" (📊) через BottomNav отображает `AnalyticsPage` с контентом
- [ ] AC-2: Переход на вкладку "Регулярные" (🔁) через BottomNav отображает `RecurringPage` с контентом
- [ ] AC-3: Переход на вкладку "Профиль" (👤) через BottomNav отображает `ProfilePage` с контентом
- [ ] AC-4: Переход на вкладку "AI" (🦉) через BottomNav отображает `AiChatPage` с контентом
- [ ] AC-5: Прямой переход на `/analytics` (или обновление страницы на этом URL) не приводит к blank/404
- [ ] AC-6: Активная вкладка в BottomNav подсвечивается корректно при навигации
- [ ] AC-7: Переход "Назад" из `GoalDetailPage` возвращает на `GoalsPage`
- [ ] AC-8: Приложение корректно открывается в Telegram Mini App (не только в браузере)

### Edge Cases

- Telegram Desktop vs Telegram Mobile — URL может отличаться
- Если `VITE_BASE_URL` задан через env — убедиться, что он согласован с nginx
- После изменения `base` в vite — пересобрать и проверить, что assets загружаются (нет 404 на JS/CSS)
- Onboarding redirect: `router.navigate('/onboarding')` должен работать после исправления

---

## 🔍 Валидация аналитика (заполняет Analyst)

**Статус валидации:** ⬜ Ожидает

### Алгоритмическая корректность
> Задача не затрагивает алгоритмы финансовых расчётов. Риск регрессий минимален — изменения только в конфигурации роутера и nginx.

### Данные и метрики
> Метрика успеха: 0 blank-страниц при навигации по всем 5 вкладкам BottomNav.

### Замечания
> Нет.

---

## 💻 Отчёт разработчика (заполняет Developer)

**Статус реализации:** ⬜ Ожидает  
**Дата завершения:** —  
**Коммит:** —

### Что сделано
> —

### Что НЕ сделано (если есть)
> —

### Риски и известные ограничения
> —

### Тестирование

1. Открыть приложение в браузере на `localhost:3000`
2. Нажать каждую из 5 вкладок BottomNav — убедиться, что контент отображается
3. На вкладке "Анализ" обновить страницу (F5) — убедиться, что страница не blank
4. Открыть в Telegram Mini App — проверить все вкладки
5. Перейти в Goals → нажать на карточку цели → убедиться, что GoalDetailPage открывается → нажать "Назад" → убедиться, что вернулись на GoalsPage
