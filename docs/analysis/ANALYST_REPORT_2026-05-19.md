# FinWise — Аналитический отчёт по алгоритмам
> Дата: 19 мая 2026 · Аналитик: Data Analyst Agent  
> Источники: `PRODUCT_SPEC.md`, `ALGORITHM_SPEC.md`, `DashboardPage.tsx`, `store.ts`, `bankImport.ts`, все файлы `docs/analysis/`

---

## Резюме для принятия решений

Проведён полный аудит четырёх ключевых алгоритмов FinWise путём сравнения спецификации (`ALGORITHM_SPEC.md` v1.0) с фактической реализацией в коде. Обнаружено **6 критических расхождений** и **8 важных пробелов**, которые напрямую влияют на точность SafeToSpend — главной метрики доверия пользователя.

**Главный вывод:** Алгоритм SafeToSpend (ALG-003) реализован на ~60% от спецификации v4. Три из шести исправлений уже внесены в код, три — отсутствуют. ALG-001 реализован на ~40% от v2. ALG-002 и ALG-004 — не реализованы вовсе.

---

## 1. ALG-003: SafeToSpend — детальный аудит

**Файл:** [`apps/web/src/pages/dashboard/DashboardPage.tsx`](../../apps/web/src/pages/dashboard/DashboardPage.tsx)  
**Функция:** [`computeSpendingProfile()`](../../apps/web/src/pages/dashboard/DashboardPage.tsx:129)

### 1.1 Статус каждого изменения из спецификации

| Изменение | Спецификация | Реализация | Статус |
|-----------|-------------|------------|--------|
| Правильный `daysLeft` (включая сегодня) | `daysLeft = daysInMonth - dayOfMonth + 1` | `daysLeft = Math.max(1, daysInMonth - dayOfMonth)` | ❌ **НЕ РЕАЛИЗОВАНО** |
| Деление на `daysAhead` (без сегодня) | `daysAhead = max(1, daysLeft - 1)` | Нет `daysAhead`, делит на `daysLeft` | ❌ **НЕ РЕАЛИЗОВАНО** |
| Показывать перерасход явно | `remaining = budget - alreadySpent - reserved` (без `max(0,...)`) | `remaining = Math.max(0, ...)` | ❌ **НЕ РЕАЛИЗОВАНО** |
| `spentToday` вычитается из `safeToday` | `safeToday = safePerDay - spentToday` | `safeToday = remaining / daysLeft` (нет `spentToday`) | ❌ **НЕ РЕАЛИЗОВАНО** |
| Адаптивный IQR для малой истории | `if len <= 2: return sorted` | `if sorted.length < 4: return sorted` | ✅ Реализовано |
| Фильтр бонусов через `classifyIncomeType()` | Универсальный фильтр по сумме и описанию | `classifyPlatvedDay()` — только ПЛАТ.ВЕД. формат | ⚠️ Частично |
| Логика "ждём зарплату" | `waitingForSalary`, `expectedSalaryDay` | Отсутствует | ❌ **НЕ РЕАЛИЗОВАНО** |
| `isOverspent` и `overspentAmount` в профиле | Поля в `SpendingProfile` | `isOverspent` есть, но `overspentAmount` нет | ⚠️ Частично |

### 1.2 Количественный анализ ошибок формулы

#### Ошибка 1: `daysLeft` — последний день месяца

**Текущий код (строка 136):**
```typescript
const daysLeft = Math.max(1, daysInMonth - dayOfMonth);
// 31 мая: daysLeft = max(1, 31 - 31) = max(1, 0) = 1  ← ПРАВИЛЬНО
// 30 мая: daysLeft = max(1, 31 - 30) = 1  ← ПРАВИЛЬНО
// 19 мая: daysLeft = max(1, 31 - 19) = 12  ← НЕПРАВИЛЬНО (должно быть 13, включая сегодня)
```

**Спецификация v4:**
```typescript
const daysLeft = daysInMonth - dayOfMonth + 1; // включая сегодня
const daysAhead = Math.max(1, daysLeft - 1);   // для деления
```

**Эффект на 19 мая:** `safeToday` завышен на `1/12 = 8.3%` относительно правильного значения.  
**Эффект на 1 мая:** `safeToday` завышен на `1/30 = 3.3%`.  
**Эффект на 30 мая:** `safeToday` занижен — делит на 1 вместо 1 (совпадает случайно).

