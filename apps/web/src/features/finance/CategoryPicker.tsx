/**
 * CategoryPicker — shared category selection component.
 *
 * Renders system categories filtered by `type`, custom categories from store,
 * a delete (✕) button on custom categories, and a "+ Создать категорию" CTA.
 *
 * Used in: PostImportWizard, RecategorizationSheet (via ProfilePage),
 *          StepFirstTransaction (onboarding), RecurringPage.
 *
 * Interface:
 *   type     — 'expense' | 'income' — filters system categories
 *   selected — currently selected category id
 *   onChange — called when user taps a category
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  useFinanceStore,
  type TransactionType,
} from './store';
import { CreateCategorySheet } from './CreateCategorySheet';

interface CategoryPickerProps {
  type: 'expense' | 'income';
  selected: string;
  onChange: (categoryId: string) => void;
}

export function CategoryPicker({ type, selected, onChange }: CategoryPickerProps) {
  const { customCategories, deleteCustomCategory } = useFinanceStore();
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const systemCats = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const filteredCustom = customCategories.filter((c) => {
    const catType: TransactionType = type === 'expense' ? 'expense' : 'income';
    return c.type === catType;
  });

  const handleDeleteConfirm = (id: string) => {
    // If selected was the deleted category, clear selection
    if (selected === id) onChange('');
    deleteCustomCategory(id);
    setConfirmDeleteId(null);
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {/* System categories */}
        {systemCats.map((cat) => (
          <motion.button
            key={cat.id}
            whileTap={{ scale: 0.93 }}
            onClick={() => onChange(cat.id)}
            className="flex flex-col items-center gap-1 py-3 rounded-2xl text-center haptic"
            style={{
              background: selected === cat.id ? '#6C63FF' : '#F3F4F6',
              color: selected === cat.id ? '#fff' : '#374151',
            }}
          >
            <span className="text-xl leading-none">{cat.icon}</span>
            <span className="text-xs font-medium leading-tight">{cat.name}</span>
          </motion.button>
        ))}

        {/* Custom categories */}
        {filteredCustom.map((cat) => (
          <div key={cat.id} className="relative">
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => onChange(cat.id)}
              className="w-full flex flex-col items-center gap-1 py-3 rounded-2xl text-center haptic"
              style={{
                background: selected === cat.id ? '#6C63FF' : '#F3F4F6',
                color: selected === cat.id ? '#fff' : '#374151',
              }}
            >
              <span className="text-xl leading-none">{cat.icon}</span>
              <span className="text-xs font-medium leading-tight truncate w-full px-1">
                {cat.name}
              </span>
            </motion.button>
            {/* Delete button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDeleteId(cat.id);
              }}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold leading-none haptic"
              style={{ background: '#EF4444', color: '#fff', zIndex: 1 }}
              aria-label={`Удалить категорию ${cat.name}`}
            >
              ✕
            </button>
          </div>
        ))}

        {/* + Создать категорию */}
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={() => setShowCreate(true)}
          className="flex flex-col items-center gap-1 py-3 rounded-2xl text-center haptic"
          style={{
            background: '#F0EEFF',
            color: '#6C63FF',
            border: '1.5px dashed #C4BFFF',
          }}
        >
          <span className="text-xl leading-none">＋</span>
          <span className="text-xs font-medium leading-tight">Создать</span>
        </motion.button>
      </div>

      {/* Delete confirmation dialog */}
      <AnimatePresence>
        {confirmDeleteId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center px-6"
            style={{ background: 'rgba(26,26,46,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => setConfirmDeleteId(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 340 }}
              className="bg-white rounded-3xl p-5 w-full max-w-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-4">
                <div className="text-3xl mb-2">🗑️</div>
                <div className="text-base font-bold text-gray-900 mb-1">Удалить категорию?</div>
                <div className="text-sm text-gray-400 leading-snug">
                  Транзакции с этой категорией не удалятся, но потеряют привязку.
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-2.5 rounded-2xl text-sm font-semibold haptic"
                  style={{ background: '#F3F4F6', color: '#374151' }}
                >
                  Отмена
                </button>
                <button
                  onClick={() => handleDeleteConfirm(confirmDeleteId)}
                  className="flex-1 py-2.5 rounded-2xl text-sm font-bold haptic"
                  style={{ background: '#EF4444', color: '#fff' }}
                >
                  Удалить
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CreateCategorySheet */}
      <AnimatePresence>
        {showCreate && (
          <CreateCategorySheet
            type={type}
            onClose={() => setShowCreate(false)}
            onCreated={(catId) => {
              onChange(catId);
              setShowCreate(false);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
