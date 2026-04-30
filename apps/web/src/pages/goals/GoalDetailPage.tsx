import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { apiClient } from '@/shared/api/client';
import { formatCurrency } from '@/shared/utils/format';
import type { Goal } from '@finwise/shared-types';

export function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [depositAmount, setDepositAmount] = useState('');

  const { data: goal, isLoading } = useQuery<Goal>({
    queryKey: ['goals', id],
    queryFn: () => apiClient.get(`/goals/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

  const depositMutation = useMutation({
    mutationFn: (amount: number) =>
      apiClient.post(`/goals/${id}/deposit`, { amount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      setDepositAmount('');
    },
  });

  if (isLoading) {
    return (
      <div className="px-4 pt-6 space-y-4">
        <div className="h-8 bg-gray-100 rounded-xl animate-pulse w-1/2" />
        <div className="h-40 bg-gray-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!goal) return null;

  const progress = goal.targetAmount > 0
    ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
    : 0;
  const remaining = goal.targetAmount - goal.currentAmount;

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
        <h1 className="text-lg font-bold text-gray-900 flex-1 truncate">{goal.name}</h1>
        <div className="text-2xl">{goal.icon ?? '🎯'}</div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 space-y-4">
        {/* Progress card */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-end mb-3">
            <div>
              <div className="text-gray-400 text-sm">Накоплено</div>
              <div className="text-2xl font-bold text-gray-900">
                {formatCurrency(goal.currentAmount)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-gray-400 text-sm">Цель</div>
              <div className="text-lg font-semibold text-gray-700">
                {formatCurrency(goal.targetAmount)}
              </div>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1 }}
              className="bg-blue-500 h-3 rounded-full"
            />
          </div>
          <div className="flex justify-between text-sm text-gray-500">
            <span>{Math.round(progress)}% выполнено</span>
            <span>осталось {formatCurrency(remaining)}</span>
          </div>
        </div>

        {/* Deadline */}
        {goal.deadline && (
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <div className="text-2xl">📅</div>
            <div>
              <div className="text-sm text-gray-400">Срок</div>
              <div className="font-semibold text-gray-900">
                {new Date(goal.deadline).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </div>
            </div>
          </div>
        )}

        {/* Deposit */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-sm font-medium text-gray-500 mb-3">Пополнить цель</div>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="Сумма"
                className="flex-1 bg-transparent outline-none text-gray-800"
              />
              <span className="text-gray-400">₽</span>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                if (depositAmount) {
                  depositMutation.mutate(parseFloat(depositAmount));
                }
              }}
              disabled={!depositAmount || depositMutation.isPending}
              className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-xl haptic disabled:opacity-40"
            >
              +
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
