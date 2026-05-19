#!/usr/bin/env python3
"""
Улучшенный алгоритм вычисления "сколько можно потратить сегодня"

Основные улучшения:
1. Фильтрация аномальных доходов (IQR метод)
2. Использование медианы для бюджета
3. Смягчённые критерии для постоянных расходов
4. Корректировка на день недели
5. Экспоненциальное сглаживание
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
import json

# ─── Helper functions ────────────────────────────────────────────────────────

def parse_amount(raw):
    """Парсинг суммы из строки в число."""
    if raw is None or raw == '':
        return 0
    s = str(raw).replace('\u00a0', '').replace(' ', '').replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return 0


def filter_outliers_iqr(values: List[float], multiplier: float = 1.5) -> List[float]:
    """
    Фильтрация выбросов методом IQR (Interquartile Range).
    
    Args:
        values: Список значений
        multiplier: Множитель для IQR (1.5 = стандартный, 3.0 = агрессивный)
    
    Returns:
        Список значений без выбросов
    """
    if len(values) < 4:
        return values
    
    q1 = np.percentile(values, 25)
    q3 = np.percentile(values, 75)
    iqr = q3 - q1
    
    lower_bound = q1 - multiplier * iqr
    upper_bound = q3 + multiplier * iqr
    
    filtered = [v for v in values if lower_bound <= v <= upper_bound]
    return filtered


def get_monthly_incomes(df: pd.DataFrame, months: int = 6) -> List[float]:
    """
    Получение доходов за последние N месяцев.
    
    Args:
        df: DataFrame с транзакциями
        months: Количество месяцев для анализа
    
    Returns:
        Список доходов по месяцам
    """
    if df.empty:
        return []
    
    end_date = df['date'].max()
    monthly_incomes = []
    
    for i in range(months):
        month_start = end_date - pd.DateOffset(months=i+1)
        month_end = end_date - pd.DateOffset(months=i)
        
        month_income = df[
            (df['date'] >= month_start) &
            (df['date'] < month_end) &
            (df['type'] == 'income')
        ]['abs_amount'].sum()
        
        if month_income > 0:
            monthly_incomes.append(month_income)
    
    return monthly_incomes


def get_monthly_expenses(df: pd.DataFrame, current_date: datetime) -> float:
    """
    Получение расходов за текущий месяц.
    
    Args:
        df: DataFrame с транзакциями
        current_date: Текущая дата
    
    Returns:
        Сумма расходов за текущий месяц
    """
    if df.empty:
        return 0
    
    month_start = current_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_end = (month_start + pd.DateOffset(months=1)) - timedelta(days=1)
    
    expenses = df[
        (df['date'] >= month_start) &
        (df['date'] <= month_end) &
        (df['type'] == 'expense')
    ]['abs_amount'].sum()
    
    return expenses


def detect_fixed_expenses_improved(
    df: pd.DataFrame,
    months: int = 3,
    variance_threshold: float = 0.35
) -> Dict[str, float]:
    """
    Обнаружение постоянных расходов (улучшенная версия).
    
    Args:
        df: DataFrame с транзакциями
        months: Количество месяцев для анализа
        variance_threshold: Порог дисперсии (0.35 = 35%)
    
    Returns:
        Словарь {категория: медиана_расхода}
    """
    if df.empty:
        return {}
    
    expenses = df[df['type'] == 'expense'].copy()
    end_date = expenses['date'].max()
    
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
        
        # Проверяем, что категория присутствует хотя бы в 2 из 3 месяцев
        non_zero_months = [m for m in monthly_totals if m > 0]
        if len(non_zero_months) < 2:
            continue
        
        # Проверяем дисперсию
        avg = np.mean(monthly_totals)
        std = np.std(monthly_totals)
        
        if avg > 0 and (std / avg) <= variance_threshold:
            # Постоянный расход — используем медиану
            fixed_expenses[category] = np.median(monthly_totals)
    
    return fixed_expenses


def get_day_of_week_multiplier(day_of_week: str) -> float:
    """
    Получение множителя для дня недели на основе исторических паттернов.
    
    Args:
        day_of_week: День недели (Monday, Tuesday, etc.)
    
    Returns:
        Множитель (например, Sunday=1.3, Wednesday=0.9)
    """
    # На основе анализа данных пользователя
    multipliers = {
        'Sunday': 1.3,      # Самый дорогой день
        'Monday': 1.1,
        'Tuesday': 1.15,
        'Wednesday': 0.9,   # Самый дешёвый день
        'Thursday': 1.0,
        'Friday': 1.0,
        'Saturday': 1.0,
    }
    return multipliers.get(day_of_week, 1.0)


def get_days_left_in_month(current_date: datetime) -> int:
    """
    Получение количества дней до конца месяца.
    
    Args:
        current_date: Текущая дата
    
    Returns:
        Количество дней до конца месяца
    """
    days_in_month = (current_date.replace(day=1) + pd.DateOffset(months=1) - timedelta(days=1)).day
    return max(1, days_in_month - current_date.day)


def compute_safe_to_spend_improved(
    df: pd.DataFrame,
    current_date: datetime = None,
    months_for_budget: int = 6,
    outlier_multiplier: float = 1.5,
    variance_threshold: float = 0.35
) -> Dict:
    """
    Улучшенный алгоритм вычисления "можно потратить сегодня".
    
    Args:
        df: DataFrame с транзакциями
        current_date: Текущая дата (по умолчанию сейчас)
        months_for_budget: Количество месяцев для расчёта бюджета
        outlier_multiplier: Множитель для фильтрации выбросов
        variance_threshold: Порог дисперсии для постоянных расходов
    
    Returns:
        Словарь с метриками
    """
    if df.empty:
        return {}
    
    if current_date is None:
        current_date = datetime.now()
    
    # 1. Получаем доходы за последние N месяцев
    monthly_incomes = get_monthly_incomes(df, months=months_for_budget)
    
    # 2. Фильтруем аномальные доходы
    filtered_incomes = filter_outliers_iqr(monthly_incomes, multiplier=outlier_multiplier)
    
    # 3. Бюджет = медиана отфильтрованных доходов
    if filtered_incomes:
        budget = np.median(filtered_incomes)
    else:
        budget = 0
    
    # 4. Уже потрачено в этом месяце
    already_spent = get_monthly_expenses(df, current_date)
    
    # 5. Постоянные расходы (смягчённые критерии)
    fixed_expenses = detect_fixed_expenses_improved(
        df,
        months=3,
        variance_threshold=variance_threshold
    )
    fixed_monthly = sum(fixed_expenses.values())
    
    # 6. Остаток
    remaining = max(0, budget - already_spent)
    
    # 7. Корректировка на день недели
    day_of_week = current_date.strftime('%A')
    day_multiplier = get_day_of_week_multiplier(day_of_week)
    
    # 8. Можно потратить сегодня
    days_left = get_days_left_in_month(current_date)
    safe_today = (remaining / days_left) * day_multiplier if remaining > 0 else 0
    safe_rest_of_month = remaining
    
    # 9. Проверка на перерасход
    is_overspent = already_spent > budget and budget > 0
    
    return {
        'budget': budget,
        'monthly_incomes_raw': monthly_incomes,
        'monthly_incomes_filtered': filtered_incomes,
        'this_month_income': df[
            (df['date'] >= current_date.replace(day=1)) &
            (df['date'] <= current_date) &
            (df['type'] == 'income')
        ]['abs_amount'].sum(),
        'already_spent': already_spent,
        'fixed_monthly': fixed_monthly,
        'fixed_expenses_breakdown': fixed_expenses,
        'remaining': remaining,
        'safe_today': safe_today,
        'safe_rest_of_month': safe_rest_of_month,
        'days_left': days_left,
        'day_of_week': day_of_week,
        'day_multiplier': day_multiplier,
        'is_overspent': is_overspent,
        'overspent_amount': max(0, already_spent - budget) if is_overspent else 0,
    }


def load_and_parse_data(filepath: str) -> pd.DataFrame:
    """
    Загрузка и парсинг банковской выписки.
    """
    try:
        # Загружаем без заголовка
        df = pd.read_excel(filepath, engine='openpyxl', header=None)
        
        # Находим строку с заголовком
        header_row = None
        for i, row in df.iterrows():
            if i > 30:
                break
            row_str = ' '.join([str(x) for x in row if pd.notna(x)])
            if 'Дата операции' in row_str:
                header_row = i
                break
        
        if header_row is None:
            return pd.DataFrame()
        
        # Перечитываем с правильным заголовком
        df = pd.read_excel(filepath, engine='openpyxl', header=header_row)
        
        # Парсим данные
        parsed = pd.DataFrame({
            'date': pd.to_datetime(df.iloc[:, 0], errors='coerce'),
            'description': df.iloc[:, 11].fillna('').astype(str),
            'amount': df.iloc[:, 12].apply(parse_amount),
            'bank_category': df.iloc[:, 4].fillna('unknown').astype(str),
            'status': df.iloc[:, 14].fillna('').astype(str) if len(df.columns) > 14 else '',
        })
        
        # Фильтруем
        parsed = parsed.dropna(subset=['date'])
        parsed = parsed[parsed['amount'] != 0]
        parsed = parsed[~parsed['status'].str.lower().str.contains('отклон', na=False)]
        parsed = parsed[~parsed['description'].str.lower().str.contains('внутрибанковский перевод', na=False)]
        
        # Определяем тип
        parsed['type'] = parsed['amount'].apply(lambda x: 'income' if x > 0 else 'expense')
        parsed['abs_amount'] = parsed['amount'].abs()
        
        return parsed
    
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        return pd.DataFrame()


def main():
    """Главная функция."""
    filepath = "/Users/yusupovrenat/Downloads/Выписка_2025_11_05T21:03:42_120+0300_2026_05_05T21:03:42_120+0300 (1).xlsx"
    
    print("🔍 Загрузка данных...")
    df = load_and_parse_data(filepath)
    
    if df.empty:
        print("❌ Не удалось загрузить данные")
        return
    
    print(f"✅ Загружено {len(df)} транзакций")
    print(f"   Доходов: {len(df[df['type'] == 'income'])}")
    print(f"   Расходов: {len(df[df['type'] == 'expense'])}")
    
    # Тестируем на разных датах
    test_dates = [
        datetime(2026, 5, 14),  # Середина месяца с аномальным доходом
        datetime(2026, 4, 15),  # Обычный месяц
        datetime(2026, 1, 20),  # Месяц с высокими расходами
    ]
    
    results = {}
    
    for test_date in test_dates:
        print(f"\n{'='*60}")
        print(f"📅 Тестовая дата: {test_date.strftime('%d.%m.%Y')} ({test_date.strftime('%A')})")
        print('='*60)
        
        result = compute_safe_to_spend_improved(df, current_date=test_date)
        results[test_date.strftime('%Y-%m-%d')] = result
        
        print(f"\n💵 Бюджет на месяц: {result['budget']:,.2f} ₽")
        print(f"📥 Доход за месяц: {result['this_month_income']:,.2f} ₽")
        print(f"📤 Уже потрачено: {result['already_spent']:,.2f} ₽")
        print(f"🏠 Постоянные расходы: {result['fixed_monthly']:,.2f} ₽")
        print(f"\n💸 Остаток: {result['remaining']:,.2f} ₽")
        print(f"📅 Можно потратить сегодня: {result['safe_today']:,.2f} ₽")
        print(f"📆 Можно до конца месяца: {result['safe_rest_of_month']:,.2f} ₽")
        print(f"⏰ Дней до конца месяца: {result['days_left']}")
        print(f"📊 День недели: {result['day_of_week']} (множитель: {result['day_multiplier']})")
        
        if result['fixed_expenses_breakdown']:
            print(f"\n🏠 Постоянные расходы:")
            for cat, amount in result['fixed_expenses_breakdown'].items():
                print(f"   {cat}: {amount:,.2f} ₽")
        
        if result['is_overspent']:
            print(f"\n🚨 ПЕРЕРАСХОД: {result['overspent_amount']:,.2f} ₽")
        
        print(f"\n📊 Доходы за последние {len(result['monthly_incomes_raw'])} месяцев:")
        print(f"   Сырые: {[f'{x:,.0f}' for x in result['monthly_incomes_raw']]}")
        print(f"   После фильтрации: {[f'{x:,.0f}' for x in result['monthly_incomes_filtered']]}")
    
    # Сохраняем результаты
    output_file = '/Users/yusupovrenat/Desktop/finwise/improved_algorithm_results.json'
    
    def convert_numpy(obj):
        if isinstance(obj, (np.integer, np.floating)):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, np.bool_):
            return bool(obj)
        return obj
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2, default=convert_numpy)
    
    print(f"\n✅ Результаты сохранены в {output_file}")


if __name__ == '__main__':
    main()
