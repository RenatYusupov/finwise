# FinWise — Спецификация улучшения алгоритмов
> Версия 1.1 · 19 мая 2026 · Приоритет: Sprint 0
> Аудит реализации: [`docs/analysis/ANALYST_REPORT_2026-05-19.md`](docs/analysis/ANALYST_REPORT_2026-05-19.md)
> Эти четыре алгоритма — ядро продукта. Их точность определяет доверие пользователя.

### Статус реализации (аудит 19.05.2026)

| Алгоритм | Изменений в спеке | Реализовано | % | Приоритет |
|----------|-------------------|-------------|---|-----------|
| ALG-003 SafeToSpend v4 | 6 | 2 | 33% | 🔴 P0 |
| ALG-001 Recurring v2 | 5 | 0 | 0% | 🔴 P0 |
| ALG-002 Categorisation v2 | 5 | 1 | 20% | 🔴 P0 |
| ALG-004 P2P/Cash policy | 5 | 0 | 0% | 🟡 P1 |

> ⚠️ **Критично:** ALG-003 содержит 3 ошибки формулы, которые завышают SafeToSpend и скрывают перерасход. ALG-001 не детектирует подписки (Netflix 799 ₽) из-за `MIN_AMOUNT = 5_000`. Подробности — в отчёте аналитика.

---

## Контекст: почему это важно

Пользователь видит три ключевых числа:
1. **SafeToSpend** — "сколько можно потратить сегодня"
2. **Категория транзакции** — "куда уходят деньги"
3. **Регулярные платежи** — "что зарезервировано на конец месяца"

Если хотя бы одно из них неточное — пользователь перестаёт доверять приложению и уходит.

---

## ALG-001: Детекция регулярных платежей (v2)

**Файл**: [`apps/web/src/features/finance/store.ts`](apps/web/src/features/finance/store.ts)
**Функция**: `detectRecurringPayments()` (строка ~354)

### Диагностика текущих проблем

| # | Проблема | Симптом для пользователя | Причина в коде |
|---|----------|--------------------------|----------------|
| 1 | Подписки не детектируются | Netflix 799 ₽ не резервируется | `MIN_AMOUNT = 5_000` — слишком высокий порог |
| 2 | Разные платежи сливаются в кластер | Аренда 30 000 ₽ и кредит 30 000 ₽ = один "регулярный платёж" | Нет учёта описания при кластеризации |
| 3 | Платежи конца месяца не ловятся | Платёж 28-го и 31-го не объединяются | `DAY_TOLERANCE = 7` не покрывает разницу 28→31 |
| 4 | Устаревшие паттерны резервируют деньги | Отменённая подписка всё ещё вычитается из бюджета | Нет staleness-check |
| 5 | Разовые крупные траты = "регулярные" | Покупка телефона за 80 000 ₽ детектируется как регулярная | Нет проверки на уникальность описания |

### Решение v2

#### Изменение 1: Двухуровневый порог суммы

```typescript
// БЫЛО:
const MIN_AMOUNT = 5_000;

// СТАЛО:
const MIN_AMOUNT_SUBSCRIPTIONS = 100;   // подписки: Netflix, Яндекс Плюс, Spotify
const MIN_AMOUNT_PAYMENTS = 1_000;      // обязательные платежи: аренда, кредит, ЖКХ

// Логика: если amount >= 100 И amount < 1000 → только если совпадает описание (≥2 раза)
// Если amount >= 1000 → стандартная кластеризация
```

#### Изменение 2: Описание как первичный ключ кластеризации

```typescript
// Новый порядок проверок при кластеризации:

function descriptionSimilarity(a: string, b: string): number {
  // Нормализация: lowercase, убрать цифры и спецсимволы
  const normalize = (s: string) => s.toLowerCase().replace(/[\d\W]+/g, ' ').trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  // Простая метрика: доля общих слов
  const wordsA = new Set(na.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(nb.split(' ').filter(w => w.length > 2));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

// При кластеризации:
// 1. Если descriptionSimilarity(tx.description, clusterLabel) >= 0.5
//    → объединить в кластер (даже если суммы отличаются на >15%)
// 2. Если описания не совпадают (similarity < 0.5)
//    → проверить сумму ±15% И день ±effectiveTolerance
//    → только тогда объединять
// 3. Если описания совпадают, но суммы отличаются >50% → НЕ объединять
//    (это разные платежи с похожим названием)
```

#### Изменение 3: Адаптивный DAY_TOLERANCE для конца месяца

```typescript
// БЫЛО:
const DAY_TOLERANCE = 7;
const dayDiffWrapped = Math.min(dayDiff, 31 - dayDiff);
if (dayDiffWrapped > DAY_TOLERANCE) continue;

// СТАЛО:
const isEndOfMonth = (day: number) => day >= 25;
const effectiveTolerance = (isEndOfMonth(txDay) || isEndOfMonth(clusterMedianDay))
  ? 10   // конец месяца: ±10 дней (покрывает 25→31→1→5 следующего месяца)
  : 7;   // обычный день: ±7 дней (без изменений)

// Дополнительно: для платежей конца месяца проверять переход через границу месяца
// Пример: день 28 одного месяца и день 2 следующего = разница 4 дня (не 26)
// Текущий код уже делает Math.min(dayDiff, 31 - dayDiff) — это правильно, оставить
```

#### Изменение 4: Staleness-check — деактивация устаревших паттернов

```typescript
// Добавить в runDetectRecurringPayments() после детекции новых кандидатов:

function updateStaleness(
  existing: RecurringPayment[],
  now: Date
): RecurringPayment[] {
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();

  return existing.map(p => {
    if (!p.lastSeenAt) return p;
    if (p.lastSeenAt < threeMonthsAgo && !p.dismissedByUser) {
      // Не видели 3+ месяца → автоматически деактивировать
      return { ...p, dismissedByUser: true };
    }
    if (p.lastSeenAt < twoMonthsAgo && p.confidence !== 'low') {
      // Не видели 2+ месяца → понизить уверенность
      return { ...p, confidence: 'low' as const };
    }
    return p;
  });
}

// Вызывать в runDetectRecurringPayments():
// set((s) => ({
//   recurringPayments: [
//     ...updateStaleness(s.recurringPayments, new Date()),
//     ...newCandidates,
//   ],
// }));
```

#### Изменение 5: Confidence на основе описания + количества месяцев

