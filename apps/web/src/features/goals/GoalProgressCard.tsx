import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { formatCurrency } from '@/shared/utils/format';
import type { Goal } from '@finwise/shared-types';

interface Props {
  goal: Goal;
  compact?: boolean;
}

export function GoalProgressCard({ goal, compact = false }: Props) {
  const progress = goal.targetAmount > 0
    ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
    : 0;

  return (
    <Link to={`/goals/${goal.id}`} className="block bg-white rounded-2xl p-4 shadow-sm haptic">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-lg flex-shrink-0">
          {goal.icon ?? '🎯'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 text-sm truncate">{goal.title}</div>
          {!compact && (
            <div className="text-xs text-gray-400">
              {formatCurrency(goal.currentAmount)} из {formatCurrency(goal.targetAmount)}
            </div>
          )}
        </div>
        <div className="text-sm font-bold text-blue-600">{Math.round(progress)}%</div>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.8 }}
          className="bg-blue-500 h-1.5 rounded-full"
        />
      </div>
      {compact && (
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{formatCurrency(goal.currentAmount)}</span>
          <span>{formatCurrency(goal.targetAmount)}</span>
        </div>
      )}
    </Link>
  );
}