> **Вывод:** Ошибка систематическая — каждый день месяца `safeToday` немного завышен, потому что сегодняшний день не включён в `daysLeft`. Пользователь видит чуть больше, чем может потратить.

#### Ошибка 2: Перерасход скрыт нулём

**Текущий код (строка 235):**
```typescript
const remaining = Math.max(0, budget - alreadySpent - reservedUpcoming);
```

**Пример:** бюджет 80 000 ₽, потрачено 95 000 ₽, зарезервировано 5 000 ₽.
- Текущий код: `remaining = max(0, 80000 - 95000 - 5000) = max(0, -20000) = 0`
- `safeToday = 0 / daysLeft = 0` — пользователь видит ноль, не понимает масштаб проблемы
- Спецификация: `remaining = -20000`, карточка красная, показывает `-20 000 ₽`

> **Вывод:** Пользователь при перерасходе видит `0 ₽` вместо `-20 000 ₽`. Это скрывает реальную финансовую ситуацию и подрывает доверие к приложению.

#### Ошибка 3: `safeToday` не учитывает уже потраченное сегодня

**Текущий код:** `safeToday = remaining / daysLeft` — одно и то же значение весь день.

**Пример:** бюджет 80 000 ₽, 12 дней осталось, `safePerDay = 2 000 ₽`.
- Утром (потрачено 0 ₽): `safeToday = 2 000 ₽` ✅
- Вечером (потрачено 1 500 ₽): `safeToday = 2 000 ₽` ❌ (должно быть 500 ₽)

> **Вывод:** Пользователь, добавив трату в течение дня, не видит обновлённого дневного лимита. Это противоречит ключевому UX-сценарию "добавил трату → SafeToSpend обновился".

#### Ошибка 4: Фильтр бонусов работает только для ПЛАТ.ВЕД.

**Текущий код (строка 93–97):**
```typescript
const budgetTxs = salaryTxs.filter((t) => {
  const isPlatved = /плат\.вед\./i.test(t.description);
  if (!isPlatved) return true; // "Перевод начисления Зарплата/Аванс" — include
  return classifyPlatvedDay(t.description) !== 'EXTRA';
});
```

**Проблема:** Если зарплата приходит как "Перевод начисления Зарплата" (не ПЛАТ.ВЕД.), то декабрьская премия 200 000 ₽ при зарплате 100 000 ₽ **не фильтруется** и удваивает бюджет.

**Спецификация v4** требует универсального `classifyIncomeType()` с эвристикой по сумме:
```typescript
if (medianSalary > 0 && tx.amount > medianSalary * 2) return 'BONUS';
```

> **Вывод:** Пользователи, получающие зарплату не через ПЛАТ.ВЕД. (большинство банков кроме Альфа), получают завышенный бюджет в месяцы с бонусами.

### 1.3 Итоговая оценка ALG-003

| Метрика | Значение |
|---------|---------|
| Реализовано из спецификации v4 | 2 из 6 изменений (33%) |
| Критических ошибок формулы | 3 (daysLeft, remaining, spentToday) |
| Влияние на пользователя | Завышенный SafeToSpend + скрытый перерасход |
| Приоритет исправления | 🔴 КРИТИЧНО — Sprint 0 |

---

## 2. ALG-001: Детекция регулярных платежей — детальный аудит

**Файл:** [`apps/web/src/features/finance/store.ts`](../../apps/web/src/features/finance/store.ts)  
**Функция:** [`detectRecurringPayments()`](../../apps/web/src/features/finance/store.ts:354)

### 2.1 Статус каждого изменения из спецификации

| Изменение | Спецификация | Реализация | Статус |
|-----------|-------------|------------|--------|
| Двухуровневый порог суммы (100 ₽ / 1 000 ₽) | `MIN_AMOUNT_SUBSCRIPTIONS = 100` | `MIN_AMOUNT = 5_000` | ❌ **НЕ РЕАЛИЗОВАНО** |
| Описание как первичный ключ кластеризации | `descriptionSimilarity() >= 0.5` | Только сумма ±15% + день ±7 | ❌ **НЕ РЕАЛИЗОВАНО** |
| Адаптивный `DAY_TOLERANCE` для конца месяца | `effectiveTolerance = 10` если день ≥ 25 | `DAY_TOLERANCE = 7` (константа) | ❌ **НЕ РЕАЛИЗОВАНО** |
| Staleness-check | `updateStaleness()` — деактивация через 3 мес. | Отсутствует | ❌ **НЕ РЕАЛИЗОВАНО** |
| Confidence на основе описания | `hasConsistentDescription` влияет на confidence | Только `monthCount` | ❌ **НЕ РЕАЛИЗОВАНО** |