```typescript
// БЫЛО:
const confidence = monthCount >= 4 ? 'high' : monthCount >= 3 ? 'medium' : 'low';

// СТАЛО:
const hasConsistentDescription = /* descriptionSimilarity всех tx в кластере >= 0.6 */;

const confidence: RecurringPayment['confidence'] =
  (monthCount >= 4 && hasConsistentDescription) ? 'high'
  : (monthCount >= 3 || (monthCount >= 2 && hasConsistentDescription)) ? 'medium'
  : 'low';

// Правило резервирования в SafeToSpend:
// 'high' + confirmedByUser → резервируется автоматически
// 'medium' + confirmedByUser → резервируется
// 'low' → только после явного подтверждения пользователем
// 'high'/'medium' без confirmedByUser → показывается как предложение, НЕ резервируется
```

### Acceptance Criteria ALG-001

> **Статус реализации (аудит 19.05.2026):** 0 из 5 изменений реализовано. `MIN_AMOUNT = 5_000` в [`store.ts:358`](apps/web/src/features/finance/store.ts:358) блокирует детекцию подписок. Staleness-check отсутствует.

- [ ] Netflix 799 ₽ / Яндекс Плюс 299 ₽ детектируются при наличии 2+ месяцев истории
- [ ] Платёж 28-го и 31-го числа объединяются в один кластер
- [ ] Аренда 30 000 ₽ и кредит 30 000 ₽ с разными описаниями НЕ объединяются
- [ ] Паттерн, не встречавшийся 3+ месяца, автоматически деактивируется
- [ ] Разовая покупка (1 вхождение) никогда не попадает в recurring
- [ ] Тест: 6 месяцев аренды 25 000 ₽ → confidence = 'high', dayOfMonth = медиана дней

**Метрика**: Precision ≥ 85%, Recall ≥ 75% на тестовом датасете из 500 транзакций

---

## ALG-002: Категоризация транзакций (v2)

**Файлы**:
- [`apps/web/src/pages/profile/ProfilePage.tsx`](apps/web/src/pages/profile/ProfilePage.tsx) — `GROQ_CATEGORIZE_PROMPT`, `recategorizeWithGroq()`
- [`apps/web/src/pages/profile/bankImport.ts`](apps/web/src/pages/profile/bankImport.ts) — MCC-маппинг, `preClassify()`

### Диагностика текущих проблем

| # | Проблема | Симптом | Причина |
|---|----------|---------|---------|
| 1 | Много `other_exp` после импорта | ~30% транзакций без категории | Groq не получает контекст суммы; локальный классификатор неполный |
| 2 | Groq возвращает невалидный JSON | Категоризация падает молча | 3-strategy extraction недостаточно надёжна |
| 3 | Переводы на брокерский счёт = `investment` | Пополнение ИИС считается инвестдоходом | Промпт не различает направление перевода |
| 4 | Контекст суммы не используется | 500 ₽ и 50 000 ₽ в одном магазине = одна категория | Сумма не передаётся в Groq |
| 5 | Нет механизма исправления | Неправильная категория остаётся навсегда | Нет UI для редактирования категории |

### Решение v2

#### Изменение 1: Расширенный локальный pre-classifier

Добавить в [`bankImport.ts`](apps/web/src/pages/profile/bankImport.ts) перед вызовом Groq. Цель: покрыть 70%+ транзакций без AI.

