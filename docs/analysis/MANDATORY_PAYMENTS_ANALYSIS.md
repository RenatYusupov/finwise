# Mandatory Payments Analysis — Definitive Findings
**Date:** 2026-05-14  
**Data:** Alfa-Bank statement, full dataset (2025-01-12 → 2026-12-04)  
**Confirmed transactions only** (status = "Выполнен", n=229)

---

## ⚠️ Critical Data Quality Finding

The XLSX file contains **two distinct data layers**:

| Layer | Rows | Status | Date range |
|-------|------|--------|------------|
| Real confirmed transactions | 229 | `Выполнен` | 2025-01 → 2026-05 |
| Unconfirmed / projected rows | 250 | *(empty)* | 2025-01 → 2026-12 |

**The 88,400 ₽ and 86,000 ₽ recurring payments identified in the previous analysis session were from the unconfirmed rows — they do NOT exist in the actual transaction history.** The previous analysis was operating on projected/template data, not real transactions.

---

## What the Real Data Actually Shows

### Confirmed Large Outflows (≥ 20,000 ₽)

| Date | Day | Amount | Category | Description |
|------|-----|--------|----------|-------------|
| 2025-05-11 | 11 | 35,397 ₽ | Финансовые операции | Lamoda SBP payment |
| 2025-05-11 | 11 | 42,235 ₽ | Финансовые операции | Lamoda SBP payment |
| 2025-05-11 | 11 | 50,000 ₽ | Прочие операции | Internal transfer → own account |
| 2025-07-12 | 12 | 100,000 ₽ | Прочие операции | SBP → +79522766652 |
| 2026-01-02 | 2 | 110,000 ₽ | Прочие операции | SBP → +79183277714 |
| 2026-02-05 | 5 | 115,000 ₽ | Снятие наличных | ATM withdrawal |
| 2026-03-02 | 2 | 40,000 ₽ | Прочие операции | Transfer to Данил Равильев |
| 2026-04-05 | 5 | 25,000 ₽ | Прочие операции | SBP → +79165787566 |
| 2026-05-05 | 5 | 65,000 ₽ | Прочие операции | Internal transfer → own account |
| 2026-05-05 | 5 | 30,000 ₽ | Прочие операции | Internal transfer → own account |
| 2026-05-05 | 5 | 20,000 ₽ | Прочие операции | Internal transfer → own account |
| 2026-06-03 | 3 | 48,000 ₽ | Прочие операции | Transfer to Данил Равильев |
| 2026-07-03 | 3 | 70,000 ₽ | Прочие операции | Internal transfer → own account |
| 2026-08-03 | 3 | 131,000 ₽ | Прочие операции | SBP → +79183277714 |
| 2026-10-04 | 4 | 200,000 ₽ | Прочие операции | SBP → +79111912333 |
| 2026-12-01 | 1 | 112,500 ₽ | Образование | РЭШ (Российская экономическая школа) |

### Internal Transfers (Внутрибанковский перевод — own accounts)

All internal transfers are **between the user's own Alfa-Bank accounts** (same name: ЮСУПОВ Р.Р.):
- Source account: `40817810904980700720`
- Destination accounts: `40817810704981936340`, `40817810404983297772`, `40817810804984112249`

These are **savings/investment transfers, not expenses**. They should be excluded from mandatory payment detection.

| Date | Direction | Amount |
|------|-----------|--------|
| 2025-02-12 | IN | +30,324 ₽ |
| 2025-05-11 | OUT | −50,000 ₽ |
| 2026-05-05 | OUT | −65,000 ₽ |
| 2026-05-05 | OUT | −20,000 ₽ |
| 2026-05-05 | OUT | −30,000 ₽ |
| 2026-07-03 | OUT | −70,000 ₽ |

**Pattern:** Irregular amounts, irregular dates. Not a fixed recurring obligation.

---

## Recurring Pattern Analysis Results

### Confirmed recurring patterns (≥ 2 months, ≥ 5,000 ₽):

| Pattern | Amount | Months | Days | Verdict |
|---------|--------|--------|------|---------|
| SBP → +79165787566 | ~7,000–47,000 ₽ | 2025-07, 2026-04, 2026-07 | 12, 5, 2 | **Irregular — not mandatory** |
| SBP → +79183277714 | 110,000 / 131,000 ₽ | 2026-01, 2026-08 | 2, 3 | **Irregular — not mandatory** |
| Transfer to Данил Равильев | 40,000 / 48,000 ₽ | 2026-03, 2026-06 | 2, 3 | **Irregular — not mandatory** |
| Lamoda SBP | 35,397 / 42,235 ₽ | 2025-05 only | 11 | **One-time shopping** |

### Education (Образование):
- Only **1 confirmed payment**: 2026-12-01, 112,500 ₽ to РЭШ (Российская экономическая школа)
- Cannot establish recurrence from a single data point

