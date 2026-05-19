/**
 * Groq Llama 3.1 — парсинг свободного текста в список транзакций.
 * API-ключ хранится на бэкенде (ai-service). Клиент вызывает /api/ai/parse.
 */

import type { TransactionType } from '@/features/finance/store';
import { apiClient } from '@/shared/api/client';

export interface GroqParsedTx {
  type: TransactionType;
  amount: number;
  categoryId: string;
  description: string;
}

/**
 * Парсит свободный текст в транзакции через backend /api/ai/parse.
 * Возвращает null если запрос упал.
 */
export async function parseTransactionsWithGroq(
  text: string
): Promise<GroqParsedTx[] | null> {
  try {
    const response = await apiClient.post<{ data: GroqParsedTx[] }>('/ai/parse', { text });
    const result = response.data?.data;
    if (!Array.isArray(result) || result.length === 0) return null;
    return result.filter((tx) => tx.amount > 0);
  } catch (err) {
    console.error('[groqParser] Backend parse error:', err);
    return null;
  }
}