```typescript
interface ClassificationRule {
  pattern: RegExp;
  categoryId: string;
  type?: 'expense' | 'income' | 'transfer';
  minAmount?: number;
  maxAmount?: number;
}

export const LOCAL_CLASSIFICATION_RULES: ClassificationRule[] = [
  // ── Еда (супермаркеты) ──────────────────────────────────────────────────────
  { pattern: /пятёрочка|пятерочка|pyaterochka/i, categoryId: 'food' },
  { pattern: /магнит(?!\.?\s*банк)/i, categoryId: 'food' },
  { pattern: /вкусвилл|вкус.?вилл/i, categoryId: 'food' },
  { pattern: /перекрёсток|перекресток/i, categoryId: 'food' },
  { pattern: /лента(?!\s*банк)/i, categoryId: 'food' },
  { pattern: /ашан|auchan/i, categoryId: 'food' },
  { pattern: /дикси|dixy/i, categoryId: 'food' },
  { pattern: /окей|o.?key\s+супер/i, categoryId: 'food' },
  { pattern: /глобус\s+гурмэ|globus/i, categoryId: 'food' },
  { pattern: /fix.?price|фикс.?прайс/i, categoryId: 'food' },
  { pattern: /metro.?cash|метро.?кэш/i, categoryId: 'food' },
  { pattern: /верный|красное.?белое|бристоль/i, categoryId: 'food' },
  { pattern: /азбука.?вкуса/i, categoryId: 'food' },
  { pattern: /спар|spar/i, categoryId: 'food' },

  // ── Кафе и доставка еды ─────────────────────────────────────────────────────
  { pattern: /самокат|samocat/i, categoryId: 'cafe' },
  { pattern: /яндекс.?еда|yandex.?food|eda\.yandex/i, categoryId: 'cafe' },
  { pattern: /delivery.?club|деливери.?клаб/i, categoryId: 'cafe' },
  { pattern: /мак.?доналдс|mcdonald/i, categoryId: 'cafe' },
  { pattern: /\bkfc\b|кфс/i, categoryId: 'cafe' },
  { pattern: /burger.?king|бургер.?кинг/i, categoryId: 'cafe' },
  { pattern: /starbucks|старбакс/i, categoryId: 'cafe' },
  { pattern: /coffee.?like|кофе.?лайк/i, categoryId: 'cafe' },
  { pattern: /шоколадница/i, categoryId: 'cafe' },
  { pattern: /domino.?pizza|домино.?пицца/i, categoryId: 'cafe' },
  { pattern: /папа.?джонс|papa.?john/i, categoryId: 'cafe' },
  { pattern: /додо.?пицца|dodo.?pizza/i, categoryId: 'cafe' },
  { pattern: /вкусно.?и.?точка/i, categoryId: 'cafe' },
  { pattern: /теремок/i, categoryId: 'cafe' },
  { pattern: /суши.?шоп|суши.?вок|суши.?маркет/i, categoryId: 'cafe' },
  { pattern: /кофемания|coffee.?mania/i, categoryId: 'cafe' },
  { pattern: /surf.?coffee/i, categoryId: 'cafe' },

  // ── Транспорт ───────────────────────────────────────────────────────────────
  { pattern: /яндекс.?такси|yandex.?taxi|ytaxi/i, categoryId: 'transport' },
  { pattern: /\buber\b|убер/i, categoryId: 'transport' },
  { pattern: /ситидрайв|citydrive/i, categoryId: 'transport' },
  { pattern: /делимобиль|delimobil/i, categoryId: 'transport' },
  { pattern: /яндекс.?драйв|yandex.?drive/i, categoryId: 'transport' },
  { pattern: /московское.?метро|мосметро|metro.?moscow/i, categoryId: 'transport' },
  { pattern: /\bржд\b|rzd|российские.?железные/i, categoryId: 'transport' },
  { pattern: /аэроэкспресс/i, categoryId: 'transport' },
  { pattern: /\bазс\b|лукойл|роснефть|газпромнефть|\bshell\b|\bbp\b/i, categoryId: 'transport' },
  { pattern: /мосгортранс|мострансавто/i, categoryId: 'transport' },
  { pattern: /каршеринг/i, categoryId: 'transport' },

  // ── Онлайн-шопинг ───────────────────────────────────────────────────────────
  { pattern: /wildberries|вайлдберриз|\bwb\b/i, categoryId: 'shopping' },
  { pattern: /\bozon\b|озон/i, categoryId: 'shopping' },
  { pattern: /lamoda|ламода/i, categoryId: 'shopping' },
  { pattern: /aliexpress|алиэкспресс/i, categoryId: 'shopping' },
  { pattern: /мвидео|m\.video|mvideo/i, categoryId: 'shopping' },
  { pattern: /эльдорадо|eldorado/i, categoryId: 'shopping' },
  { pattern: /dns.?shop|\bднс\b/i, categoryId: 'shopping' },
  { pattern: /ситилинк|citilink/i, categoryId: 'shopping' },
  { pattern: /\bикеа\b|\bikea\b/i, categoryId: 'shopping' },
  { pattern: /леруа.?мерлен|leroy.?merlin/i, categoryId: 'shopping' },
  { pattern: /спортмастер|sportmaster/i, categoryId: 'shopping' },
  { pattern: /декатлон|decathlon/i, categoryId: 'shopping' },
  { pattern: /\bzara\b|зара/i, categoryId: 'shopping' },
  { pattern: /\bh&m\b|h and m/i, categoryId: 'shopping' },
  { pattern: /uniqlo|юникло/i, categoryId: 'shopping' },
  { pattern: /adidas|адидас/i, categoryId: 'shopping' },
  { pattern: /\bnike\b|найк/i, categoryId: 'shopping' },
  { pattern: /яндекс.?маркет|market\.yandex/i, categoryId: 'shopping' },

  // ── Здоровье ────────────────────────────────────────────────────────────────
  { pattern: /аптека|apteka|pharmacy/i, categoryId: 'health' },
  { pattern: /36\.6|366\.ru/i, categoryId: 'health' },
  { pattern: /горздрав/i, categoryId: 'health' },
  { pattern: /ригла|rigla/i, categoryId: 'health' },
  { pattern: /инвитро|invitro/i, categoryId: 'health' },
  { pattern: /гемотест|helix\.ru/i, categoryId: 'health' },
  { pattern: /медси|медцентр|клиника|стоматолог|поликлиника/i, categoryId: 'health' },
  { pattern: /сдэк.?мед|лаборатор/i, categoryId: 'health' },

  // ── Развлечения / подписки ──────────────────────────────────────────────────
  { pattern: /netflix|нетфликс/i, categoryId: 'entertainment' },
  { pattern: /spotify|спотифай/i, categoryId: 'entertainment' },
  { pattern: /яндекс.?плюс|yandex.?plus/i, categoryId: 'entertainment' },
  { pattern: /кинопоиск|kinopoisk/i, categoryId: 'entertainment' },
  { pattern: /\bokko\b|окко/i, categoryId: 'entertainment' },
  { pattern: /\bиви\b|ivi\.ru/i, categoryId: 'entertainment' },
  { pattern: /\bsteam\b|стим/i, categoryId: 'entertainment' },
  { pattern: /apple.?music|itunes/i, categoryId: 'entertainment' },
  { pattern: /youtube.?premium/i, categoryId: 'entertainment' },
  { pattern: /кино|синема|cinema|мультиплекс/i, categoryId: 'entertainment' },
  { pattern: /боулинг|bowling/i, categoryId: 'entertainment' },
  { pattern: /vk.?музыка|вк.?музыка/i, categoryId: 'entertainment' },

  // ── Спорт ───────────────────────────────────────────────────────────────────
  { pattern: /world.?class|worldclass/i, categoryId: 'sport' },
  { pattern: /x.?fit|xfit/i, categoryId: 'sport' },
  { pattern: /alex.?fitness/i, categoryId: 'sport' },
  { pattern: /фитнес|fitness|\bgym\b|спортзал|бассейн|йога/i, categoryId: 'sport' },
  { pattern: /планета.?фитнес/i, categoryId: 'sport' },

  // ── Красота ─────────────────────────────────────────────────────────────────
  { pattern: /л.?этуаль|letu\.ru/i, categoryId: 'beauty' },
  { pattern: /рив.?гош|rivgosh/i, categoryId: 'beauty' },
  { pattern: /золотое.?яблоко/i, categoryId: 'beauty' },
  { pattern: /маникюр|педикюр|барбер|парикмахер|салон.?красот/i, categoryId: 'beauty' },
  { pattern: /\bsephora\b|сефора/i, categoryId: 'beauty' },

  // ── Дом / ЖКХ / связь ──────────────────────────────────────────────────────
  { pattern: /\bмтс\b|mts\.ru/i, categoryId: 'home' },
  { pattern: /мегафон|megafon/i, categoryId: 'home' },
  { pattern: /билайн|beeline/i, categoryId: 'home' },
  { pattern: /теле2|tele2/i, categoryId: 'home' },
  { pattern: /ростелеком|rostelecom/i, categoryId: 'home' },
  { pattern: /жкх|коммунал|квартплата|электроэнерг|мосэнерго|мосводоканал/i, categoryId: 'home' },
  { pattern: /аренда.?квартир|съём.?квартир|найм.?жилья/i, categoryId: 'home' },
  { pattern: /домофон|домру|dom\.ru/i, categoryId: 'home' },

  // ── Образование ─────────────────────────────────────────────────────────────
  { pattern: /skillbox|скилбокс/i, categoryId: 'education' },
  { pattern: /нетология|netology/i, categoryId: 'education' },
  { pattern: /яндекс.?практикум/i, categoryId: 'education' },
  { pattern: /coursera|udemy|stepik/i, categoryId: 'education' },
  { pattern: /литрес|litres\.ru/i, categoryId: 'education' },
  { pattern: /geekbrains|гикбрейнс/i, categoryId: 'education' },

  // ── Путешествия ─────────────────────────────────────────────────────────────
  { pattern: /booking\.com|букинг/i, categoryId: 'travel' },
  { pattern: /airbnb|эйрбнб/i, categoryId: 'travel' },
  { pattern: /aviasales|авиасейлс/i, categoryId: 'travel' },
  { pattern: /туту\.ру|tutu\.ru/i, categoryId: 'travel' },
  { pattern: /аэропорт|airport|шереметьево|домодедово|внуково/i, categoryId: 'travel' },
  { pattern: /отель|hotel|хостел/i, categoryId: 'travel' },

  // ── Доходы ──────────────────────────────────────────────────────────────────
  { pattern: /плат\.вед\.|зачисление.?зарплат|начисление.?зарплат/i, categoryId: 'salary', type: 'income' },
  { pattern: /\bаванс\b|\bзарплата\b/i, categoryId: 'salary', type: 'income' },
  { pattern: /кэшбэк|cashback/i, categoryId: 'cashback', type: 'income' },
  { pattern: /возврат.?средств|refund|возврат.?покупки/i, categoryId: 'cashback', type: 'income' },
  { pattern: /дивиденд|купон.?по.?облигац|процент.?по.?вклад|процент.?по.?депозит/i, categoryId: 'investment', type: 'income' },
];

export function preClassifyTransaction(tx: {
  description: string;
  bankCategory?: string;
  type: 'expense' | 'income' | 'transfer';
  amount: number;
}): { categoryId: string; confident: boolean } | null {
  const searchText = `${tx.description} ${tx.bankCategory ?? ''}`;

  for (const rule of LOCAL_CLASSIFICATION_RULES) {
    // Проверка типа транзакции
    if (rule.type && rule.type !== tx.type) continue;
    // Проверка диапазона суммы
    if (rule.minAmount !== undefined && tx.amount < rule.minAmount) continue;
    if (rule.maxAmount !== undefined && tx.amount > rule.maxAmount) continue;
    // Проверка паттерна
    if (rule.pattern.test(searchText)) {
      return { categoryId: rule.categoryId, confident: true };
    }
  }
  return null; // не распознано → отправить в Groq
}
```