### Telecom (Телефон, интернет, ТВ):
- 2026-01-02: 700 ₽ + 1,000 ₽ (МТС, two numbers)
- 2026-12-04: 300 ₽ (МТС)
- Only 2 months with data, amounts vary — **low confidence**

---

## Key Conclusion: No Statistically Reliable Recurring Mandatory Payments Found

The confirmed transaction history does **not** contain the fixed monthly recurring payments (88,400 ₽ + 86,000 ₽) that were identified in the previous session. Those were artifacts of unconfirmed/projected rows in the XLSX.

**What the data actually shows:**
1. **Spending is highly irregular** — monthly totals range from 894 ₽ (2025-03) to 209,857 ₽ (2026-10)
2. **Large transfers are one-off or semi-annual**, not monthly fixed obligations
3. **Internal transfers to own accounts** are savings movements, not expenses
4. **No fixed-amount, fixed-date recurring payment** appears in ≥ 3 consecutive months

---

## Algorithm Design Recommendation

Given the data reality, there are **two viable approaches**:

### Option A: Manual User-Defined Obligations (Recommended)
Since automatic detection cannot reliably identify recurring mandatory payments from this data, the app should let the user **manually declare** upcoming obligations:

```typescript
interface UpcomingPayment {
  id: string;
  label: string;          // "Ипотека", "Аренда", "Учёба"
  amount: number;         // Expected amount
  dayOfMonth: number;     // Expected day (e.g., 27)
  isActive: boolean;      // User can toggle on/off
}
```

**Formula:**
```
reserved = sum of upcoming payments where dayOfMonth > today.day AND not yet paid this month
safe_today = max(0, budget - already_spent - reserved) / days_left
```

### Option B: Heuristic Detection (Lower Confidence)
Detect payments that appear in ≥ 2 of the last 3 months with amount within ±20% and day within ±7 days. Flag them as **"possible recurring"** and ask the user to confirm.

**Detection criteria:**
- Amount ≥ 5,000 ₽
- Appears in ≥ 2 of last 3 months
- Day-of-month std dev ≤ 7
- Not an internal transfer (own account)
- Not a salary/income transaction

**Confidence scoring:**
- 3/3 months + day_std ≤ 3 → HIGH confidence → auto-include
- 2/3 months + day_std ≤ 5 → MEDIUM → show as suggestion
- 2/3 months + day_std > 5 → LOW → ignore

---

## Recommended Implementation Plan

### Phase 1 (immediate): Manual obligations UI
1. Add "Обязательные платежи" section to ProfilePage or a new SettingsPage
2. User adds: label, amount, day-of-month
3. Store in localStorage (same pattern as existing profile data)
4. `computeSpendingProfile()` reads these and subtracts unpaid ones from budget

### Phase 2 (future): Auto-detection with confirmation
1. Run heuristic detection on import
2. Show detected patterns as suggestions: "Мы заметили регулярный платёж ~40,000 ₽ в начале месяца. Добавить как обязательный?"
3. User confirms or dismisses

### Phase 3 (future): Smart learning
1. Track which suggestions were confirmed
2. Update expected amount based on recent history (rolling median)
3. Alert when a known recurring payment is overdue

---

## Current Month (May 2026) Impact Assessment

**Today:** 2026-05-14 (day 14)  
**Days left in month:** 17  
**Already spent (confirmed):** 115,377 ₽

Breakdown of May 2026 spending:
- 2026-05-01: 377 ₽ (SBP transfer)
- 2026-05-05: 65,000 ₽ (internal transfer to own account)
- 2026-05-05: 30,000 ₽ (internal transfer to own account)
- 2026-05-05: 20,000 ₽ (internal transfer to own account)

**Note:** 115,000 ₽ of the 115,377 ₽ spent in May are internal transfers to own savings accounts. If these are excluded from "spending", actual discretionary spending in May is only **377 ₽**.

**This raises a critical question for the algorithm:** Should internal transfers to own accounts count as "spending" for the purposes of the daily budget calculation?

- **If YES:** Budget is consumed by savings transfers → very conservative daily limit
- **If NO:** Savings transfers are excluded → more accurate discretionary budget

**Recommendation:** Exclude internal transfers (same-name Alfa-Bank account transfers) from the spending calculation. They represent savings, not consumption.

---

## Data Quality Flags

| Flag | Severity | Description |
|------|----------|-------------|
| Unconfirmed rows in XLSX | HIGH | 250 rows with empty status — may be projections or pending transactions. Previous analysis was contaminated by these. |
| Future dates in confirmed data | MEDIUM | Confirmed transactions extend to 2026-12-04, which is in the future (today is 2026-05-14). These may be scheduled/standing orders. |
| Salary not detected | HIGH | Zero salary transactions match the regex in confirmed rows. Income comes through other channels not captured in this account. |
| Internal transfers classified as expenses | MEDIUM | 115,000 ₽ in May 2026 are own-account transfers, inflating "spending" figures. |