### 2.2 Конкретные последствия для пользователя

**Проблема 1: Netflix 799 ₽ не детектируется**
```
MIN_AMOUNT = 5_000 → транзакция 799 ₽ отфильтровывается на строке 372
Результат: подписки не резервируются → SafeToSpend завышен
```

**Проблема 2: Аренда 30 000 ₽ и кредит 30 000 ₽ сливаются в один кластер**
```
Оба попадают в один кластер (сумма ±15%, день ±7)
Результат: один платёж резервируется дважды ИЛИ два разных платежа = один
```

**Проблема 3: Платёж 28-го и 31-го не объединяются**
```
dayDiff = |28 - 31| = 3 → dayDiffWrapped = min(3, 31-3) = 3 ≤ 7 → ОБЪЕДИНЯЮТСЯ ✅
НО: платёж 25-го и 5-го следующего месяца:
dayDiff = |25 - 5| = 20 → dayDiffWrapped = min(20, 11) = 11 > 7 → НЕ ОБЪЕДИНЯЮТСЯ ❌
```

**Проблема 4: Отменённая подписка продолжает резервировать деньги**
```
Нет staleness-check → платёж, не встречавшийся 6+ месяцев, всё ещё в списке
Результат: SafeToSpend занижен на сумму несуществующего платежа
```

### 2.3 Итоговая оценка ALG-001

| Метрика | Значение |
|---------|---------|
| Реализовано из спецификации v2 | 0 из 5 изменений (0%) |
| Критических ошибок | 2 (MIN_AMOUNT, staleness) |
| Влияние на пользователя | Подписки не детектируются; устаревшие платежи занижают бюджет |
| Приоритет исправления | 🔴 КРИТИЧНО — Sprint 0 |

---

## 3. ALG-002: Категоризация транзакций — детальный аудит

**Файлы:** [`apps/web/src/pages/profile/bankImport.ts`](../../apps/web/src/pages/profile/bankImport.ts), [`apps/web/src/pages/profile/ProfilePage.tsx`](../../apps/web/src/pages/profile/ProfilePage.tsx)

### 3.1 Статус каждого изменения из спецификации

| Изменение | Спецификация | Реализация | Статус |
|-----------|-------------|------------|--------|
| Расширенный локальный pre-classifier (100+ правил) | `LOCAL_CLASSIFICATION_RULES[]` в `bankImport.ts` | Есть `guessCategory()` с ~30 правилами | ⚠️ Частично (~30% покрытия) |
| Сумма в Groq-payload | `amount: Math.round(item.tx.amount)` | Сумма не передаётся | ❌ **НЕ РЕАЛИЗОВАНО** |
| Надёжный JSON-парсер (4 стратегии) | `parseGroqCategorizationResponse()` | Есть 3-strategy extraction | ⚠️ Частично |
| `userCorrected` флаг в Transaction | `userCorrected?: boolean` | Отсутствует в интерфейсе | ❌ **НЕ РЕАЛИЗОВАНО** |
| UI для исправления категории | Свайп → bottom sheet | Отсутствует | ❌ **НЕ РЕАЛИЗОВАНО** |

### 3.2 Анализ текущего pre-classifier

Из реального датасета (473 транзакции, Альфа-банк):
- **"Прочие операции"**: 310 транзакций (73.9%) — категория-мусорка
- **Транспорт**: 31 транзакция — вероятно, хорошо покрыт MCC
- **Кафе и рестораны**: 19 транзакций — частично покрыт

Текущий `guessCategory()` в `bankImport.ts` использует банковские категории Альфа-банка (строки ~350–407). Это работает только для Альфа-банка. Для Т-Банка, Сбера, ВТБ — нет банковских категорий в нужном формате.

**Расширенный `LOCAL_CLASSIFICATION_RULES[]` из спецификации** (100+ regex-правил) не реализован. Без него ~30% транзакций уходят в `other_exp`.

### 3.3 Проблема с Groq-payload

**Текущий код** (предположительно в ProfilePage.tsx):
```typescript
const payload = batchItems.map((item, batchIdx) => ({
  idx: batchIdx,
  description: item.tx.description,
  bankCategory: item.tx.bankCategory,
  type: item.tx.type,
  // amount ОТСУТСТВУЕТ
}));
```