#### Изменение 2: Добавить сумму в Groq-payload и улучшить промпт

```typescript
// В recategorizeWithGroq() изменить payload:
const payload = batchItems.map((item, batchIdx) => ({
  idx: batchIdx,
  description: item.tx.description,
  bankCategory: item.tx.bankCategory,
  type: item.tx.type,
  amount: Math.round(item.tx.amount), // НОВОЕ: добавить сумму
}));

// Добавить в GROQ_CATEGORIZE_PROMPT новый раздел:
const AMOUNT_CONTEXT_RULES = `
ПРАВИЛА УЧЁТА СУММЫ:
- amount < 500 в кафе/ресторане → cafe (кофе, перекус)
- amount 500–3000 в супермаркете → food
- amount > 50000 в магазине одежды → shopping (крупная покупка)
- amount > 100000 с описанием "перевод" → скорее всего home (аренда) или other_exp

ПРАВИЛА ДЛЯ ПЕРЕВОДОВ (type=expense):
- Перевод на карту физлица (ФИО в описании) → other_exp
- Перевод с пометкой "брокер", "ИИС", "инвестиции", "тинькофф инвестиции" → other_exp (НЕ investment!)
- Перевод с пометкой "аренда", "квартира", "съём" → home
- Перевод с пометкой "кредит", "ипотека", "долг", "займ" → home
- Перевод без явной цели → other_exp

ПРАВИЛА ДЛЯ ПЕРЕВОДОВ (type=income):
- Перевод от физлица (ФИО) → other_inc
- Перевод с пометкой "зарплата", "аванс" → salary
- Возврат средств, refund, возврат покупки → cashback
- Дивиденды, купоны, проценты по вкладу → investment (ТОЛЬКО входящие!)
`;
```

#### Изменение 3: Надёжный JSON-парсер

```typescript
// Заменить текущую 3-strategy extraction:

function parseGroqCategorizationResponse(
  content: string,
  batchSize: number
): Array<{ idx: number; categoryId: string }> {
  const VALID_IDS = new Set([
    'food', 'transport', 'shopping', 'health', 'entertainment',
    'cafe', 'sport', 'beauty', 'home', 'education', 'travel', 'other_exp',
    'salary', 'freelance', 'gift', 'investment', 'cashback', 'other_inc',
  ]);

  const validate = (arr: unknown[]): Array<{ idx: number; categoryId: string }> => {
    const result: Array<{ idx: number; categoryId: string }> = [];
    for (const item of arr) {
      if (
        typeof item === 'object' && item !== null &&
        'idx' in item && typeof (item as any).idx === 'number' &&
        'categoryId' in item && typeof (item as any).categoryId === 'string' &&
        (item as any).idx >= 0 && (item as any).idx < batchSize &&
        VALID_IDS.has((item as any).categoryId)
      ) {
        result.push({ idx: (item as any).idx, categoryId: (item as any).categoryId });
      }
      // Невалидные элементы молча пропускаются — не бросаем исключение
    }
    return result;
  };

  // Strategy 1: прямой JSON.parse
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return validate(parsed);
  } catch { /* продолжаем */ }

  // Strategy 2: извлечь JSON-массив из текста (Groq иногда добавляет пояснения вокруг)
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return validate(parsed);
    } catch { /* продолжаем */ }
  }

  // Strategy 3: построчный парсинг объектов {idx: N, categoryId: "X"}
  const lineResults: Array<{ idx: number; categoryId: string }> = [];
  const linePattern = /"idx"\s*:\s*(\d+).*?"categoryId"\s*:\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = linePattern.exec(content)) !== null) {
    const idx = parseInt(match[1], 10);
    const categoryId = match[2];
    if (idx >= 0 && idx < batchSize && VALID_IDS.has(categoryId)) {
      lineResults.push({ idx, categoryId });
    }
  }
  if (lineResults.length > 0) return lineResults;

  // Strategy 4: ничего не распознано → вернуть пустой массив
  // Caller должен оставить транзакции с categoryId = 'other_exp'
  console.warn('[ALG-002] Groq response unparseable, falling back to other_exp', content.slice(0, 200));
  return [];
}
```

