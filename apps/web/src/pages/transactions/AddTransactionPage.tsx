import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { apiClient } from '@/shared/api/client';
import type { CreateTransactionDto, Category, TransactionType } from '@finwise/shared-types';

const TYPE_TABS: { label: string; value: TransactionType; color: string }[] = [
  { label: 'Расход', value: 'expense', color: 'text-red-600' },
  { label: 'Доход', value: 'income', color: 'text-green-600' },
  { label: 'Перевод', value: 'transfer', color: 'text-blue-600' },
];

export function AddTransactionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [type, setType] = useState<TransactionType>('expense');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const { register, handleSubmit, watch } = useForm<{ amount: number; description: string }>();
  const amount = watch('amount');

  const { data: categories } = useQuery<Category[]>({
    queryKey: ['categories', type],
    queryFn: () => apiClient.get(`/categories?type=${type}`).then((r) => r.data.data),
  });

  const mutation = useMutation({
    mutationFn: (data: CreateTransactionDto) => apiClient.post('/transactions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      navigate(-1);
    },
  });

  const onSubmit = (data: { amount: number; description: string }) => {
    mutation.mutate({
      ...data,
      type,
      categoryId: selectedCategory,
      accountId: 'default',
      date: new Date().toISOString().split('T')[0] ?? '',
    });
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-4 bg-white border-b border-gray-100">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center haptic"
        >
          ←
        </button>
        <h1 className="text-lg font-bold text-gray-900">Новая операция</h1>
      </div>

      {/* Type tabs */}
      <div className="flex gap-1 mx-4 mt-4 bg-gray-100 rounded-2xl p-1">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setType(tab.value); setSelectedCategory(''); }}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold haptic transition-all ${
              type === tab.value ? `bg-white shadow-sm ${tab.color}` : 'text-gray-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 px-4 pt-4 gap-4">
        {/* Amount */}
        <div className="bg-white rounded-2xl p-5 text-center shadow-sm">
          <div className="text-gray-400 text-sm mb-2">Сумма</div>
          <div className="flex items-center justify-center gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              className="amount-input"
              {...register('amount', { required: true, min: 0.01 })}
            />
            <span className="text-3xl font-bold text-gray-400">₽</span>
          </div>
        </div>

        {/* Categories */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-sm font-medium text-gray-500 mb-3">Категория</div>
          <div className="grid grid-cols-4 gap-2">
            {categories?.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 haptic transition-all ${
                  selectedCategory === cat.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-transparent bg-gray-50'
                }`}
              >
                <span className="text-2xl">{cat.icon}</span>
                <span className="text-xs text-gray-600 truncate w-full text-center">{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
          <input
            type="text"
            placeholder="Комментарий (необязательно)"
            className="w-full text-gray-800 placeholder-gray-400 outline-none text-sm"
            {...register('description')}
          />
        </div>

        {/* Submit */}
        <div className="mt-auto pb-4">
          <motion.button
            type="submit"
            whileTap={{ scale: 0.97 }}
            disabled={!amount || !selectedCategory || mutation.isPending}
            className="w-full bg-blue-600 text-white font-semibold text-lg py-4 rounded-2xl haptic disabled:opacity-40"
          >
            {mutation.isPending ? 'Сохранение...' : 'Добавить операцию'}
          </motion.button>
        </div>
      </form>
    </div>
  );
}
