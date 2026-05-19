#!/usr/bin/env python3
"""
Анализ паттернов расходов для предсказания "сколько можно потратить сегодня"

Данные: банковская выписка из XLSX файла
Цель: разработать алгоритм персонализированной оценки дневного бюджета
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
import json

# Категории расходов (из store.ts)
EXPENSE_CATEGORIES = {
    'food': 'Еда',
    'transport': 'Транспорт',
    'shopping': 'Покупки',
    'health': 'Здоровье',
    'entertainment': 'Развлечения',
    'cafe': 'Кафе',
    'sport': 'Спорт',
    'beauty': 'Красота',
    'home': 'Дом',
    'education': 'Учёба',
    'travel': 'Путешествия',
    'other_exp': 'Другое',
}

INCOME_CATEGORIES = {
    'salary': 'Зарплата',
    'freelance': 'Фриланс',
    'gift': 'Подарок',
    'investment': 'Инвестиции',
    'cashback': 'Кэшбэк',
    'other_inc': 'Другое',
}

# Постоянные категории (подписки, фиксированные расходы)
FIXED_CATS = {'home', 'education'}

# Условно-постоянные категории (регулярные, но вариативные)
SEMI_FIXED_CATS = {'food', 'transport', 'cafe', 'health', 'sport', 'beauty'}


def parse_amount(raw):
    """
    Парсинг суммы из строки в число.
    
    Форматы:
    - "-35 397" → -35397
    - "301 508,57" → 301508.57
    - "1 500.00" → 1500.0
    """
    if raw is None or raw == '':
        return 0
    
    s = str(raw)
    # Удаляем неразрывные пробелы и обычные пробелы
    s = s.replace('\u00a0', '').replace(' ', '')
    # Заменяем запятую на точку (русский формат)
    s = s.replace(',', '.')
    
    try:
        return float(s)
    except ValueError:
        return 0


def load_bank_statement(filepath: str) -> pd.DataFrame:
    """
    Загрузка банковской выписки из XLSX файла.

    Альфа-Банк формат:
    - Заголовок на строке 19 (индекс 19)
    - Колонки: Дата операции (0), Дата проводки (1), Код (3), Категория (4), Описание (11), Сумма (12), Статус (14)
    """
    try:
        # Загружаем без заголовка, чтобы найти строку с заголовком
        df = pd.read_excel(filepath, engine='openpyxl', header=None)
        print(f"✅ Загружено {len(df)} строк из файла")

        # Находим строку с заголовком ("Дата операции")
        header_row = None
        for i, row in df.iterrows():
            if i > 30:  # Не ищем слишком глубоко
                break
            row_str = ' '.join([str(x) for x in row if pd.notna(x)])
            if 'Дата операции' in row_str:
                header_row = i
                break

        if header_row is None:
            print("❌ Не удалось найти строку с заголовком")
            return pd.DataFrame()

        print(f"📊 Заголовок найден на строке {header_row}")

        # Перечитываем файл с правильным заголовком
        df = pd.read_excel(filepath, engine='openpyxl', header=header_row)
        print(f"📊 Колонки: {list(df.columns)}")

        return df
    except Exception as e:
        print(f"❌ Ошибка загрузки файла: {e}")
        import traceback
        traceback.print_exc()
        return pd.DataFrame()


def parse_bank_statement(df: pd.DataFrame) -> pd.DataFrame:
    """
    Парсинг банковской выписки в стандартизированный формат.

    Альфа-Банк формат (индексы колонок):
    - 0: Дата операции
    - 1: Дата проводки
    - 3: Код
    - 4: Категория
    - 11: Описание
    - 12: Сумма в валюте счета
    - 14: Статус

    Возвращает DataFrame с колонками:
    - date: datetime
    - amount: float (отрицательный для расходов, положительный для доходов)
    - description: str
    - category: str (из банка или 'unknown')
    - type: 'income' | 'expense'
    """
    # Альфа-Банк формат: используем индексы колонок
    date_col_idx = 0
    desc_col_idx = 11
    amount_col_idx = 12
    category_col_idx = 4
    status_col_idx = 14

    # Проверяем, что колонки существуют
    if len(df.columns) <= max(date_col_idx, desc_col_idx, amount_col_idx):
        print(f"❌ Недостаточно колонок в файле: {len(df.columns)}")
        return pd.DataFrame()

    # Создаём стандартизированный DataFrame
    parsed = pd.DataFrame({
        'date': pd.to_datetime(df.iloc[:, date_col_idx], errors='coerce'),
        'description': df.iloc[:, desc_col_idx].fillna('').astype(str),
        'amount': df.iloc[:, amount_col_idx].apply(parse_amount),
        'bank_category': df.iloc[:, category_col_idx].fillna('unknown').astype(str),
        'status': df.iloc[:, status_col_idx].fillna('').astype(str) if len(df.columns) > status_col_idx else '',
    })

    # Удаляем строки с некорректной датой или нулевой суммой
    parsed = parsed.dropna(subset=['date'])
    parsed = parsed[parsed['amount'] != 0]

    # Пропускаем отклонённые операции
    parsed = parsed[~parsed['status'].str.lower().str.contains('отклон', na=False)]

    # Пропускаем внутренние переводы между своими счетами
    parsed = parsed[~parsed['description'].str.lower().str.contains('внутрибанковский перевод', na=False)]

    # Определяем тип операции
    parsed['type'] = parsed['amount'].apply(lambda x: 'income' if x > 0 else 'expense')

    # Приводим сумму к абсолютному значению для расходов
    parsed['abs_amount'] = parsed['amount'].abs()

    print(f"✅ Распарсено {len(parsed)} транзакций")
    print(f"   Доходов: {len(parsed[parsed['type'] == 'income'])}")
    print(f"   Расходов: {len(parsed[parsed['type'] == 'expense'])}")

    return parsed


def analyze_spending_patterns(df: pd.DataFrame) -> Dict:
    """
    Анализ паттернов расходов.

    Возвращает словарь с метриками:
    - monthly_income: доход по месяцам
    - monthly_expenses: расходы по месяцам
    - category_breakdown: разбивка по категориям
    - daily_patterns: дневные паттерны
    - day_of_week_patterns: паттерны по дням недели
    """
    if df.empty:
        return {}

    # Добавляем временные колонки
    df['month'] = df['date'].dt.to_period('M')
    df['day_of_week'] = df['date'].dt.day_name()
    df['day_of_month'] = df['date'].dt.day

    # Доходы и расходы по месяцам
    monthly_income = df[df['type'] == 'income'].groupby('month')['abs_amount'].sum().to_dict()
    monthly_expenses = df[df['type'] == 'expense'].groupby('month')['abs_amount'].sum().to_dict()

    # Разбивка расходов по категориям (используем bank_category)
    category_breakdown = df[df['type'] == 'expense'].groupby('bank_category')['abs_amount'].agg(['sum', 'count', 'mean']).to_dict()

    # Дневные паттерны (средние траты по дням месяца)
    daily_patterns = df[df['type'] == 'expense'].groupby('day_of_month')['abs_amount'].mean().to_dict()

    # Паттерны по дням недели
    day_of_week_patterns = df[df['type'] == 'expense'].groupby('day_of_week')['abs_amount'].agg(['sum', 'count', 'mean']).to_dict()

    # Статистика по транзакциям
    expense_stats = df[df['type'] == 'expense']['abs_amount'].describe().to_dict()
    income_stats = df[df['type'] == 'income']['abs_amount'].describe().to_dict()

    return {
        'monthly_income': {str(k): v for k, v in monthly_income.items()},
        'monthly_expenses': {str(k): v for k, v in monthly_expenses.items()},
        'category_breakdown': category_breakdown,
        'daily_patterns': daily_patterns,
        'day_of_week_patterns': day_of_week_patterns,
        'expense_stats': expense_stats,
        'income_stats': income_stats,
        'date_range': {
            'start': df['date'].min().isoformat(),
            'end': df['date'].max().isoformat(),
            'days': (df['date'].max() - df['date'].min()).days,
        },
    }


def detect_fixed_expenses(df: pd.DataFrame, months: int = 3) -> Dict[str, float]:
    """
    Обнаружение постоянных расходов.

    Категория считается постоянной, если:
    - Присутствует в каждом из последних N месяцев
    - Дисперсия ≤ 20% от среднего

    Возвращает словарь {категория: медиана_расхода}
    """
    if df.empty:
        return {}

    # Фильтруем только расходы
    expenses = df[df['type'] == 'expense'].copy()

    # Получаем последние N полных месяцев
    end_date = expenses['date'].max()
    month_starts = [end_date - pd.DateOffset(months=i) for i in range(months)]

    fixed_expenses = {}

    for category in expenses['bank_category'].unique():
        if category == 'unknown':
            continue

        # Собираем траты по этой категории за последние N месяцев
        monthly_totals = []
        for i in range(months):
            month_start = end_date - pd.DateOffset(months=i+1)
            month_end = end_date - pd.DateOffset(months=i)

            month_expenses = expenses[
                (expenses['date'] >= month_start) &
                (expenses['date'] < month_end) &
                (expenses['bank_category'] == category)
            ]['abs_amount'].sum()

            monthly_totals.append(month_expenses)

        # Проверяем, что категория присутствует в каждом месяце
        non_zero_months = [m for m in monthly_totals if m > 0]
        if len(non_zero_months) < months:
            continue

        # Проверяем дисперсию
        avg = np.mean(monthly_totals)
        std = np.std(monthly_totals)
        if avg > 0 and (std / avg) <= 0.20:
            # Постоянный расход — используем медиану
            fixed_expenses[category] = np.median(monthly_totals)

    return fixed_expenses


def compute_safe_to_spend(df: pd.DataFrame, current_date: datetime = None) -> Dict:
    """
    Вычисление "сколько можно потратить сегодня".

    Алгоритм:
    1. Определяем бюджет на месяц (доход этого месяца или медиана исторических)
    2. Вычитаем уже потраченное
    3. Вычитаем постоянные расходы (если ещё не потрачены)
    4. Делим остаток на количество оставшихся дней

    Возвращает словарь с метриками:
    - budget: бюджет на месяц
    - already_spent: уже потрачено
    - fixed_monthly: постоянные расходы
    - remaining: остаток
    - safe_today: можно потратить сегодня
    - safe_rest_of_month: можно потратить до конца месяца
    - days_left: дней до конца месяца
    """
    if df.empty:
        return {}

    if current_date is None:
        current_date = datetime.now()

    # Границы текущего месяца
    month_start = current_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_end = (current_date.replace(day=1) + pd.DateOffset(months=1)).replace(day=1) - timedelta(days=1)
    days_in_month = month_end.day
    days_left = max(1, days_in_month - current_date.day)

    # Доход текущего месяца
    this_month_income = df[
        (df['date'] >= month_start) &
        (df['date'] <= month_end) &
        (df['type'] == 'income')
    ]['abs_amount'].sum()

    # Уже потрачено в этом месяце
    already_spent = df[
        (df['date'] >= month_start) &
        (df['date'] <= month_end) &
        (df['type'] == 'expense')
    ]['abs_amount'].sum()

    # Постоянные расходы (из истории)
    fixed_expenses = detect_fixed_expenses(df, months=3)
    fixed_monthly = sum(fixed_expenses.values())

    # Бюджет = доход текущего месяца (или медиана, если доход ещё не получен)
    if this_month_income > 0:
        budget = this_month_income
    else:
        # Фолбэк на медиану доходов за последние 3 месяца
        historical_income = []
        for i in range(1, 4):
            hist_start = month_start - pd.DateOffset(months=i)
            hist_end = month_start - pd.DateOffset(months=i-1) - timedelta(days=1)
            hist_income = df[
                (df['date'] >= hist_start) &
                (df['date'] <= hist_end) &
                (df['type'] == 'income')
            ]['abs_amount'].sum()
            if hist_income > 0:
                historical_income.append(hist_income)

        budget = np.median(historical_income) if historical_income else 0

    # Остаток
    remaining = max(0, budget - already_spent)

    # Можно потратить сегодня
    safe_today = remaining / days_left if remaining > 0 else 0
    safe_rest_of_month = remaining

    # Проверка на перерасход
    is_overspent = already_spent > budget and budget > 0

    return {
        'budget': budget,
        'this_month_income': this_month_income,
        'already_spent': already_spent,
        'fixed_monthly': fixed_monthly,
        'fixed_expenses_breakdown': fixed_expenses,
        'remaining': remaining,
        'safe_today': safe_today,
        'safe_rest_of_month': safe_rest_of_month,
        'days_left': days_left,
        'is_overspent': is_overspent,
        'overspent_amount': max(0, already_spent - budget) if is_overspent else 0,
    }


def main():
    """Главная функция для анализа данных."""
    filepath = "/Users/yusupovrenat/Downloads/Выписка_2025_11_05T21:03:42_120+0300_2026_05_05T21:03:42_120+0300 (1).xlsx"

    print("🔍 Загрузка банковской выписки...")
    df = load_bank_statement(filepath)

    if df.empty:
        print("❌ Не удалось загрузить данные")
        return

    print("\n📊 Парсинг данных...")
    parsed_df = parse_bank_statement(df)

    if parsed_df.empty:
        print("❌ Не удалось распарсить данные")
        return

    print("\n📈 Анализ паттернов расходов...")
    patterns = analyze_spending_patterns(parsed_df)

    print("\n💰 Вычисление безопасного дневного бюджета...")
    safe_to_spend = compute_safe_to_spend(parsed_df)

    # Сохраняем результаты в JSON
    results = {
        'patterns': patterns,
        'safe_to_spend': safe_to_spend,
    }

    # Конвертируем numpy типы в нативные Python типы для JSON
    def convert_numpy(obj):
        if isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, np.bool_):
            return bool(obj)
        return obj

    output_file = '/Users/yusupovrenat/Desktop/finwise/analysis_results.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2, default=convert_numpy)

    print(f"\n✅ Результаты сохранены в {output_file}")

    # Вывод ключевых метрик
    print("\n" + "="*60)
    print("📊 КЛЮЧЕВЫЕ МЕТРИКИ")
    print("="*60)

    if safe_to_spend:
        print(f"\n💵 Бюджет на месяц: {safe_to_spend['budget']:,.2f} ₽")
        print(f"📥 Доход за месяц: {safe_to_spend['this_month_income']:,.2f} ₽")
        print(f"📤 Уже потрачено: {safe_to_spend['already_spent']:,.2f} ₽")
        print(f"🏠 Постоянные расходы: {safe_to_spend['fixed_monthly']:,.2f} ₽")
        print(f"\n💸 Остаток: {safe_to_spend['remaining']:,.2f} ₽")
        print(f"📅 Можно потратить сегодня: {safe_to_spend['safe_today']:,.2f} ₽")
        print(f"📆 Можно потратить до конца месяца: {safe_to_spend['safe_rest_of_month']:,.2f} ₽")
        print(f"⏰ Дней до конца месяца: {safe_to_spend['days_left']}")

        if safe_to_spend['is_overspent']:
            print(f"\n🚨 ПЕРЕРАСХОД: {safe_to_spend['overspent_amount']:,.2f} ₽")

    if patterns:
        print(f"\n📅 Период данных: {patterns['date_range']['start']} → {patterns['date_range']['end']}")
        print(f"📊 Всего дней: {patterns['date_range']['days']}")

        print(f"\n📈 Статистика расходов:")
        print(f"   Средний расход: {patterns['expense_stats']['mean']:,.2f} ₽")
        print(f"   Медиана: {patterns['expense_stats']['50%']:,.2f} ₽")
        print(f"   Мин/Макс: {patterns['expense_stats']['min']:,.2f} / {patterns['expense_stats']['max']:,.2f} ₽")

        print(f"\n💵 Статистика доходов:")
        print(f"   Средний доход: {patterns['income_stats']['mean']:,.2f} ₽")
        print(f"   Медиана: {patterns['income_stats']['50%']:,.2f} ₽")
        print(f"   Мин/Макс: {patterns['income_stats']['min']:,.2f} / {patterns['income_stats']['max']:,.2f} ₽")


if __name__ == '__main__':
    main()
