# TASK-033: Fix blank screen on tab navigation — Framer Motion AnimatePresence stuck at opacity:0 on iOS Telegram

**Status:** ✅ Done  
**Priority:** Critical  
**Type:** Bug Fix

---

## 📋 ТЗ (Product Manager)

### Проблема пользователя

После реализации TASK-032 (MemoryRouter для Telegram) маршрутизация работала корректно — debug overlay показывал `IS_TG=true router=MEM path=/analytics` при переходе на вкладку Analytics. Однако страница оставалась визуально пустой: виден только молочно-белый фон (`--bg-warm` = `#FFF8F0`), контент страницы не отображался.

### Root Cause

`AnimatePresence mode="wait"` + `motion.div initial={{ opacity: 0, y: 8 }}` в [`AppLayout.tsx`](../../apps/web/src/app/AppLayout.tsx) оборачивал `<Outlet>` с `key={location.pathname}`.

На iOS Telegram WebView (WKWebView) анимация Framer Motion **не завершалась** — `opacity` застревал на `0`. Это происходит потому что:
1. `AnimatePresence mode="wait"` ждёт завершения exit-анимации предыдущего элемента перед монтированием нового
2. На iOS WKWebView `requestAnimationFrame` / CSS transitions могут не срабатывать корректно при смене `key` в виртуальном DOM
3. Результат: новый `motion.div` монтируется с `opacity: 0` и никогда не переходит к `opacity: 1`

### Acceptance Criteria

- [x] Переход на любую вкладку (Analytics, Budget, Goals, Profile, Recurring, AI) показывает контент страницы
- [x] Нет blank/milk-white экрана при навигации в iOS Telegram
- [x] Debug overlay удалён из production кода
- [x] Поведение в браузере не изменилось

---

## 🔍 Валидация аналитика

**Статус:** ✅ Подтверждено

**Метод диагностики:**
1. Добавлен debug overlay в `App.tsx` (commit `89d021bb`) — показывал `IS_TG`, тип роутера, текущий `location.pathname`
2. Подтверждено: `IS_TG=true router=MEM path=/analytics` — маршрутизация работает корректно
3. Страница рендерится, но невидима → проблема в CSS/анимации, не в роутинге
4. Гипотеза: `AnimatePresence mode="wait"` + `initial={{ opacity: 0 }}` застревает на iOS
5. Тест: удалён `AnimatePresence` из `AppLayout.tsx` (commit `438a43f2`)
6. Результат: страницы стали видимы ✅ — гипотеза подтверждена

**Известная проблема Framer Motion на iOS WKWebView:**
- `AnimatePresence mode="wait"` блокирует рендер нового элемента до завершения exit-анимации
- На iOS WKWebView анимационный цикл может не завершиться при быстрой смене `key`
- Решение: убрать `AnimatePresence` из layout-уровня, оставить только в компонентах где это критично

---

## 💻 Отчёт разработчика

### Что сделано

1. **Диагностика** (commit `89d021bb`):
   - Добавлен `DebugOverlayInner` в `App.tsx` — зелёный/красный баннер с `IS_TG`, `router`, `path`
   - Подтверждено: маршрутизация работает, проблема в рендере страницы

2. **Тест-фикс** (commit `438a43f2`):
   - Удалён `AnimatePresence mode="wait"` и `motion.div initial={{ opacity: 0, y: 8 }}` из [`AppLayout.tsx`](../../apps/web/src/app/AppLayout.tsx)
   - Заменён на plain `<div key={location.pathname}>`
   - Тест в iOS Telegram: страницы стали видимы ✅

3. **Финальная очистка** (этот коммит):
   - Удалён debug overlay (`DebugOverlayInner`, `DebugOverlay`, `_DEBUG_SIGNALS`) из [`App.tsx`](../../apps/web/src/app/App.tsx)
   - Обновлён комментарий в [`AppLayout.tsx`](../../apps/web/src/app/AppLayout.tsx) — объясняет почему `AnimatePresence` отсутствует

### Затронутые файлы

- [`apps/web/src/app/AppLayout.tsx`](../../apps/web/src/app/AppLayout.tsx) — удалён `AnimatePresence` + `motion.div` вокруг `<Outlet>`
- [`apps/web/src/app/App.tsx`](../../apps/web/src/app/App.tsx) — удалён debug overlay

### Что НЕ сделано

- `AnimatePresence` в самих страницах (модалки, списки) — **не тронуто**. Проблема была только в layout-уровне где `mode="wait"` блокировал весь рендер.
- Анимации внутри страниц (`motion.div initial={{ opacity: 0 }}` в карточках) — оставлены как есть, они не блокируют рендер страницы целиком.

### Правило для будущих разработчиков

> ⚠️ **Не использовать `AnimatePresence mode="wait"` на уровне layout/роутера в Telegram Mini App.**
> На iOS WKWebView анимация может застрять на `opacity: 0`, делая страницу невидимой.
> Используй `AnimatePresence` только внутри компонентов для модалок/списков, не для page transitions.

### Тестирование

- ✅ iOS Telegram: все вкладки (Dashboard, Analytics, Budget, Goals, Recurring, AI, Profile) показывают контент
- ✅ Браузер: навигация работает без изменений
- ✅ Debug overlay удалён из production
