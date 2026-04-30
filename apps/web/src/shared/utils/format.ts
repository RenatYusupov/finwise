// Currency formatting
export function formatCurrency(amount: number, currency = 'RUB'): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Short currency (1 200 → 1.2K, 1 000 000 → 1M)
export function formatCurrencyShort(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M ₽`;
  }
  if (Math.abs(amount) >= 1_000) {
    return `${(amount / 1_000).toFixed(1)}K ₽`;
  }
  return `${amount} ₽`;
}

// Date formatting
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(date);
}

export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export function formatMonth(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

// Relative time
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return formatDateShort(dateStr);
}

// Percent
export function formatPercent(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

// Days left
export function daysLeft(deadline: string): number {
  const date = new Date(deadline);
  const now = new Date();
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

// Pluralize Russian
export function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${n} ${many}`;
  if (mod10 === 1) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

// Transaction sign
export function transactionSign(type: string): string {
  return type === 'income' ? '+' : type === 'expense' ? '-' : '↔';
}

export function transactionColor(type: string): string {
  return type === 'income' ? 'text-green-600' : type === 'expense' ? 'text-red-500' : 'text-gray-500';
}
