# TASK-038: Унификация списка транзакций — CategoryDetailPage = TransactionsPage

**Статус:** 📝 Draft  
**Приоритет:** P1  
**Sprint:** 4  
**Создана:** 2026-05-25  
**Автор:** PM

---

## 📋 ТЗ (заполняет PM)

### Проблема

Пользователь проваливается в детализацию категории из Аналитики и видит список транзакций, который **визуально и функционально отличается** от списка транзакций на экране «Транзакции». Это создаёт когнитивный диссонанс: одни и те же данные выглядят по-разному в зависимости от точки входа.

**Конкретные отличия:**
- [`CategoryDetailPage`](apps/web/src/pages/analytics/CategoryDetailPage.tsx) — собственный `EditSheet` (inline, минималистичный), нет свайпа, нет группировки по датам
- [`TransactionsPage`](apps/web/src/pages/transactions/TransactionsPage.tsx) — `SwipeableRow` со свайпом, `EditTransactionSheet` (полный), группировка по датам

Пользователь ожидает одинакового поведения: нажал на транзакцию — открылся редактор. Вместо этого в одном месте свайп, в другом — другой UI.

### Решение

Привести список транзакций в [`CategoryDetailPage`](apps/web/src/pages/analytics/CategoryDetailPage.tsx) к тому же виду, что в [`TransactionsPage`](apps/web/src/pages/transactions/TransactionsPage.tsx):

1. **Убрать inline `EditSheet`** из `CategoryDetailPage` — он дублирует логику
2. **Переиспользовать `EditTransactionSheet`** из `TransactionsPage` (вынести в общий компонент или импортировать напрямую)
3. **Переиспользовать `SwipeableRow`** из `TransactionsPage` для строк транзакций в `CategoryDetailPage`
4. **Добавить группировку по датам** в `CategoryDetailPage` — такая же как в `TransactionsPage` (заголовок с датой + список под ним)

**Что НЕ менять:** логику фильтрации по периоду и категории, график динамики по неделям — они уникальны для `CategoryDetailPage`.

### Затрагиваемые файлы (ориентировочно)

- [`apps/web/src/pages/analytics/CategoryDetailPage.tsx`](apps/web/src/pages/analytics/CategoryDetailPage.tsx) — убрать `EditSheet`, добавить `SwipeableRow` + `EditTransactionSheet` + группировку по датам
- [`apps/web/src/pages/transactions/TransactionsPage.tsx`](apps/web/src/pages/transactions/TransactionsPage.tsx) — экспортировать `SwipeableRow` и `EditTransactionSheet` для переиспользования

### Acceptance Criteria

- [ ] **AC-1:** Список транзакций в `CategoryDetailPage` использует тот же компонент строки (`SwipeableRow`), что и `TransactionsPage` — одинаковый визуал, одинаковый свайп влево для действий.
- [ ] **AC-2:** Редактор транзакции в `CategoryDetailPage` — тот же `EditTransactionSheet`, что в `TransactionsPage`. Inline `EditSheet` удалён.
- [ ] **AC-3:** Транзакции в `CategoryDetailPage` сгруппированы по датам — заголовок с датой + список под ним, как в `TransactionsPage`.
- [ ] **AC-4:** Логика фильтрации по периоду и категории в `CategoryDetailPage` не изменена — только визуальный слой.
- [ ] **AC-5:** Edge case: пустой список транзакций в `CategoryDetailPage` — показывает тот же empty state, что в `TransactionsPage` («Нет транзакций за этот период»).

---

## 🔍 Валидация аналитика (заполняет Analyst)

**Статус валидации:** ⬜ Ожидает

### Алгоритмическая корректность
> Нет алгоритмических изменений — только UI-рефакторинг.

### Данные и метрики
> —

### Замечания
> —

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
> `SwipeableRow` и `EditTransactionSheet` сейчас не экспортируются из `TransactionsPage.tsx` — нужно либо вынести в `apps/web/src/shared/ui/`, либо экспортировать напрямую. Предпочтительно вынести в shared.

### Тестирование

1. Открыть Аналитику → нажать на любую категорию → убедиться, что список транзакций выглядит как в разделе «Транзакции»
2. Свайпнуть транзакцию влево → убедиться, что появляются кнопки «Изменить» и «Удалить»
3. Нажать «Изменить» → убедиться, что открывается тот же bottom sheet, что в разделе «Транзакции»
4. Убедиться, что транзакции сгруппированы по датам
5. Убедиться, что фильтрация по периоду (месяц / 3 мес. / 6 мес.) по-прежнему работает