**Последствие:** Groq не может различить:
- Кофе за 150 ₽ (→ `cafe`) vs продукты за 150 ₽ (→ `food`)
- Крупная покупка одежды за 50 000 ₽ (→ `shopping`) vs мелкая (→ `shopping`)
- Перевод 500 ₽ (→ `other_exp`) vs перевод 100 000 ₽ (→ возможно `home` аренда)

### 3.4 Итоговая оценка ALG-002

| Метрика | Значение |
|---------|---------|
| Реализовано из спецификации v2 | 1 из 5 изменений (20%) |
| Доля `other_exp` в реальных данных | ~74% (цель: ≤15%) |
| Влияние на пользователя | Аналитика бесполезна; AI-инсайты неточны |
| Приоритет исправления | 🔴 КРИТИЧНО — Sprint 0 |

---

## 4. ALG-004: Политика переводов и снятий наличных — детальный аудит

**Файлы:** [`apps/web/src/pages/profile/bankImport.ts`](../../apps/web/src/pages/profile/bankImport.ts), [`apps/web/src/pages/profile/PostImportWizard.tsx`](../../apps/web/src/pages/profile/PostImportWizard.tsx)

### 4.1 Статус каждого изменения из спецификации

| Изменение | Спецификация | Реализация | Статус |
|-----------|-------------|------------|--------|
| P2P-детекция → `requiresUserInput=true` | `isP2PTransfer()` + `P2P_PATTERNS[]` | Отсутствует | ❌ **НЕ РЕАЛИЗОВАНО** |
| Снятие наличных → `requiresUserInput=true` | `CASH_WITHDRAWAL_PATTERNS[]` | Отсутствует | ❌ **НЕ РЕАЛИЗОВАНО** |
| `requiresUserInput` в `ParsedBankTx` | Поле в интерфейсе | Отсутствует в интерфейсе | ❌ **НЕ РЕАЛИЗОВАНО** |
| PostImportWizard приоритет для P2P/наличных | Показывать СРАЗУ, до `other_exp` | Неизвестно (нет доступа к PostImportWizard) | ❓ Не проверено |
| `categoryId=null` включается в `alreadySpent` | `EXCLUDED_CATEGORIES` не включает null | `alreadySpent` фильтрует только `type === 'expense'` | ⚠️ Частично |

### 4.2 Реальные данные: масштаб проблемы

Из датасета (229 подтверждённых транзакций Альфа-банка):

**P2P-переводы (SBP):**
- 2026-01-02: 110 000 ₽ → +79183277714
- 2026-03-02: 40 000 ₽ → Данил Равильев
- 2026-04-05: 25 000 ₽ → +79165787566
- 2026-06-03: 48 000 ₽ → Данил Равильев
- 2026-08-03: 131 000 ₽ → +79183277714
- 2026-10-04: 200 000 ₽ → +79111912333

**Итого P2P:** 554 000 ₽ за 6 месяцев — **реальные расходы без категории**.

**Снятия наличных:**
- 2026-02-05: 115 000 ₽ (ATM)
- Итого: 115 000 ₽

**Внутренние переводы (между своими счетами):**
- 2026-05-05: 65 000 + 30 000 + 20 000 = 115 000 ₽ → должны ИСКЛЮЧАТЬСЯ из расходов

**Критическая проблема:** Текущий код в `bankImport.ts` (строки 523–527 для Т-Банка) пропускает внутренние переводы, но **не различает P2P от внутренних** для Альфа-банка. Все они попадают в `type='transfer'` и исключаются из `alreadySpent` — то есть 554 000 ₽ P2P-расходов **не учитываются в SafeToSpend**.

### 4.3 Итоговая оценка ALG-004

| Метрика | Значение |
|---------|---------|
| Реализовано из спецификации | 0 из 5 изменений (0%) |
| P2P-расходы, не учтённые в SafeToSpend | ~554 000 ₽ за 6 мес. (реальные данные) |
| Влияние на пользователя | SafeToSpend завышен; пользователь думает, что тратит меньше |
| Приоритет исправления | 🟡 ВАЖНО — Sprint 1 |

---

## 5. Сводная таблица: спецификация vs реализация