#### Изменение 4: Механизм исправления категории пользователем

Добавить в [`store.ts`](apps/web/src/features/finance/store.ts) и [`TransactionsPage.tsx`](apps/web/src/pages/transactions/TransactionsPage.tsx):

```typescript
// В FinanceState добавить:
updateTransactionCategory: (id: string, categoryId: string) => void;

// Реализация в store:
updateTransactionCategory: (id, categoryId) => {
  set((s) => ({
    transactions: s.transactions.map((t) =>
      t.id === id
        ? { ...t, categoryId, categoryConfident: true, userCorrected: true }
        : t
    ),
  }));
  scheduleCloudUpload();
},

// В Transaction interface добавить поле:
userCorrected?: boolean; // true = пользователь вручную выбрал категорию

// Правило: userCorrected транзакции НИКОГДА не перекатегоризируются повторно
// (ни при re-import, ни при batch Groq re-run)
```

**UI-точки входа для исправления категории:**
1. Свайп влево на транзакции в [`TransactionsPage.tsx`](apps/web/src/pages/transactions/TransactionsPage.tsx) → bottom sheet с выбором категории
2. Тап на категорию в детальном просмотре транзакции (F-003 из PRODUCT_SPEC.md)
3. `PostImportWizard` — уже реализован, расширить на все `other_exp` транзакции

### Acceptance Criteria ALG-002

> **Статус реализации (аудит 19.05.2026):** 1 из 5 изменений реализовано (частично — JSON-парсер). Реальный baseline по данным пользователя: **~74% `other_exp`** (не 30%). `LOCAL_CLASSIFICATION_RULES[]` не реализован. `amount` не передаётся в Groq. `userCorrected` отсутствует в `Transaction`.

- [ ] После импорта 100 транзакций Альфа-банка: ≤15% остаются в `other_exp` (baseline реальный: ~74%)
- [ ] Groq-вызов с невалидным JSON не роняет категоризацию — транзакции получают `other_exp`
- [ ] Перевод на брокерский счёт (описание содержит "ИИС", "брокер", "инвестиции") → `other_exp`, не `investment`
- [ ] Пользователь может изменить категорию любой транзакции за ≤2 тапа
- [ ] `userCorrected = true` транзакции не перекатегоризируются при повторном импорте
- [ ] Сумма передаётся в Groq и влияет на категоризацию (проверить: 50 ₽ в кафе → `cafe`, не `food`)

**Метрика**: Доля `other_exp` после импорта ≤ 15% (baseline реальный: ~74%)

---

## ALG-003: SafeToSpend v4

**Файл**: [`apps/web/src/pages/dashboard/DashboardPage.tsx`](apps/web/src/pages/dashboard/DashboardPage.tsx)
**Функция**: `computeSpendingProfile()` (строка ~129)

### Диагностика текущих проблем

| # | Проблема | Симптом для пользователя | Строка в коде |
|---|----------|--------------------------|---------------|
| 1 | Последний день месяца: `daysLeft = max(1, ...)` | 31-го числа показывает огромную сумму "можно потратить" | `Math.max(1, daysInMonth - dayOfMonth)` |
| 2 | Перерасход скрыт: `remaining = max(0, ...)` | При перерасходе показывает 0 вместо отрицательного числа | `Math.max(0, budget - alreadySpent)` |
| 3 | `safeToday` не учитывает уже потраченное сегодня | Утром и вечером показывает одинаковую сумму | Нет вычитания `spentToday` |
| 4 | IQR-фильтр слишком агрессивен при малой истории | При 1–2 месяцах истории зарплата не определяется | `iqrFilter()` требует ≥4 значений |
| 5 | Бонусы и 13-я зарплата раздувают бюджет | В декабре SafeToSpend завышен в 2–3 раза | EXTRA-фильтр работает только для ПЛАТ.ВЕД. формата |
| 6 | Нет учёта дня выплаты зарплаты | В начале месяца (до зарплаты) показывает 0 | Нет логики "ждём зарплату" |

### Решение v4

#### Изменение 1: Правильный расчёт `daysLeft`

```typescript
// БЫЛО:
const daysLeft = Math.max(1, daysInMonth - dayOfMonth);

// СТАЛО:
// daysLeft = сколько дней ОСТАЛОСЬ в месяце включая сегодня
// В последний день месяца = 1 (сегодня), что корректно
// Но делить нужно на daysLeft - 1 (исключая сегодня) для "на будущее"
// Если daysLeft = 1 (последний день) → safePerDay = remaining (всё что осталось)

const daysLeft = daysInMonth - dayOfMonth + 1; // включая сегодня, минимум 1
const daysAhead = Math.max(1, daysLeft - 1);   // дней ПОСЛЕ сегодня (для распределения)

// safePerDay = remaining / daysAhead
// Если daysAhead = 0 (последний день) → safePerDay = remaining
```

#### Изменение 2: Показывать перерасход явно

```typescript
// БЫЛО:
const remaining = Math.max(0, budget - alreadySpent - reservedForRecurring);

// СТАЛО:
const remaining = budget - alreadySpent - reservedForRecurring;
// remaining может быть отрицательным → это перерасход, показывать красным

// В SpendingProfile добавить:
interface SpendingProfile {
  // ... существующие поля ...
  isOverspent: boolean;       // remaining < 0
  overspentAmount: number;    // Math.abs(remaining) если < 0, иначе 0
}

// В SafeToSpendCard:
// Если isOverspent → показать красную карточку "Перерасход: -X ₽"
// Не скрывать проблему нулём
```

#### Изменение 3: Вычитать `spentToday` из `safeToday`

```typescript
// Добавить в computeSpendingProfile():
const today = new Date();
const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
const todayEnd = new Date(todayStart.getTime() + 86_400_000);

const spentToday = thisMonthTxs
  .filter((t) => {
    const d = new Date(t.date);
    return (
      t.type === 'expense' &&
      !EXCLUDED_CATEGORIES.has(t.categoryId) &&
      d >= todayStart && d < todayEnd
    );
  })
  .reduce((sum, t) => sum + t.amount, 0);

// safeToday = safePerDay - spentToday (может быть отрицательным)
const safeToday = safePerDay - spentToday;

// В SpendingProfile:
interface SpendingProfile {
  // ...
  spentToday: number;
  safeToday: number;       // может быть < 0 (уже потратил больше дневного лимита)
  safePerDay: number;      // дневной лимит без учёта уже потраченного
}
```

