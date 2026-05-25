import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useFinanceStore, type TransactionType } from './store';

// ── Emoji presets (30 items, distinct from system categories) ─────────────────
const EMOJI_PRESETS = [
  '🐾','🍼','🏡','🎸','🌿','📱','🎨','✂️','🔧','⚽',
  '🎬','🌏','💎','🐕','🐈','🌸','🎭','🛒','⚡','🎯',
  '🌟','💫','🎵','🏖️','🎪','🦋','🌺','🍕','🏃','💡',
];

// ── Auto-color palette ─────────────────────────────────────────────────────────
const PALETTE = [
  '#FF6B6B','#FF9F43','#F7DC6F','#82E0AA','#4ECDC4',
  '#45B7D1','#AED6F1','#DDA0DD','#F0B27A','#98D8C8',
];

function autoColor(name: string): string {
  const n = name || 'x';
  const hash = n.split('').reduce((a, c) => ((a * 31 + c.charCodeAt(0)) | 0), 0);
  return PALETTE[Math.abs(hash) % PALETTE.length]!;
}

// ─────────────────────────────────────────────────────────────────────────────

interface CreateCategorySheetProps {
  /** Transaction type context — auto-assigns category type */
  type: TransactionType;
  onClose: () => void;
  /** Called with the new category id right after creation */
  onCreated: (catId: string) => void;
}

export function CreateCategorySheet({ type, onClose, onCreated }: CreateCategorySheetProps) {
  const { customCategories, addCustomCategory } = useFinanceStore();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');

  const catType = type === 'income' ? 'income' : 'expense';
  const isAtLimit = customCategories.length >= 20;
  const canSave = !isAtLimit && name.trim().length > 0 && icon.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const trimmedName = name.trim();
    const newId = addCustomCategory({
      name: trimmedName,
      icon,
      type: catType,
      color: autoColor(trimmedName),
    });
    if (newId) {
      onCreated(newId);
      onClose();
    }
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-end"
      style={{ zIndex: 70, background: 'rgba(26,26,46,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full bg-white rounded-t-3xl"
        style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="pt-3 pb-1 px-6">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
          <button onClick={onClose} className="text-sm text-gray-400 haptic">
            Отмена
          </button>
          <h2 className="text-base font-bold text-gray-900">Новая категория</h2>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="text-sm font-bold haptic"
            style={{ color: canSave ? '#6C63FF' : '#C4C4C4' }}
          >
            Создать
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Limit warning */}
          {isAtLimit && (
            <div
              className="text-xs text-orange-700 py-2 px-3 rounded-xl"
              style={{ background: 'rgba(255,152,0,0.1)' }}
            >
              Достигнут лимит 20 кастомных категорий. Удалите неиспользуемые.
            </div>
          )}

          {/* Name input */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Название
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 20))}
              placeholder="Например: Питомец"
              disabled={isAtLimit}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-purple-400 disabled:opacity-50"
              style={{ fontSize: '16px' }}
              autoComplete="off"
            />
            <div className="text-right text-xs text-gray-400 mt-0.5">
              {name.length}/20
            </div>
          </div>

          {/* Emoji picker */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Иконка
            </label>
            <div className="grid grid-cols-6 gap-2">
              {EMOJI_PRESETS.map((emoji) => (
                <button
                  key={emoji}
                  disabled={isAtLimit}
                  onClick={() => setIcon(emoji)}
                  className="h-11 rounded-2xl text-xl haptic flex items-center justify-center transition-all"
                  style={{
                    background: icon === emoji ? '#6C63FF' : '#F3F4F6',
                    transform: icon === emoji ? 'scale(1.08)' : 'scale(1)',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          {name.trim() && icon && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-3 rounded-2xl"
              style={{ background: 'rgba(108,99,255,0.06)' }}
            >
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{ background: autoColor(name.trim()) + '33' }}
              >
                {icon}
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-800">{name.trim()}</div>
                <div className="text-xs text-gray-400">
                  {catType === 'expense' ? 'Расход' : 'Доход'} · Кастомная
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
