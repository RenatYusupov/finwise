import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useFinanceStore } from '@/features/finance/store';
import { ClarifyCategoryStep } from './ProfilePage';
import { toast } from 'react-hot-toast';

export function RecategorizationSheet({ onClose }: { onClose: () => void }) {
  const { transactions } = useFinanceStore();
  const [txIds, setTxIds] = useState<string[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const initialTxCount = useRef(0);

  // Fetch all other_exp/other_inc transactions from entire history
  useEffect(() => {
    // Filter for other_exp and other_inc transactions
    const otherTxs = transactions
      .filter((t) => t.categoryId === 'other_exp' || t.categoryId === 'other_inc')
      .sort((a, b) => b.amount - a.amount) // Sort by amount descending
      .slice(0, 30); // Limit to 30 transactions

    setTxIds(otherTxs.map((t) => t.id));
    initialTxCount.current = otherTxs.length;
  }, [transactions]);

  const handleDone = () => {
    // Calculate how many categories were updated
    const currentOtherTxs = transactions.filter((t) => t.categoryId === 'other_exp' || t.categoryId === 'other_inc');
    const remainingCount = currentOtherTxs.length;
    const updatedCount = initialTxCount.current - remainingCount;
    
    if (updatedCount > 0) {
      toast.success(`Обновлено ${updatedCount} категорий`);
    }
    
    onClose();
  };

  // Block background scroll in Telegram WebView
  useEffect(() => {
    const overlay = document.getElementById('recategorization-overlay');
    if (!overlay) return;
    
    const prevent = (e: TouchEvent) => {
      if (e.target === overlay) {
        e.preventDefault();
      }
    };
    
    overlay.addEventListener('touchmove', prevent, { passive: false });
    return () => overlay.removeEventListener('touchmove', prevent);
  }, []);

  return createPortal(
    <motion.div
      id="recategorization-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end"
      style={{ 
        background: 'rgba(26,26,46,0.65)', 
        backdropFilter: 'blur(6px)',
        touchAction: 'none'
      }}
      onClick={(e) => { 
        if (e.target === e.currentTarget) onClose(); 
      }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full bg-white rounded-t-3xl"
        style={{ 
          maxHeight: '88vh', 
          display: 'flex', 
          flexDirection: 'column' 
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex-shrink-0 pt-4 pb-2 px-6">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
        </div>
        
        {/* Content area */}
        <div 
          className="flex-1 overflow-y-auto px-6 pb-4"
          style={{
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'none',
            touchAction: 'pan-y',
          }}
        >
          <h2 className="text-xl font-bold text-gray-900 mb-1">🗂️ Уточнение категорий</h2>
          <p className="text-sm text-gray-400 mb-4">
            Уточните категории для операций «Прочее» из всей истории
          </p>
          
          {txIds.length > 0 ? (
            <ClarifyCategoryStep 
              txIds={txIds} 
              onDone={handleDone} 
            />
          ) : (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">✅</div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Все категории уточнены!</h3>
              <p className="text-sm text-gray-500">
                Нет операций с категорией «Прочее» в истории
              </p>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onClose}
                className="mt-6 w-full py-3 rounded-2xl font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)' }}
              >
                Готово
              </motion.button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}