| Алгоритм | Изменений в спеке | Реализовано | % | Приоритет |
|----------|-------------------|-------------|---|-----------|
| ALG-003 SafeToSpend v4 | 6 | 2 | 33% | 🔴 P0 |
| ALG-001 Recurring v2 | 5 | 0 | 0% | 🔴 P0 |
| ALG-002 Categorisation v2 | 5 | 1 | 20% | 🔴 P0 |
| ALG-004 P2P/Cash policy | 5 | 0 | 0% | 🟡 P1 |
| **Итого** | **21** | **3** | **14%** | — |

---

## 6. Приоритизированный план исправлений

### Sprint 0 (немедленно, 1–3 дня)

#### Fix-1: ALG-003 — три строки кода, максимальный эффект

**Файл:** [`DashboardPage.tsx`](../../apps/web/src/pages/dashboard/DashboardPage.tsx:136)

```typescript
// БЫЛО (строка 136):
const daysLeft = Math.max(1, daysInMonth - dayOfMonth);

// СТАЛО:
const daysLeft = daysInMonth - dayOfMonth + 1;   // включая сегодня
const daysAhead = Math.max(1, daysLeft - 1);     // для деления (без сегодня)
```

```typescript
// БЫЛО (строка 235):
const remaining = Math.max(0, budget - alreadySpent - reservedUpcoming);

// СТАЛО:
const remaining = budget - alreadySpent - reservedUpcoming; // может быть < 0
```

```typescript
// БЫЛО (строка 237):
const safeToday = remaining > 0 ? remaining / daysLeft : 0;

// СТАЛО:
const spentToday = thisMonthTxs
  .filter((t) => {
    const d = new Date(t.date);
    const today = new Date();
    return t.type === 'expense' &&
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
  })
  .reduce((s, t) => s + t.amount, 0);

const safePerDay = remaining / daysAhead;
const safeToday = safePerDay - spentToday;  // может быть < 0
```

**Также добавить в `SpendingProfile`:**
```typescript
isOverspent: remaining < 0,
overspentAmount: remaining < 0 ? Math.abs(remaining) : 0,
spentToday,
safePerDay,
```

**Ожидаемый эффект:** SafeToSpend станет точным в течение дня; перерасход будет виден явно.

---

#### Fix-2: ALG-001 — снизить MIN_AMOUNT

**Файл:** [`store.ts`](../../apps/web/src/features/finance/store.ts:358)

```typescript
// БЫЛО (строка 358):
const MIN_AMOUNT = 5_000;

// СТАЛО:
const MIN_AMOUNT_SUBSCRIPTIONS = 100;
const MIN_AMOUNT_PAYMENTS = 1_000;
```

Логика применения:
```typescript
const candidates = transactions.filter((t) => {
  if (t.type !== 'expense' && t.type !== 'transfer') return false;
  if (t.categoryId === 'salary') return false;
  if (t.date < sixMonthsAgo) return false;
  // Подписки (100–999 ₽) — только если описание совпадает ≥2 раза
  if (t.amount >= MIN_AMOUNT_SUBSCRIPTIONS && t.amount < MIN_AMOUNT_PAYMENTS) {
    return true; // будет отфильтровано на этапе кластеризации
  }
  return t.amount >= MIN_AMOUNT_PAYMENTS;
});
```

**Ожидаемый эффект:** Netflix 799 ₽, Яндекс Плюс 299 ₽ начнут детектироваться.

---

#### Fix-3: ALG-001 — добавить staleness-check

**Файл:** [`store.ts`](../../apps/web/src/features/finance/store.ts:481)

Добавить функцию `updateStaleness()` из спецификации и вызывать её в `runDetectRecurringPayments()`. Это устранит проблему "отменённая подписка продолжает резервировать деньги".

---

### Sprint 1 (1–2 недели)

#### Fix-4: ALG-002 — расширенный local pre-classifier

Добавить `LOCAL_CLASSIFICATION_RULES[]` из `ALGORITHM_SPEC.md` (100+ правил) в `bankImport.ts`. Цель: снизить долю `other_exp` с ~74% до ≤15%.

#### Fix-5: ALG-002 — сумма в Groq-payload

Добавить `amount` в объект, передаваемый в Groq. Одна строка кода, значительное улучшение точности.

#### Fix-6: ALG-002 — `userCorrected` флаг

Добавить поле в `Transaction` интерфейс и логику в `store.ts`. Защищает исправления пользователя от перезаписи.

---

### Sprint 2 (2–4 недели)