#### Изменение 4: Адаптивный IQR для малой истории

```typescript
// БЫЛО:
function iqrFilter(sorted: number[]): number[] {
  // требует ≥4 значений, иначе возвращает пустой массив
}

// СТАЛО:
function iqrFilter(sorted: number[]): number[] {
  if (sorted.length === 0) return [];
  if (sorted.length <= 2) return sorted; // 1–2 значения: не фильтруем, доверяем
  if (sorted.length === 3) {
    // 3 значения: убрать только явные выбросы (>3x медианы)
    const med = sorted[1];
    return sorted.filter(v => v <= med * 3);
  }
  // 4+ значений: стандартный IQR
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return sorted.filter(v => v >= lo && v <= hi);
}

// Дополнительно: если после IQR-фильтра осталось 0 значений → вернуть исходный массив
// (защита от случая когда все значения "выброс")
function safeIqrFilter(sorted: number[]): number[] {
  const filtered = iqrFilter(sorted);
  return filtered.length > 0 ? filtered : sorted;
}
```

#### Изменение 5: Фильтр бонусов и нерегулярных доходов

```typescript
// БЫЛО: фильтр только для ПЛАТ.ВЕД. формата
function classifyPlatvedDay(description: string): 'MAIN' | 'ADVANCE' | 'EXTRA' { ... }
// EXTRA → исключается из бюджета

// СТАЛО: универсальный фильтр нерегулярных доходов
function classifyIncomeType(
  tx: Transaction,
  medianSalary: number
): 'SALARY' | 'ADVANCE' | 'BONUS' | 'OTHER' {
  const desc = tx.description.toLowerCase();

  // Явные маркеры
  if (/плат\.вед\.|зачисление зарплат|начисление зарплат/i.test(desc)) {
    return classifyPlatvedDay(tx.description) === 'EXTRA' ? 'BONUS' : 'SALARY';
  }
  if (/аванс/i.test(desc)) return 'ADVANCE';
  if (/премия|бонус|13.{0,5}зарплат|годовая/i.test(desc)) return 'BONUS';

  // Эвристика по сумме: если доход > 2x медианной зарплаты → скорее всего бонус
  if (medianSalary > 0 && tx.amount > medianSalary * 2) return 'BONUS';

  return 'SALARY';
}

// В computeSalaryBudget():
// Исключать BONUS из расчёта медианной зарплаты
// ADVANCE суммировать с SALARY того же месяца (аванс + зарплата = полный доход)
```

#### Изменение 6: Логика "ждём зарплату"

```typescript
// Добавить в SpendingProfile:
interface SpendingProfile {
  // ...
  waitingForSalary: boolean;  // true = зарплата ещё не пришла в этом месяце
  expectedSalaryDay: number;  // медианный день выплаты из истории
  daysUntilSalary: number;    // сколько дней до ожидаемой зарплаты
}

// Логика:
const salaryDays = last6MonthsSalaryTxs.map(t => new Date(t.date).getDate());
const expectedSalaryDay = Math.round(median(salaryDays));
const hasSalaryThisMonth = thisMonthTxs.some(t =>
  t.type === 'income' && t.categoryId === 'salary'
);

const waitingForSalary = !hasSalaryThisMonth && dayOfMonth < expectedSalaryDay;
const daysUntilSalary = waitingForSalary
  ? expectedSalaryDay - dayOfMonth
  : 0;

// Если waitingForSalary:
// → В SafeToSpendCard показать: "Зарплата ожидается через N дней"
// → safePerDay рассчитывать от ОСТАТКА прошлого месяца (если есть данные)
//   или показать предупреждение "Нет данных о балансе"
```

### Acceptance Criteria ALG-003

> **Статус реализации (аудит 19.05.2026):** 2 из 6 изменений реализовано. Три критические ошибки формулы в [`DashboardPage.tsx`](apps/web/src/pages/dashboard/DashboardPage.tsx):
> - Строка 136: `daysLeft = Math.max(1, daysInMonth - dayOfMonth)` — не включает сегодня → SafeToSpend завышен
> - Строка 235: `remaining = Math.max(0, ...)` — перерасход скрыт нулём
> - Строка 237: `safeToday = remaining / daysLeft` — не вычитает уже потраченное сегодня

- [ ] 31-го числа SafeToSpend показывает корректную сумму (не завышенную)
- [ ] При перерасходе карточка становится красной и показывает `-X ₽` (не 0)
- [ ] После добавления транзакции `safeToday` уменьшается на сумму транзакции
- [ ] При 1 месяце истории зарплата определяется корректно (IQR не отфильтровывает)
- [ ] Декабрьская премия 200 000 ₽ при зарплате 100 000 ₽ не удваивает бюджет
- [ ] Если зарплата ещё не пришла — карточка показывает "Ждём зарплату через N дней"

**Метрика**: Пользователи, добавляющие транзакции ≥3 раза в неделю (leading indicator доверия к числу)

---

## ALG-004: Политика переводов и снятий наличных

> **Ответ на вопрос**: "Что делать с обычными переводами и снятиями наличных?"

### Ключевой принцип

P2P-переводы и снятия наличных — **непрозрачные расходы**: деньги ушли, но мы не знаем куда. Это реальные траты с конкретной целью (еда, аренда, развлечения). Groq здесь бесполезен — нет контекста для вывода. **Единственный правильный путь: спросить пользователя через PostImportWizard.** Никаких автоматических заглушек.

### Диагностика: три типа "переводов"

| Тип | Пример описания | Текущая обработка | Правильная обработка |
|-----|-----------------|-------------------|----------------------|
| Перевод между своими счетами | "Перевод на счёт *1234", "Пополнение вклада" | `type='transfer'` → исключается из расходов ✅ | Без изменений |
| P2P-перевод другому человеку | "Иванов Иван Иванович", "СБП перевод" | `type='transfer'` → исключается ❌ | `type='expense'`, `categoryId=null` → PostImportWizard (обязательно) |
| Снятие наличных в банкомате | "ATM", "Снятие наличных", "Банкомат" | `type='expense'`, `categoryId='other_exp'` ❌ | `type='expense'`, `categoryId=null` → PostImportWizard (обязательно) |

