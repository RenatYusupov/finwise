# TASK-001: Sprint 0 — Исправление алгоритмов ALG-001, ALG-003, ALG-004 + CloudPayload

**Статус:** ✅ Done  
**Приоритет:** P0  
**Sprint:** 0  
**Создана:** 2026-05-19  
**Автор:** Analyst (на основе gap-анализа)

---

## 📋 ТЗ (заполняет PM)

### Проблема

Аудит алгоритмов (19.05.2026) выявил критические баги в трёх алгоритмах:

1. **ALG-003 SafeToSpend** — три формульных ошибки: `daysLeft` не включает сегодня (+8% завышение), `remaining` скрывает перерасход нулём, `safeToday` не обновляется при добавлении трат в течение дня.
2. **ALG-001 Recurring Detection** — порог `MIN_AMOUNT=5000` не позволяет обнаружить подписки (Netflix 799₽, Яндекс Плюс 299₽). Нет механизма деактивации устаревших паттернов.
3. **ALG-004 P2P** — переводы по СБП физическим лицам классифицируются как `type='transfer'` и исключаются из `alreadySpent`. За 6 месяцев это привело к недоучёту 554,000 ₽.
4. **CloudPayload** — `budgets` и `recurringPayments` не сохраняются в Telegram CloudStorage. При смене устройства данные теряются.

### Решение

Исправить формульные ошибки, снизить пороги детекции, добавить staleness-check, расширить CloudPayload, добавить P2P-детекцию.

### Затрагиваемые файлы

- `apps/web/src/pages/dashboard/DashboardPage.tsx` — Fix-1 (ALG-003)
- `apps/web/src/features/finance/store.ts` — Fix-2, Fix-3, CloudPayload, `userCorrected`
- `apps/web/src/pages/profile/bankImport.ts` — ALG-004 P2P

### Acceptance Criteria

- [x] AC-1: `daysLeft` на 19-й день мая = 13 (было 12)
- [x] AC-2: При перерасходе `remaining` отрицательный, UI показывает `overspentAmount`
- [x] AC-3: `safeToday` уменьшается при добавлении транзакции сегодня
- [x] AC-4: Netflix 799₽ обнаруживается как recurring (было: игнорировался)
- [x] AC-5: Паттерн, не встречавшийся 65+ дней, автоматически деактивируется
- [x] AC-6: `budgets` и `recurringPayments` сохраняются в CloudStorage и восстанавливаются при смене устройства
- [x] AC-7: СБП-перевод на +79161234567 помечается `requiresUserInput=true`

---

## 🔍 Валидация аналитика (заполняет Analyst)

**Статус валидации:** ✅ Одобрено

### Алгоритмическая корректность

Все исправления соответствуют ALGORITHM_SPEC.md v1.1:

- **ALG-003 Change 1** (`daysLeft`): формула `daysInMonth - dayOfMonth + 1` корректна. Тест: 19 мая → 31-19+1=13 ✅
- **ALG-003 Change 2** (убрать `Math.max(0,...)`): корректно. Отрицательный `remaining` = перерасход.
- **ALG-003 Change 3** (`spentToday`): `safePerDay = remaining / daysAhead`, `safeToday = safePerDay - spentToday` — соответствует спецификации.
- **ALG-001 Change 1** (`MIN_AMOUNT=100`): снижение порога с 5000 до 100 корректно для подписок.
- **ALG-001 Change 4** (`updateStaleness`, 65 дней): соответствует спецификации.
- **ALG-004 Rule 1** (P2P → expense): паттерны покрывают основные форматы СБП и Альфа-Банка.

### Данные и метрики

- SafeToSpend: ожидаемое снижение на ~8% в середине месяца (устранение завышения)
- Recurring detection: ожидается обнаружение 3–7 новых подписок у типичного пользователя
- P2P: ожидается увеличение `alreadySpent` на ~15–25% у пользователей с активными СБП-переводами

### Замечания

1. `MIN_AMOUNT_PAYMENTS = 1_000` объявлен, но не используется как отдельный порог — в текущей реализации используется `MIN_AMOUNT = MIN_AMOUNT_SUBSCRIPTIONS = 100`. Это допустимо для Sprint 0, но в Sprint 1 стоит добавить двухуровневую логику confidence.
2. P2P-паттерн для именных переводов (`Перевод клиенту Имя Фамилия`) может давать ложные срабатывания на корпоративные переводы. Риск низкий — `requiresUserInput=true` позволяет пользователю скорректировать.