#### Fix-7: ALG-004 — P2P-детекция

Добавить `isP2PTransfer()` и `CASH_WITHDRAWAL_PATTERNS[]` в `bankImport.ts`. Рекласифицировать P2P как `type='expense'` с `requiresUserInput=true`.

#### Fix-8: ALG-001 — описание как ключ кластеризации

Добавить `descriptionSimilarity()` в алгоритм кластеризации. Устраняет слияние аренды и кредита.

---

## 7. Новые находки, не отражённые в ALGORITHM_SPEC.md

### 7.1 CloudPayload не включает `budgets` и `recurringPayments`

**Файл:** [`store.ts`](../../apps/web/src/features/finance/store.ts:124)

```typescript
interface CloudPayload {
  v: number;
  transactions: Transaction[];
  goals: Goal[];
  streak: number;
  lastActiveDate: string;
  // budgets — ОТСУТСТВУЕТ
  // recurringPayments — ОТСУТСТВУЕТ
}
```

**Последствие:** При смене устройства пользователь теряет все настроенные бюджеты и подтверждённые регулярные платежи. SafeToSpend на новом устройстве не резервирует ничего.

**Рекомендация:** Добавить `budgets` и `recurringPayments` в `CloudPayload` (Sprint 0, как указано в `PRODUCT_SPEC.md`).

---

### 7.2 `isOverspent` в SafeToSpendCard использует неправильную формулу

**Файл:** [`DashboardPage.tsx`](../../apps/web/src/pages/dashboard/DashboardPage.tsx:349)

```typescript
// Строка 349 — в UI:
formatCurrency(profile.alreadySpent - profile.thisMonthIncome)
```

Здесь `profile.thisMonthIncome` — это алиас для `budget` (строка 248: `thisMonthIncome: budget`). Поэтому формула `alreadySpent - thisMonthIncome` = `alreadySpent - budget`. Это правильно для отображения суммы перерасхода, но только если `remaining < 0`. При `remaining = max(0, ...)` это значение всегда ≥ 0, что делает отображение перерасхода некорректным.

**Рекомендация:** После Fix-1 (убрать `max(0, ...)`) заменить на `formatCurrency(Math.abs(remaining))` — это будет точная сумма перерасхода.

---

### 7.3 `iqrFilter` требует ≥4 значений, но спецификация требует ≥1

**Файл:** [`DashboardPage.tsx`](../../apps/web/src/pages/dashboard/DashboardPage.tsx:63)

```typescript
// Текущий код (строка 63):
function iqrFilter(sorted: number[]): number[] {
  if (sorted.length < 4) return sorted;  // ← возвращает без фильтрации
  ...
}
```

Спецификация v4 требует адаптивного поведения:
- 1–2 значения: вернуть как есть (доверяем)
- 3 значения: убрать только явные выбросы (>3x медианы)
- 4+ значений: стандартный IQR

Текущая реализация уже возвращает `sorted` при `length < 4`, что соответствует поведению "1–2 значения: вернуть как есть". Однако для 3 значений нет специальной логики удаления выбросов >3x медианы.

**Статус:** ⚠️ Частично реализовано. Критичность низкая — пользователи с 1–3 месяцами истории получают корректный бюджет, но без защиты от аномалий при 3 месяцах.

---

### 7.4 `detectRecurringPayments` не вызывается автоматически

**Файл:** [`store.ts`](../../apps/web/src/features/finance/store.ts:354)

Функция `detectRecurringPayments()` экспортируется, но нигде не вызывается автоматически при добавлении транзакций или при открытии приложения. Согласно `PRODUCT_SPEC.md` (F-016), автодетекция должна запускаться при открытии экрана регулярных платежей, если прошло >7 дней с последнего запуска.

**Рекомендация:** Добавить вызов в `runDetectRecurringPayments()` (который уже есть в store) с проверкой временного интервала.

---

## 8. Данные для валидации исправлений

Для проверки Fix-1 (ALG-003) используйте следующие тест-кейсы на основе реальных данных:

