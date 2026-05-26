# TASK-046: Shared CategoryPicker — кастомные категории во всех пикерах

**Статус:** 📝 Draft  
**Приоритет:** P2  
**Sprint:** 5  
**Создана:** 2026-05-26  
**Обновлена:** 2026-05-26  
**Автор:** PM

---

## 📋 ТЗ (заполняет PM)

### Проблема

TASK-042 добавила кастомные категории в `AddTransactionPage` и `EditTransactionSheet`, но пикер категорий дублируется ещё в 4 местах — без поддержки кастомных категорий и кнопки «+ Создать категорию»:

| Экран | Файл |
|---|---|
| PostImportWizard (разметка после импорта) | `PostImportWizard.tsx` |
| RecategorizationSheet (рекатегоризация other_exp) | `RecategorizationSheet.tsx` |
| Онбординг — первая транзакция | `StepFirstTransaction.tsx` |
| Регулярные платежи — форма добавления вручную | `RecurringPage.tsx` |

Пользователь создал кастомную категорию «Питомец» → идёт размечать импортированные транзакции → категории «Питомец» в пикере нет → вынужден выбирать «Другое».

### Решение

- MVP: создать `apps/web/src/features/finance/CategoryPicker.tsx` — shared компонент, который инкапсулирует:
  - Системные категории (фильтрованные по `type`)
  - Кастомные категории из store (`customCategories`)
  - Кнопку ✕ на кастомных категориях (с подтверждением удаления)
  - Кнопку «+ Создать категорию» → открывает `CreateCategorySheet`

- MVP: заменить дублирующиеся пикеры в 4 файлах на `<CategoryPicker>`

**Интерфейс компонента:**
```typescript
interface CategoryPickerProps {
  type: 'expense' | 'income';
  selected: string;
  onChange: (categoryId: string) => void;
}
```

**Out of scope:**
- Изменение логики самих экранов (только замена пикера)
- Поддержка multi-select
- Поиск по категориям

### Затрагиваемые файлы

- `apps/web/src/features/finance/CategoryPicker.tsx` — новый shared компонент
- `apps/web/src/pages/profile/PostImportWizard.tsx` — заменить inline пикер
- `apps/web/src/pages/profile/RecategorizationSheet.tsx` — заменить inline пикер
- `apps/web/src/pages/onboarding/steps/StepFirstTransaction.tsx` — заменить inline пикер
- `apps/web/src/pages/recurring/RecurringPage.tsx` — заменить inline пикер

> Обоснование >4 файлов: механическая замена одного UI-паттерна на shared компонент.
> Сложность каждой замены минимальна, суть изменения единственна.

### Acceptance Criteria

- [ ] **AC-1:** В PostImportWizard при разметке транзакций пользователь видит свои кастомные категории в пикере.
- [ ] **AC-2:** В PostImportWizard в конце списка категорий есть кнопка «+ Создать категорию».
- [ ] **AC-3:** В RecategorizationSheet (рекатегоризация other_exp) доступны кастомные категории и кнопка «+ Создать категорию».
- [ ] **AC-4:** В онбординге (StepFirstTransaction) доступны кастомные категории.
- [ ] **AC-5:** В форме добавления регулярного платежа вручную (RecurringPage) доступны кастомные категории.
- [ ] **AC-6:** `CategoryPicker` — единственный компонент, содержащий логику отображения категорий + кнопку создания. `grep -r "EXPENSE_CATEGORIES\|INCOME_CATEGORIES" apps/web/src/pages/profile/PostImportWizard.tsx` возвращает 0 строк с inline категориями в пикере.

---

## 🔍 Валидация аналитика (заполняет Analyst)

**Статус валидации:** ✅ Одобрено

### Алгоритмическая корректность
> Нет алгоритмических изменений — только UI рефакторинг. Analyst step пропускается.

---

## 💻 Отчёт разработчика (заполняет Developer)

**Статус реализации:** ⬜ Ожидает

### Что сделано
### Что НЕ сделано (если есть)
### Риски и известные ограничения
### Тестирование
