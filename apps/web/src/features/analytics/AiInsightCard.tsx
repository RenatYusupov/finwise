import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AiInsight } from '@finwise/shared-types';

interface Props {
  insight: AiInsight;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'border-red-200 bg-red-50',
  medium: 'border-yellow-200 bg-yellow-50',
  low: 'border-blue-200 bg-blue-50',
};

const PRIORITY_ICONS: Record<string, string> = {
  high: '🚨',
  medium: '💡',
  low: '📊',
};

export function AiInsightCard({ insight }: Props) {
  const [expanded, setExpanded] = useState(false);

  const colorClass = PRIORITY_COLORS[insight.priority] ?? PRIORITY_COLORS['low'];
  const icon = PRIORITY_ICONS[insight.priority] ?? '💡';

  return (
    <motion.div
      layout
      onClick={() => setExpanded((v) => !v)}
      className={`rounded-2xl border-2 p-4 cursor-pointer haptic ${colorClass}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 text-sm">{insight.title}</div>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-sm text-gray-600 mt-1 overflow-hidden"
              >
                {insight.description}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <span className="text-gray-400 text-sm flex-shrink-0">{expanded ? '▲' : '▼'}</span>
      </div>
    </motion.div>
  );
}
