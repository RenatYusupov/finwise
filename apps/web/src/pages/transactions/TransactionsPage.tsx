import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { apiClient } from '@/shared/api/client';
import { formatCurrency, formatDateShort, transactionColor, transactionSign } from '@/shared/utils/format';
import type { Transaction, TransactionType } from '@finwise/shared-types';

const FILTERS: { label: string; value: TransactionType | 'all' }[] = [
  { label: 'Все', value: 'all' },
  { label: 'Расходы', value: 'expense' },
  { label: 'Доходы', value: 'income' },
];

export function TransactionsPage() {
  const [filter, setFilter] = useState<TransactionType | 'all'>('all');

  const { data: transactions, isLoading } = useQuery<Transaction[]>({
    queryKey: ['transactions', filter],
    queryFn: () => {
      const params = filter !== 'all' ? `?type=${filter}` : '';
      return apiClient.get(`/transactions${params}`).then((r) => r.data.data);
    },
  });

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Операции</h1>
      <div className="flex gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium haptic transition-all ${
              filter === f.value
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          {!transactions?.length && (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-3">💸</div>
              <div>Нет операций</div>
            </div>
          )}
          {transactions?.map((tx, i) => (
            <motion.div
              key={tx.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0"
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl">
                {tx.category?.icon ?? '💳'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {tx.description ?? tx.category?.name}
                </div>
                <div className="text-xs text-gray-400">
                  {tx.category?.name} · {formatDateShort(tx.date)}
                </div>
              </div>
              <div className={`font-semibold ${transactionColor(tx.type)}`}>
                {transactionSign(tx.type)}
                {formatCurrency(tx.amount)}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
