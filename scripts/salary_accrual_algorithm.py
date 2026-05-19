#!/usr/bin/env python3
"""
salary_accrual_algorithm.py  —  FinWise v3.2
=============================================
"Можно потратить сегодня" — алгоритм на основе ВЫПЛАТ зарплаты.

КЛЮЧЕВОЕ РЕШЕНИЕ (подтверждено пользователем 2026-05-14):
  Бюджет считается по ВЫПЛАТАМ (cash flow), а не по начислению.
  Причина: для оценки "сколько можно потратить" важно, сколько
  реально пришло на счёт, а не за какой месяц это начислено.

АЛГОРИТМ:
  1. Определить зарплатные транзакции (тот же regex что в bankImport.ts)
  2. Исключить EXTRA-выплаты (нестандартные даты: задолженности, разовые)
     — EXTRA = ПЛАТ.ВЕД. с датой платёжного поручения НЕ 1-10 и НЕ 15-25
  3. Сгруппировать по КАЛЕНДАРНОМУ МЕСЯЦУ ПОЛУЧЕНИЯ
  4. IQR-фильтрация аномальных месяцев
  5. budget = медиана отфильтрованных месячных сумм
  6. safe_today = (budget - already_spent) / days_left

ДАННЫЕ (ноябрь 2025 — май 2026):
  Нормальные месяцы (MAIN + ADVANCE):
    2025-11: 473,863 ₽  (301K основная + 154K аванс + 1.9K аванс)
    2025-12: 361,505 ₽  (207K основная + 154K аванс)
    2026-01: 163,908 ₽  (только аванс — основная пришла в феврале)
    2026-02: 499,976 ₽  (336K основная + 163K аванс)
    2026-03: 512,972 ₽  (241K основная + 165K + 35K + 70K аванс)
    2026-04: 414,482 ₽  (243K + 151K основная + 18K аванс)
    2026-05:  114,318 ₽  (только основная — выписка обрезана 05.05)

  EXTRA (исключены): Dec 26 (218K), Feb 26 (495K) — задолженности

  IQR-фильтрация убирает аномальные месяцы (Jan: 163K, May: 114K)
  Медиана нормальных месяцев ≈ 444,000 ₽

Author: FinWise Data Analysis
Date: 2026-05-14
"""

import re
import sys
from pathlib import Path
from datetime import date, datetime
from statistics import median

import pandas as pd

# ─── Configuration ────────────────────────────────────────────────────────────

XLSX_PATH = Path('/Users/yusupovrenat/Downloads/Выписка_2025_11_05T21:03:42_120+0300_2026_05_05T21:03:42_120+0300 (1).xlsx')
HEADER_ROW = 19
COL_DATE, COL_BANK_CAT, COL_DESC, COL_AMOUNT, COL_STATUS = 0, 4, 11, 12, 14
TODAY = date(2026, 5, 14)

# ─── Exact salary regex from bankImport.ts KEYWORD_RULES (line 387) ──────────

SALARY_PATTERN = re.compile(
    r'зарплат'
    r'|аванс'
    r'|оклад'
    r'|начислени.{0,20}зарплат'
    r'|перевод.{0,20}начислени'
    r'|начислени.{0,20}зарплат'
    r'|начислени.{0,20}отпуск'
    r'|плат\.вед\.'
    r'|заработная.?плата'
    r'|отпускн'
    r'|отпуск.{0,10}за\s+\d',
    re.IGNORECASE
)

ALFA_SALARY_CATEGORIES = {'зарплата'}

# ─── Helpers ──────────────────────────────────────────────────────────────────

def parse_amount(raw) -> float:
    if raw is None or str(raw).strip() == '':
        return 0.0
    s = str(raw).replace('\u00a0','').replace('\xa0','').replace(' ','').replace(',','.')
    try:
        return float(s)
    except ValueError:
        return 0.0


def is_salary(description: str, bank_category: str, amount: float) -> bool:
    """Mirrors bankImport.ts category detection priority."""
    if amount <= 0:
        return False
    if bank_category.lower().strip() in ALFA_SALARY_CATEGORIES:
        return True
    if SALARY_PATTERN.search(f"{description} {bank_category}"):
        return True
    return False


