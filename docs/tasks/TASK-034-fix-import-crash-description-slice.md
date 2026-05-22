# TASK-034: Fix import crash — "undefined is not an object (evaluating 'c.description.slice')"

**Status:** 📝 Draft  
**Priority:** 🔴 Critical — blocks import for users with existing transactions  
**Type:** Bug Fix  
**Effort:** S (1–2 часа)

---

## 📋 ТЗ (Product Manager)

### Проблема пользователя

При попытке импортировать банковскую выписку, когда в приложении уже есть транзакции, появляется ошибка:

> ⚠️ Ошибка разбора файла: undefined is not an object (evaluating 'c.description.slice')

Импорт не выполняется. Пользователь теряет данные и не может обновить историю.

### Root Cause (гипотеза)

Ошибка `c.description.slice` означает, что объект `c` (транзакция) имеет `description = undefined`. Это происходит в одном из двух мест:

**Место 1 — [`store.ts` `detectRecurringPayments`](../../apps/web/src/features/finance/store.ts) функция `buildLabel`:**
```typescript
function buildLabel(txs: Transaction[]): string {
  const descCounts = new Map<string, number>();
  for (const t of txs) {
    const d = t.description?.trim() ?? '';  // ← уже защищено
```
Здесь есть защита `?.trim() ?? ''` — маловероятно.

**Место 2 — [`addTransactionsBatch`](../../apps/web/src/features/finance/store.ts) или дедупликация:**
Дедупликация использует ключ `date|amount|description`. Если `description` у существующей транзакции `undefined` (старые данные без поля description), то `String(undefined)` = `"undefined"` — не крашится.

**Место 3 — наиболее вероятное — [`computeClarifyQueue`](../../apps/web/src/pages/profile/ProfilePage.tsx) или [`ClarifyCategoryStep`](../../apps/web/src/pages/profile/ProfilePage.tsx):**
После импорта вызывается `computeClarifyQueue(newTxs, stateAfter.transactions)`. Если среди `newTxs` есть транзакция с `description = undefined`, то при рендере `ClarifyCategoryStep` происходит `c.description.slice(0, N)` → crash.

**Место 4 — [`recategorizeWithGroq`](../../apps/web/src/pages/profile/ProfilePage.tsx):**
```typescript
const payload = needsGroq.map((item, batchIdx) => ({
  description: item.tx.description,  // ← может быть undefined если парсер вернул undefined
```
Если `parseBankXLSX` вернул транзакцию с `description = undefined` (пустая ячейка в XLSX), то `item.tx.description` = `undefined`. Далее в `ClarifyCategoryStep` при рендере: `tx.description.slice(0, 40)` → crash.

**Корень проблемы:** [`parseBankXLSX`](../../apps/web/src/pages/profile/bankImport.ts) может вернуть `description = ''` (пустая строка), но после `addTransactionsBatch` транзакция сохраняется в store. При повторном импорте `stateAfter.transactions` содержит транзакции из предыдущих импортов, некоторые из которых могут иметь `description = undefined` (если были добавлены вручную без описания или через старую версию кода).

### Acceptance Criteria

1. **Given** пользователь импортирует файл при наличии существующих транзакций  
   **When** парсер возвращает транзакцию с `description = undefined` или `''`  
   **Then** импорт завершается успешно, `description` заменяется на `'Операция'`

2. **Given** в store есть транзакции с `description = undefined` (старые данные)  
   **When** запускается `computeClarifyQueue` или `ClarifyCategoryStep`  
   **Then** нет краша, `description` отображается как `'Операция'`

3. **Given** любой файл (XLSX, PDF, CSV)  
   **When** импорт завершается  
   **Then** нет ошибки `undefined is not an object (evaluating 'c.description.slice')`

4. **Given** `recategorizeWithGroq` получает транзакцию с `description = undefined`  
   **When** формируется payload для API  
   **Then** `description` заменяется на `''` (не `undefined`)

### Затрагиваемые файлы

- [`apps/web/src/pages/profile/ProfilePage.tsx`](../../apps/web/src/pages/profile/ProfilePage.tsx) — `ClarifyCategoryStep`, `computeClarifyQueue`, `recategorizeWithGroq`
- [`apps/web/src/pages/profile/bankImport.ts`](../../apps/web/src/pages/profile/bankImport.ts) — `parseBankXLSX`, `parseTbankPDF` — добавить защиту `description = description || 'Операция'`
- [`apps/web/src/features/finance/store.ts`](../../apps/web/src/features/finance/store.ts) — `addTransactionsBatch` — нормализовать `description` при сохранении

### Явно вне скоупа

- Изменение логики категоризации
- Изменение UI импорта

---

## 🔍 Валидация аналитика (заполняет Analyst)

**Статус:** ⬜ Ожидает

---

## 💻 Отчёт разработчика (заполняет Developer)

**Статус:** ⬜ Ожидает

### Что сделано

### Тестирование