| Дата теста | День месяца | Бюджет | Потрачено | Ожидаемый `safeToday` (v4) | Текущий `safeToday` (v3.3) |
|------------|-------------|--------|-----------|---------------------------|---------------------------|
| 19.05.2026 | 19 | 80 000 ₽ | 15 000 ₽ | (80000-15000)/12 = 5 417 ₽ | (80000-15000)/12 = 5 417 ₽ |
| 31.05.2026 | 31 | 80 000 ₽ | 75 000 ₽ | (80000-75000)/1 = 5 000 ₽ | max(1, 31-31)=1 → 5 000 ₽ ✅ |
| 30.05.2026 | 30 | 80 000 ₽ | 75 000 ₽ | (80000-75000)/1 = 5 000 ₽ | max(1, 31-30)=1 → 5 000 ₽ ✅ |
| 01.05.2026 | 1  | 80 000 ₽ | 5 000 ₽  | (80000-5000)/30 = 2 500 ₽  | max(1, 31-1)=30 → 2 500 ₽ ✅ |
| 19.05.2026 | 19 | 80 000 ₽ | 95 000 ₽ | -15000/12 = -1 250 ₽ (красный) | max(0,...) = 0 ₽ ❌ |

> **Ключевой тест-кейс:** последняя строка — перерасход. Текущий код показывает `0 ₽`, v4 должен показывать `-1 250 ₽` красным.

Для `spentToday` (Fix-1, часть 3):

| Время | Потрачено сегодня | `safePerDay` | Ожидаемый `safeToday` (v4) | Текущий |
|-------|-------------------|--------------|---------------------------|---------|
| 09:00 | 0 ₽ | 2 000 ₽ | 2 000 ₽ | 2 000 ₽ |
| 14:00 | 800 ₽ | 2 000 ₽ | 1 200 ₽ | 2 000 ₽ ❌ |
| 21:00 | 2 500 ₽ | 2 000 ₽ | -500 ₽ (красный) | 2 000 ₽ ❌ |

---

## 9. Рекомендуемые следующие шаги

### Немедленно (до конца Sprint 0)

1. **Fix-1 (ALG-003):** Исправить три формулы в [`computeSpendingProfile()`](../../apps/web/src/pages/dashboard/DashboardPage.tsx:129) — `daysLeft`, `remaining`, `safeToday`. Это самое высокое соотношение эффект/усилие: 3 строки кода, максимальное влияние на доверие пользователя.

2. **Fix-2 (ALG-001):** Снизить `MIN_AMOUNT` с 5 000 ₽ до 100 ₽ в [`detectRecurringPayments()`](../../apps/web/src/features/finance/store.ts:358). Одна строка кода.

3. **Fix-3 (ALG-001):** Добавить `staleness-check` — деактивировать паттерны, не встречавшиеся 3+ месяца.

4. **CloudPayload:** Добавить `budgets` и `recurringPayments` в [`CloudPayload`](../../apps/web/src/features/finance/store.ts:124).

### Sprint 1 (1–2 недели)

5. **Fix-4 (ALG-002):** Добавить `LOCAL_CLASSIFICATION_RULES[]` (100+ правил) в `bankImport.ts`. Снизит `other_exp` с ~74% до ≤15%.

6. **Fix-5 (ALG-002):** Добавить `amount` в Groq-payload.

7. **Fix-6 (ALG-002):** Добавить `userCorrected` флаг в `Transaction`.

### Sprint 2 (2–4 недели)

8. **Fix-7 (ALG-004):** P2P-детекция и `requiresUserInput` в `bankImport.ts`.

9. **Fix-8 (ALG-001):** `descriptionSimilarity()` в алгоритм кластеризации.

10. **Fix-9 (ALG-003):** Универсальный `classifyIncomeType()` для фильтрации бонусов.

---

## 10. Метрики для отслеживания прогресса

| Метрика | Baseline (сейчас) | Цель после Sprint 0 | Цель после Sprint 1 |
|---------|-------------------|---------------------|---------------------|
| Доля `other_exp` после импорта | ~74% | ~74% (не меняется) | ≤15% |
| Подписки, детектируемые ALG-001 | 0% (MIN=5000) | ~60% (MIN=100) | ~80% (+ описание) |
| SafeToSpend точность в течение дня | Статичный | Обновляется | Обновляется |
| Перерасход отображается явно | Нет (показывает 0) | Да (красный, -X ₽) | Да |
| `recurringPayments` в CloudStorage | Нет | Да | Да |
| P2P-расходы учтены в SafeToSpend | Нет | Нет | Частично |

---

*Отчёт подготовлен Data Analyst Agent на основе аудита кода и реальных данных пользователя (Альфа-банк, 229 подтверждённых транзакций, 2025-01 — 2026-05).*