### Решение

#### Правило 1: Детекция P2P-переводов → рекласификация + обязательный PostImportWizard

```typescript
// В bankImport.ts, добавить в preClassifyTransaction():

const P2P_PATTERNS = [
  // ФИО паттерн: Фамилия Имя Отчество (кириллица, 2–3 слова с заглавной буквы)
  /^[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(\s+[А-ЯЁ][а-яё]+)?$/,
  // Явные маркеры P2P
  /перевод\s+(другу|подруге|маме|папе|жене|мужу|брату|сестре)/i,
  /перевод\s+по\s+номеру\s+телефона/i,
  /сбп\s+перевод|перевод\s+сбп/i, // Система быстрых платежей
  /p2p|пир.?ту.?пир/i,
];

function isP2PTransfer(description: string): boolean {
  return P2P_PATTERNS.some(p => p.test(description.trim()));
}

// Применение: если tx.type === 'transfer' && isP2PTransfer(tx.description)
// → рекласифицировать:
//   { type: 'expense', categoryId: null, categoryConfident: false, requiresUserInput: true }
// → НЕ отправлять в Groq — категорию знает только пользователь
// → PostImportWizard показывает ВСЕГДА для таких транзакций
```

#### Правило 2: Снятие наличных → обязательный PostImportWizard

```typescript
// Паттерны для детекции снятия наличных:
const CASH_WITHDRAWAL_PATTERNS = [
  /снятие\s+наличных/i,
  /\batm\b|банкомат/i,
  /выдача\s+наличных/i,
  /cash\s+withdrawal/i,
  /получение\s+наличных/i,
];

// В preClassifyTransaction():
if (CASH_WITHDRAWAL_PATTERNS.some(p => p.test(tx.description))) {
  return {
    categoryId: null,          // категория не определена — только пользователь знает
    confident: false,
    requiresUserInput: true,   // PostImportWizard показывает ВСЕГДА
  };
}
```

#### Правило 3: PostImportWizard — UX для P2P и наличных

```typescript
// Расширить computeClarifyQueue() в ProfilePage.tsx:

// Порядок приоритетов в очереди уточнения:
// 1. requiresUserInput=true (P2P + снятия наличных) — ВСЕГДА, показывать сразу после импорта
// 2. Транзакции с categoryId='other_exp' и суммой > 3000 ₽ — показывать
// 3. Остальные other_exp — по желанию (кнопка "Уточнить категории")

// Лимит очереди: не более 10 транзакций за один сеанс
// Показывать СРАЗУ после импорта (не откладывать)

// UI для P2P-перевода:
// Заголовок: "Кому перевели X ₽?" (если ФИО в описании — показать имя)
// Варианты: [🏠 Аренда] [🍕 Еда/кафе] [🎁 Подарок] [💸 Долг/займ] [🛒 Покупка] [❓ Другое]

// UI для снятия наличных:
// Заголовок: "Вы сняли X ₽ наличными. На что потратили?"
// Варианты (персонализированные — топ-6 категорий пользователя по истории userCorrected):
// По умолчанию: [🛒 Продукты] [🚕 Транспорт] [🍕 Кафе] [🎉 Развлечения] [💊 Здоровье] [❓ Другое]
```

#### Правило 4: Учёт в SafeToSpend

```typescript
// В computeSpendingProfile():
// Транзакции с categoryId=null и type='expense' → включать в alreadySpent
// Деньги ушли — это факт, даже если категория ещё не определена
// В UI показывать их с иконкой ❓ и подсказкой "Уточните категорию"

const EXCLUDED_CATEGORIES = new Set([
  'investment',  // пополнение брокерского счёта — не расход
  'cashback',    // возврат — не расход
  'salary',      // доход — не расход
  // P2P и наличные (categoryId=null или любой expense) — включать в расходы
]);
```

### Acceptance Criteria ALG-004

> **Статус реализации (аудит 19.05.2026):** 0 из 5 изменений реализовано. По реальным данным пользователя: **554 000 ₽ P2P-расходов** за 6 месяцев не учитываются в SafeToSpend (классифицируются как `type='transfer'` и исключаются из `alreadySpent`). `requiresUserInput` отсутствует в `ParsedBankTx`. `P2P_PATTERNS[]` и `CASH_WITHDRAWAL_PATTERNS[]` не реализованы.

- [ ] Перевод "Иванов Иван Иванович 5000 ₽" → `type='expense'`, `categoryId=null`, `requiresUserInput=true`, PostImportWizard показывает СРАЗУ после импорта
- [ ] Перевод "На счёт *1234" → `type='transfer'`, исключается из расходов, в PostImportWizard НЕ попадает
- [ ] "Снятие наличных ATM 3000 ₽" → `categoryId=null`, `requiresUserInput=true`, PostImportWizard показывает СРАЗУ
- [ ] P2P и наличные НЕ отправляются в Groq — только пользователь выбирает категорию
- [ ] После выбора категории в PostImportWizard: `categoryId` обновляется, `userCorrected=true`
- [ ] Транзакции с `categoryId=null` включаются в `alreadySpent` (деньги ушли, категория неизвестна — не занижать расходы)
- [ ] Варианты в PostImportWizard для наличных персонализированы по истории `userCorrected` транзакций
- [ ] Лимит PostImportWizard: не более 10 транзакций за сеанс; показывать сразу после импорта

---

## Ответ на вопрос: есть ли проблема с определением трат при платеже?

> **Вопрос**: "Действительно ли есть проблема в определении трат при платеже?"

**Ответ: НЕТ — проблемы с real-time обновлением нет. Проблема в формуле, не в механизме.**

### Как работает обновление (правильно)

```
addTransaction(tx)
  → Zustand set() → store.transactions обновляется синхронно
  → SafeToSpendCard использует useMemo([transactions, recurringPayments])
  → React перерисовывает карточку с новым значением alreadySpent
  → Пользователь видит обновлённое число немедленно
```

`alreadySpent` вычисляется из `thisMonthTxs` — это live-срез из Zustand store. Когда `addTransaction()` вызывает `set()`, Zustand немедленно обновляет все подписчики. `useMemo` с `[transactions, recurringPayments]` как зависимостями пересчитывается при каждом изменении транзакций.

**Реальные проблемы — в формуле** (описаны в ALG-003):
1. `daysLeft = max(1, ...)` → последний день месяца показывает завышенную сумму
2. `remaining = max(0, ...)` → перерасход скрыт
3. `safeToday` не вычитает уже потраченное сегодня