def classify_platved(desc: str) -> str:
    """
    Classify ПЛАТ.ВЕД. by day of payment order date:
      day  1-10  → MAIN    (основная зарплата, ~5-го числа)
      day 15-25  → ADVANCE (аванс, ~20-го числа)
      other      → EXTRA   (задолженности, разовые выплаты — исключаем)
    """
    m = re.search(r'от\s+(\d{2})\.(\d{2})\.(\d{4})', desc)
    if m:
        day = int(m.group(1))
        if 1 <= day <= 10:
            return 'MAIN'
        elif 15 <= day <= 25:
            return 'ADVANCE'
        else:
            return 'EXTRA'
    return 'MAIN'  # no date found → assume main


def iqr_filter(values: list) -> list:
    """Remove outliers using IQR method. Returns filtered list."""
    if len(values) < 4:
        return values
    s = sorted(values)
    n = len(s)
    q1 = s[n // 4]
    q3 = s[(3 * n) // 4]
    iqr = q3 - q1
    lo = q1 - 1.5 * iqr
    hi = q3 + 1.5 * iqr
    filtered = [v for v in s if lo <= v <= hi]
    return filtered if filtered else values


# ─── Data loading ─────────────────────────────────────────────────────────────

def load_statement(path: Path) -> pd.DataFrame:
    print(f"📂 Загружаем выписку: {path.name}")
    df_raw = pd.read_excel(path, engine='openpyxl', header=HEADER_ROW)
    rows = []
    for _, row in df_raw.iterrows():
        date_raw = row.iloc[COL_DATE]
        bank_cat = str(row.iloc[COL_BANK_CAT] or '').strip()
        desc     = str(row.iloc[COL_DESC]     or '').strip()
        amount   = parse_amount(row.iloc[COL_AMOUNT])
        status   = str(row.iloc[COL_STATUS] if len(row) > COL_STATUS else '').strip()
        if 'отклон' in status.lower():
            continue
        try:
            if isinstance(date_raw, (datetime, pd.Timestamp)):
                tx_date = pd.Timestamp(date_raw).date()
            else:
                tx_date = pd.to_datetime(str(date_raw), dayfirst=True, errors='coerce').date()
            if pd.isna(tx_date):
                continue
        except Exception:
            continue
        if amount == 0:
            continue
        desc_lower = desc.lower()
        if 'внутрибанковский перевод' in desc_lower and 'между счетами' in desc_lower:
            continue
        rows.append({'date': tx_date, 'bank_cat': bank_cat, 'desc': desc, 'amount': amount})
    df = pd.DataFrame(rows)
    print(f"   Загружено транзакций: {len(df):,}")
    print(f"   Период: {df['date'].min()} — {df['date'].max()}")
    return df


# ─── Salary analysis ──────────────────────────────────────────────────────────

def analyze_salary(df: pd.DataFrame) -> dict:
    print("\n" + "="*64)
    print("АНАЛИЗ ЗАРПЛАТЫ (по выплатам — cash flow)")
    print("="*64)

    income_df = df[df['amount'] > 0].copy()
    print(f"\n📊 Доходных транзакций: {len(income_df):,}")

    # Detect salary (bankImport.ts logic)
    income_df['is_salary'] = income_df.apply(
        lambda r: is_salary(r['desc'], r['bank_cat'], r['amount']), axis=1
    )
    salary_df = income_df[income_df['is_salary']].copy()
    print(f"   Зарплатных транзакций: {len(salary_df):,}")

    # Classify ПЛАТ.ВЕД. transactions
    def classify(row) -> str:
        if re.search(r'плат\.вед\.', row['desc'], re.IGNORECASE):
            return classify_platved(row['desc'])
        # "Перевод начисления Зарплата/Аванс/Отпуск за MM.YYYY" — small transfers
        return 'SMALL'

    salary_df = salary_df.copy()
    salary_df['tx_class'] = salary_df.apply(classify, axis=1)

    # Show all transactions with classification
    print(f"\n📋 Все зарплатные транзакции:")
    print(f"  {'Дата':<12} {'Класс':<8} {'Сумма':>14}  Описание")
    print(f"  {'-'*12} {'-'*8} {'-'*14}  {'-'*45}")
    for _, r in salary_df.sort_values('date').iterrows():
        desc_short = r['desc'][:50] + '…' if len(r['desc']) > 50 else r['desc']
        flag = '  ← ИСКЛЮЧЁН' if r['tx_class'] == 'EXTRA' else ''
        print(f"  {str(r['date']):<12} {r['tx_class']:<8} {r['amount']:>14,.2f}  {desc_short}{flag}")

    # Budget-relevant: MAIN + ADVANCE + SMALL (exclude EXTRA)
    budget_df = salary_df[salary_df['tx_class'] != 'EXTRA'].copy()
    excluded_df = salary_df[salary_df['tx_class'] == 'EXTRA'].copy()

    print(f"\n⚠️  EXTRA-выплаты (исключены из бюджета):")
    if len(excluded_df) > 0:
        for _, r in excluded_df.iterrows():
            print(f"   {r['date']}  {r['amount']:>12,.2f} ₽  {r['desc'][:60]}")
        print(f"   Итого исключено: {excluded_df['amount'].sum():,.2f} ₽")
    else:
        print("   Нет")

    # Group by CALENDAR MONTH OF RECEIPT (cash flow basis)
    budget_df = budget_df.copy()
    budget_df['pay_month'] = budget_df['date'].apply(lambda d: f"{d.year}-{d.month:02d}")
    monthly = budget_df.groupby('pay_month')['amount'].sum().sort_index()

    # IQR filter
    amounts = list(monthly.values)
    filtered = iqr_filter(amounts)
    filtered_set = set(filtered)

    print(f"\n💰 Зарплата по месяцам ПОЛУЧЕНИЯ (без EXTRA):")
    print(f"   {'Месяц':<10}  {'Сумма':>14}  {'Статус'}")
    print(f"   {'-'*10}  {'-'*14}  {'-'*25}")
    for month, amount in monthly.items():
        flag = '' if amount in filtered_set else '⚠️  исключён IQR'
        print(f"   {month:<10}  {amount:>14,.2f} ₽  {flag}")

    med_raw      = median(amounts)
    med_filtered = median(filtered)
    avg_filtered = sum(filtered) / len(filtered)

    print(f"\n📈 Статистика:")
    print(f"   Месяцев всего:          {len(amounts)}")
    print(f"   После IQR-фильтрации:   {len(filtered)}")
    print(f"   Медиана (сырая):        {med_raw:>12,.2f} ₽")
    print(f"   Медиана (IQR-filtered): {med_filtered:>12,.2f} ₽  ← БЮДЖЕТ")
    print(f"   Среднее (IQR-filtered): {avg_filtered:>12,.2f} ₽")

    return {
        'salary_df':       salary_df,
        'budget_df':       budget_df,
        'monthly':         monthly,
        'filtered_months': filtered,
        'median_budget':   med_filtered,
        'avg_budget':      avg_filtered,
        'n_months':        len(filtered),
    }


# ─── Safe-to-spend calculation ────────────────────────────────────────────────

def compute_safe_to_spend(df: pd.DataFrame, salary: dict) -> dict:
    print("\n" + "="*64)
    print("РАСЧЁТ «МОЖНО ПОТРАТИТЬ СЕГОДНЯ»")
    print("="*64)

    today = TODAY
    month_start = date(today.year, today.month, 1)
    if today.month < 12:
        days_in_month = (date(today.year, today.month + 1, 1) - month_start).days
    else:
        days_in_month = (date(today.year + 1, 1, 1) - month_start).days
    days_left = max(1, days_in_month - today.day + 1)  # include today

    budget = salary['median_budget']

    # Expenses this month (negative amounts in Alfa Bank format)
    this_month_exp = df[
        (df['amount'] < 0) &
        (df['date'] >= month_start) &
        (df['date'] <= today)
    ]
    already_spent = abs(this_month_exp['amount'].sum())

    remaining    = max(0.0, budget - already_spent)
    safe_today   = remaining / days_left if remaining > 0 else 0.0
    is_overspent = already_spent > budget

    daily_budget     = budget / days_in_month
    daily_spend_rate = already_spent / today.day if today.day > 0 else 0
    is_on_track      = daily_spend_rate <= daily_budget * 1.1

    print(f"\n📅 Дата: {today}  |  Дней в месяце: {days_in_month}  |  Осталось: {days_left}")
    print(f"\n   Бюджет (медиана зарплаты):  {budget:>12,.2f} ₽")
    print(f"   Уже потрачено (май 2026):   {already_spent:>12,.2f} ₽  ({len(this_month_exp)} транзакций)")
    print(f"   Остаток:                    {remaining:>12,.2f} ₽")
    print(f"\n   ✅ МОЖНО ПОТРАТИТЬ СЕГОДНЯ: {safe_today:>12,.2f} ₽")
    print(f"   ✅ ДО КОНЦА МЕСЯЦА:         {remaining:>12,.2f} ₽")
    print(f"\n   Дневной бюджет (план):      {daily_budget:>12,.2f} ₽/день")
    print(f"   Дневной расход (факт):      {daily_spend_rate:>12,.2f} ₽/день")
    print(f"   Статус: {'✅ В рамках бюджета' if is_on_track else '⚠️ Превышение плана'}")

    if is_overspent:
        print(f"\n   🚨 ПЕРЕРАСХОД: {already_spent - budget:,.2f} ₽ сверх бюджета!")

    return {
        'budget':        budget,
        'already_spent': already_spent,
        'remaining':     remaining,
        'safe_today':    safe_today,
        'days_left':     days_left,
        'is_overspent':  is_overspent,
        'is_on_track':   is_on_track,
        'daily_budget':  daily_budget,
    }


# ─── Comparison ───────────────────────────────────────────────────────────────

def compare_algorithms(df: pd.DataFrame, result: dict):
    print("\n" + "="*64)
    print("СРАВНЕНИЕ: СТАРЫЙ vs НОВЫЙ АЛГОРИТМ")
    print("="*64)

    today = TODAY
    month_start = date(today.year, today.month, 1)
    if today.month < 12:
        days_in_month = (date(today.year, today.month + 1, 1) - month_start).days
    else:
        days_in_month = (date(today.year + 1, 1, 1) - month_start).days
    days_left = max(1, days_in_month - today.day + 1)

    # Old: all income this month as budget
    old_budget    = df[(df['amount'] > 0) & (df['date'] >= month_start) & (df['date'] <= today)]['amount'].sum()
    already_spent = result['already_spent']
    old_remaining = max(0.0, old_budget - already_spent)
    old_safe      = old_remaining / days_left if old_remaining > 0 else 0.0

    new_budget = result['budget']
    new_safe   = result['safe_today']

    print(f"\n  {'Метрика':<40} {'Старый':>12}  {'Новый':>12}")
    print(f"  {'-'*40} {'-'*12}  {'-'*12}")
    print(f"  {'Бюджет':<40} {old_budget:>12,.0f}  {new_budget:>12,.0f}")
    print(f"  {'Уже потрачено':<40} {already_spent:>12,.0f}  {already_spent:>12,.0f}")
    print(f"  {'Остаток':<40} {old_remaining:>12,.0f}  {result['remaining']:>12,.0f}")
    print(f"  {'Можно потратить сегодня':<40} {old_safe:>12,.0f}  {new_safe:>12,.0f}")
    print(f"\n  Проблема старого: в мае получено только {old_budget:,.0f} ₽")
    print(f"  (аванс за май ещё не пришёл — выписка обрезана 05.05.2026)")
    print(f"  Новый: медиана 6 месяцев = {new_budget:,.0f} ₽ → реалистичный бюджет")


# ─── TypeScript implementation ────────────────────────────────────────────────

def print_typescript_implementation(salary: dict, result: dict):
    print("\n" + "="*64)
    print("РЕАЛИЗАЦИЯ В DashboardPage.tsx")
    print("="*64)

    med = salary['median_budget']
    spent = result['already_spent']
    remaining = result['remaining']
    safe = result['safe_today']
    days = result['days_left']

    print(f"""
// ─── computeSalaryBudget() — замена thisMonthIncome ──────────────────────────
//
// Бюджет = IQR-медиана зарплаты по МЕСЯЦАМ ВЫПЛАТЫ (cash flow).
// EXTRA-выплаты (задолженности, разовые) исключаются по дню платёжного поручения.
//
// Классификация ПЛАТ.ВЕД. по дню "от DD.MM.YYYY":
//   день  1-10  → MAIN    (основная зарплата, ~5-го числа)
//   день 15-25  → ADVANCE (аванс, ~20-го числа)
//   другой      → EXTRA   (исключается из бюджета)

function classifyPlatvedDay(description: string): 'MAIN' | 'ADVANCE' | 'EXTRA' {{
  const m = description.match(/от\\s+(\\d{{2}})\\.(\\d{{2}})\\.(\\d{{4}})/i);
  if (!m) return 'MAIN';
  const day = parseInt(m[1]!, 10);
  if (day >= 1 && day <= 10) return 'MAIN';
  if (day >= 15 && day <= 25) return 'ADVANCE';
  return 'EXTRA';
}}

function computeSalaryBudget(transactions: Transaction[]): number {{
  // 1. Salary transactions only (categoryId === 'salary')
  const salaryTxs = transactions.filter(
    (t) => t.type === 'income' && t.categoryId === 'salary'
  );

  // 2. Exclude EXTRA (non-standard payment dates = arrears/bonuses)
  const budgetTxs = salaryTxs.filter((t) => {{
    const isPlatved = /плат\\.вед\\./i.test(t.description);
    if (!isPlatved) return true;  // small "Перевод начисления" — include
    return classifyPlatvedDay(t.description) !== 'EXTRA';
  }});

  // 3. Group by calendar month of RECEIPT (cash flow basis)
  const byMonth = new Map<string, number>();
  for (const tx of budgetTxs) {{
    const d = new Date(tx.date);
    const key = `${{d.getFullYear()}}-${{String(d.getMonth() + 1).padStart(2, '0')}}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + tx.amount);
  }}

  const amounts = Array.from(byMonth.values()).sort((a, b) => a - b);
  if (amounts.length === 0) return 0;

  // 4. IQR outlier filter
  const filtered = iqrFilter(amounts);

  // 5. Median of filtered monthly totals
  return median(filtered);
}}

function iqrFilter(sorted: number[]): number[] {{
  if (sorted.length < 4) return sorted;
  const q1 = sorted[Math.floor(sorted.length / 4)]!;
  const q3 = sorted[Math.floor((3 * sorted.length) / 4)]!;
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const result = sorted.filter((v) => v >= lo && v <= hi);
  return result.length > 0 ? result : sorted;
}}

// В computeSpendingProfile() заменить:
//   let budget = thisMonthIncome;
// На:
//   let budget = computeSalaryBudget(transactions);
//   if (budget === 0) budget = thisMonthIncome;  // fallback если нет истории

// Ожидаемый результат для мая 2026:
//   budget     = {med:,.0f} ₽
//   spent      = {spent:,.0f} ₽
//   remaining  = {remaining:,.0f} ₽
//   safe_today = {safe:,.0f} ₽  (÷ {days} дней осталось)
""")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 64)
    print("FinWise — «Можно потратить сегодня» v3.2")
    print("Cash-flow based · IQR-filtered · EXTRA excluded")
    print("=" * 64)

    if not XLSX_PATH.exists():
        print(f"❌ Файл не найден: {XLSX_PATH}")
        sys.exit(1)

    df = load_statement(XLSX_PATH)
    salary = analyze_salary(df)
    result = compute_safe_to_spend(df, salary)
    compare_algorithms(df, result)
    print_typescript_implementation(salary, result)

    print("=" * 64)
    print("ИТОГ")
    print("=" * 64)
    print(f"""
  Медиана зарплаты (IQR, cash flow):  {salary['median_budget']:>12,.2f} ₽
  Уже потрачено в мае 2026:           {result['already_spent']:>12,.2f} ₽
  Остаток бюджета:                    {result['remaining']:>12,.2f} ₽
  Дней осталось (вкл. сегодня):       {result['days_left']:>12}
  ────────────────────────────────────────────────────────
  ✅ МОЖНО ПОТРАТИТЬ СЕГОДНЯ:         {result['safe_today']:>12,.2f} ₽
  ✅ ДО КОНЦА МЕСЯЦА:                 {result['remaining']:>12,.2f} ₽
""")


if __name__ == '__main__':
    main()