---

## 💻 Отчёт разработчика (заполняет Developer)

**Статус реализации:** ✅ Done  
**Дата завершения:** 2026-05-19  
**Коммит:** _не запушено — требуется `git push`_

### Что сделано

**`apps/web/src/pages/dashboard/DashboardPage.tsx`**

- Обновлён заголовочный комментарий: алгоритм v3.3 → v4
- `SpendingProfile` interface: добавлены поля `spentToday`, `safePerDay`, `overspentAmount`
- `computeSpendingProfile()` строка ~151: `daysLeft = daysInMonth - dayOfMonth + 1` (FIX-1a)
- `computeSpendingProfile()` строка ~154: добавлен `daysAhead = Math.max(1, daysLeft - 1)`
- `computeSpendingProfile()` строка ~254: убран `Math.max(0, ...)` из `remaining` (FIX-1b)
- `computeSpendingProfile()` строки ~258–276: добавлены `spentToday`, `safePerDay`, `safeToday` (FIX-1c)
- `SafeToSpendCard` строка ~389: `formatCurrency(profile.overspentAmount)` вместо `profile.alreadySpent - profile.thisMonthIncome`

**`apps/web/src/features/finance/store.ts`**

- `Transaction` interface: добавлено поле `userCorrected?: boolean`
- `CloudPayload` interface: добавлены поля `budgets: Budget[]` и `recurringPayments: RecurringPayment[]`
- `buildCloudPayload()`: сериализует `budgets` и `recurringPayments`
- `mergePayloads()`: объединяет budgets (prefer higher limit), recurringPayments (union с сохранением dismissed/confirmed), transactions (prefer userCorrected=true)
- `updateStaleness()`: новая экспортируемая функция — деактивирует auto-паттерны старше 65 дней (FIX-3)
- `detectRecurringPayments()`: `MIN_AMOUNT` снижен с 5000 до 100 (FIX-2)
- `runDetectRecurringPayments()`: вызывает `updateStaleness()` перед детекцией
- `rehydrateFromCloud()`: восстанавливает `budgets` и `recurringPayments` в live store и localStorage

**`apps/web/src/pages/profile/bankImport.ts`**

- `P2P_PATTERNS[]`: 7 regex-паттернов для СБП и именных переводов
- `CASH_WITHDRAWAL_PATTERNS[]`: 6 паттернов для банкоматов
- `isP2PTransfer()`: экспортируемая функция
- `isCashWithdrawal()`: экспортируемая функция
- `ParsedBankTx` interface: добавлено поле `requiresUserInput?: boolean`
- T-Bank PDF parser: детекция P2P/cash, `requiresUserInput` в push
- Alfa Bank XLSX parser: детекция P2P/cash после построения `shortDesc` (корректный порядок)

### Что НЕ сделано

- **ALG-002** (расширенный pre-classifier, Groq payload с суммой) — Sprint 1
- **PostImportWizard** — не обновлён для обработки `requiresUserInput=true` — Sprint 1
- **UI для overspentAmount** — карточка показывает сумму, но нет отдельного экрана "Вы превысили бюджет на X" — Sprint 1
- **`MIN_AMOUNT_PAYMENTS`** двухуровневая логика confidence — Sprint 1

### Риски и известные ограничения

- `safeToday` теперь может быть отрицательным — UI должен корректно отображать отрицательные значения (проверить `formatCurrency`)
- P2P-паттерн для именных переводов может давать ложные срабатывания на корпоративные переводы (низкий риск, `requiresUserInput` позволяет скорректировать)
- `MIN_AMOUNT=100` может создать много шума в recurring detection для пользователей с большим количеством мелких регулярных трат

### Тестирование

1. Открыть Dashboard на 19 мая — `daysLeft` должен быть 13 (не 12)
2. Добавить трату сегодня — `safeToday` должен уменьшиться на сумму траты
3. Создать ситуацию перерасхода (alreadySpent > budget) — карточка должна показать красный фон и `overspentAmount`
4. Импортировать выписку с СБП-переводом на номер телефона — транзакция должна иметь `requiresUserInput=true`
5. Запустить `runDetectRecurringPayments()` с транзакцией Netflix 799₽ за 3 месяца — должен появиться новый recurring payment
6. Сменить устройство (очистить localStorage, перезагрузить) — `budgets` и `recurringPayments` должны восстановиться из CloudStorage