### Что нужно проверить при тестировании

```typescript
// Тест: добавить транзакцию 1000 ₽ → safeToday должен уменьшиться на 1000 ₽
// Если этого не происходит → проверить зависимости useMemo в SafeToSpendCard
// Ожидаемое поведение: обновление < 100ms (синхронное)
```

---

## Сводная таблица изменений

> Колонка **Статус** добавлена по результатам аудита 19.05.2026. Подробности: [`docs/analysis/ANALYST_REPORT_2026-05-19.md`](docs/analysis/ANALYST_REPORT_2026-05-19.md)

| Алгоритм | Файл | Приоритет | Усилие | Влияние | Статус |
|----------|------|-----------|--------|---------|--------|
| ALG-001: Порог суммы (100 ₽) | `store.ts` | 🔴 Критично | S | Детектирует подписки | ❌ Не реализовано |
| ALG-001: Описание как ключ | `store.ts` | 🔴 Критично | M | Устраняет ложные кластеры | ❌ Не реализовано |
| ALG-001: Staleness-check | `store.ts` | 🟡 Важно | S | Убирает устаревшие резервы | ❌ Не реализовано |
| ALG-002: Local pre-classifier | `bankImport.ts` | 🔴 Критично | M | -59% `other_exp` (74%→15%) | ❌ Не реализовано |
| ALG-002: Сумма в Groq | `ProfilePage.tsx` | 🟡 Важно | S | Точнее категоризация | ❌ Не реализовано |
| ALG-002: JSON-парсер v2 | `ProfilePage.tsx` | 🔴 Критично | S | Нет молчаливых падений | ⚠️ Частично (3 стратегии из 4) |
| ALG-002: userCorrected | `store.ts` | 🟡 Важно | S | Исправления сохраняются | ❌ Не реализовано |
| ALG-003: daysLeft fix | `DashboardPage.tsx` | 🔴 Критично | S | Корректный расчёт | ❌ Не реализовано |
| ALG-003: Показать перерасход | `DashboardPage.tsx` | 🔴 Критично | S | Честность с пользователем | ❌ Не реализовано |
| ALG-003: spentToday | `DashboardPage.tsx` | 🟡 Важно | S | Актуальный дневной лимит | ❌ Не реализовано |
| ALG-003: IQR fix | `DashboardPage.tsx` | 🟡 Важно | S | Работает с 1–2 мес. истории | ✅ Реализовано |
| ALG-003: Бонус-фильтр | `DashboardPage.tsx` | 🟡 Важно | M | Нет завышения в декабре | ⚠️ Частично (только ПЛАТ.ВЕД.) |
| ALG-003: waitingForSalary | `DashboardPage.tsx` | 🟡 Важно | S | Предупреждение до зарплаты | ❌ Не реализовано |
| ALG-004: P2P → PostImportWizard (без Groq) | `bankImport.ts` + `ProfilePage.tsx` | 🟡 Важно | S | Пользователь сам указывает категорию | ❌ Не реализовано |
| ALG-004: Наличные → PostImportWizard (без Groq) | `bankImport.ts` + `ProfilePage.tsx` | 🟡 Важно | S | Пользователь сам указывает куда потратил | ❌ Не реализовано |
| ALG-004: categoryId=null включается в alreadySpent | `DashboardPage.tsx` | 🟡 Важно | S | Нет занижения расходов | ⚠️ Частично (null не фильтруется, но P2P = transfer) |

**Порядок реализации**: ALG-003 (daysLeft + перерасход + spentToday) → ALG-001 (порог 100 ₽ + staleness) → ALG-002 (pre-classifier + сумма в Groq) → ALG-004 → остальное

### Дополнительные находки аудита (не в исходной спецификации)

| Находка | Файл | Приоритет | Статус |
|---------|------|-----------|--------|
| `budgets` и `recurringPayments` отсутствуют в `CloudPayload` | `store.ts:124` | 🔴 Sprint 0 | ❌ Не реализовано |
| `isOverspent` UI использует `alreadySpent - thisMonthIncome` вместо `Math.abs(remaining)` | `DashboardPage.tsx:349` | 🟡 Sprint 0 | ❌ Требует Fix-1 |
| `detectRecurringPayments()` не вызывается автоматически | `store.ts:354` | 🟡 Sprint 1 | ❌ Не реализовано |
| IQR для 3 значений не фильтрует выбросы >3x медианы | `DashboardPage.tsx:63` | 🟢 Sprint 2 | ⚠️ Частично |

---

## Открытые вопросы

1. **Баланс счёта**: SafeToSpend v4 предполагает расчёт от дохода, а не от реального баланса. Если пользователь не импортировал все транзакции — расчёт неточен. Решение: добавить поле "текущий баланс" в онбординге (F-023, вне текущего скоупа).

2. **Несколько источников дохода**: Фрилансер с нерегулярным доходом — IQR-медиана не работает. Решение: если CV (коэффициент вариации) дохода > 50% → показывать "Нестабильный доход, введите бюджет вручную".

3. **Семейный бюджет**: Два человека используют одно приложение — транзакции партнёра выглядят как P2P. Решение: вне скоупа v1, отметить как риск.

4. **Groq rate limits**: На бесплатном плане — 30 req/min. Батч из 10 транзакций = 1 запрос. При импорте 300 транзакций = 30 запросов → может упереться в лимит. Решение: добавить exponential backoff + показывать прогресс-бар.

## Риски

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Local pre-classifier даёт ложные срабатывания | Средняя | Средний | A/B тест на 50 транзакциях перед деплоем |
| IQR-fix ломает существующих пользователей с историей | Низкая | Высокий | Версионировать алгоритм, мигрировать постепенно |
| P2P-детекция ошибочно ловит перевод на свой счёт | Средняя | Средний | PostImportWizard даёт пользователю исправить; ФИО-паттерн применяется только при `type='transfer'` |
| PostImportWizard с 10 вопросами утомляет пользователя | Средняя | Высокий | Показывать только `requiresUserInput=true` сразу; остальные — по кнопке "Уточнить" |
| Groq rate limit при импорте 300+ транзакций | Средняя | Средний | Exponential backoff + прогресс-бар; P2P и наличные в Groq не идут — снижает нагрузку |
| Groq меняет формат ответа → JSON-парсер ломается | Низкая | Высокий | Strategy 4 (fallback to other_exp) защищает от этого |