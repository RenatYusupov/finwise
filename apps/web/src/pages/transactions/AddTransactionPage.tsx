import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useFinanceStore, EXPENSE_CATEGORIES, INCOME_CATEGORIES, type TransactionType } from '@/features/finance/store';
import { CreateCategorySheet } from '@/features/finance/CreateCategorySheet';
import { parseTransactionsWithGroq, type GroqParsedTx } from '@/features/ai/groqParser';

type ParsedTx = GroqParsedTx;

export function AddTransactionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addTransaction, customCategories, deleteCustomCategory, transactions } = useFinanceStore();
  const initialType: TransactionType = searchParams.get('type') === 'income' ? 'income' : 'expense';
  const [type, setType] = useState<TransactionType>(initialType);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [showCreateCat, setShowCreateCat] = useState(false);

  // Dictation mode state
  const [dictateMode, setDictateMode] = useState(false);
  const [dictateText, setDictateText] = useState('');
  const [parsedTxs, setParsedTxs] = useState<ParsedTx[] | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState('');

  const systemCategories = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const customOfType = customCategories.filter((c) => c.type === type);
  const categories = [...systemCategories, ...customOfType];
  const isExpense = type === 'expense';
  const accentColor = isExpense ? '#FF6B35' : '#00C896';
  const accentBg = isExpense ? '#FFF0EB' : '#E8FFF5';

  const handleSubmit = () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0 || !selectedCategory) return;
    addTransaction({
      type,
      amount: numAmount,
      categoryId: selectedCategory,
      description: description.trim(),
      date: new Date().toISOString(),
    });
    navigate(-1);
  };

  // Parse via Groq LLM only
  const handleDictateParse = async () => {
    const text = dictateText.trim();
    if (!text) return;

    setIsParsing(true);
    setParseError('');
    setParsedTxs(null);

    const result = await parseTransactionsWithGroq(text);

    setIsParsing(false);

    if (result && result.length > 0) {
      setParsedTxs(result);
    } else {
      setParseError(
        'Не удалось распознать операции. Проверьте подключение к интернету и попробуйте ещё раз.'
      );
    }
  };

  const handleSaveParsed = () => {
    if (!parsedTxs) return;
    for (const tx of parsedTxs) {
      addTransaction({
        type: tx.type,
        amount: tx.amount,
        categoryId: tx.categoryId,
        description: tx.description,
        date: new Date().toISOString(),
      });
    }
    navigate(-1);
  };

  const handleFillFromParsed = (tx: ParsedTx) => {
    setType(tx.type);
    setAmount(String(tx.amount));
    setDescription(tx.description);
    setSelectedCategory(tx.categoryId);
    setDictateMode(false);
    setParsedTxs(null);
    setDictateText('');
  };

  const getCategoryName = (catId: string): string => {
    const all = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, ...customCategories];
    return all.find((c) => c.id === catId)?.name ?? catId;
  };

  const getCategoryIcon = (catId: string): string => {
    const all = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, ...customCategories];
    return all.find((c) => c.id === catId)?.icon ?? '💰';
  };

  const handleDeleteCustomCat = (catId: string, catName: string) => {
    const txCount = transactions.filter((t) => t.categoryId === catId).length;
    const msg = txCount > 0
      ? `Есть ${txCount} ${txCount === 1 ? 'транзакция' : txCount < 5 ? 'транзакции' : 'транзакций'} с этой категорией. Удалить категорию?`
      : `Удалить категорию «${catName}»?`;
    const tg = window.Telegram?.WebApp;
    if (tg?.showConfirm) {
      tg.showConfirm(msg, (confirmed) => {
        if (confirmed) {
          deleteCustomCategory(catId);
          if (selectedCategory === catId) setSelectedCategory('');
        }
      });
    } else if (window.confirm(msg)) {
      deleteCustomCategory(catId);
      if (selectedCategory === catId) setSelectedCategory('');
    }
  };

  // ── Dictate mode ──────────────────────────────────────────────────────────
  if (dictateMode) {
    return (
      <div className="flex flex-col flex-1 min-h-0" style={{ background: 'var(--bg-warm)' }}>
        <div className="flex-shrink-0 flex items-center gap-3 px-4 pt-5 pb-4 glass border-b border-white/60">
          <button
            onClick={() => { setDictateMode(false); setParsedTxs(null); setParseError(''); }}
            className="w-9 h-9 rounded-2xl flex items-center justify-center haptic text-lg"
            style={{ background: 'rgba(0,0,0,0.06)' }}
          >
            ←
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex-1">Голосовой ввод</h1>
          <div className="text-xs px-2 py-1 rounded-full font-medium"
            style={{ background: 'rgba(108,99,255,0.1)', color: '#6C63FF' }}>
            Groq AI
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          {/* Instructions */}
          <div className="bg-white rounded-2xl p-4 mb-4" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="text-sm font-semibold text-gray-700 mb-2">💡 Как использовать</div>
            <div className="text-xs text-gray-500 space-y-1 mb-3">
              <div>• Нажмите на поле ниже и используйте 🎤 на клавиатуре</div>
              <div>• Или просто напечатайте текстом</div>
              <div>• Можно описать несколько трат сразу</div>
            </div>
            <div className="space-y-1.5">
              {[
                'потратил 500 на кофе',
                'я с утра попил кофе за 500 потом пообедал за 600',
                'купил продукты на 1500 и такси 350',
                'зарплата 80000',
              ].map((ex) => (
                <button
                  key={ex}
                  onClick={() => { setDictateText(ex); setParsedTxs(null); setParseError(''); }}
                  className="block w-full text-left text-xs px-3 py-2 rounded-xl haptic"
                  style={{ background: 'rgba(108,99,255,0.06)', color: '#6C63FF' }}
                >
                  «{ex}»
                </button>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <div className="bg-white rounded-2xl p-4 mb-3" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Опишите операцию</div>
            <textarea
              value={dictateText}
              onChange={(e) => { setDictateText(e.target.value); setParsedTxs(null); setParseError(''); }}
              placeholder="Например: я с утра попил кофе за 500 потом пообедал за 600..."
              rows={4}
              className="w-full bg-transparent outline-none text-sm text-gray-800 placeholder-gray-300 resize-none"
              style={{ fontSize: '16px', lineHeight: '1.5', border: 'none' }}
              autoComplete="off"
              autoCorrect="on"
              autoCapitalize="sentences"
            />
          </div>

          {/* Parse button */}
          {dictateText.trim() && !parsedTxs && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={handleDictateParse}
              disabled={isParsing}
              className="w-full py-4 rounded-2xl text-white font-bold text-base haptic mb-4 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)' }}
            >
              {isParsing ? (
                <span className="flex items-center justify-center gap-2">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="inline-block"
                  >
                    ⏳
                  </motion.span>
                  Анализирую через AI...
                </span>
              ) : (
                '🤖 Распознать через Groq AI'
              )}
            </motion.button>
          )}

          {/* Error */}
          {parseError && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-orange-700 py-3 px-4 rounded-2xl mb-4 flex items-start gap-2"
              style={{ background: 'rgba(255,152,0,0.1)' }}
            >
              <span className="flex-shrink-0">⚠️</span>
              <span>{parseError}</span>
            </motion.div>
          )}

          {/* Parsed results */}
          <AnimatePresence>
            {parsedTxs && parsedTxs.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-sm font-semibold text-gray-700">
                    ✅ Распознано {parsedTxs.length} {parsedTxs.length === 1 ? 'операция' : parsedTxs.length < 5 ? 'операции' : 'операций'}
                  </div>
                  <div className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(108,99,255,0.1)', color: '#6C63FF' }}>
                    Groq AI
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  {parsedTxs.map((tx, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="bg-white rounded-2xl p-3 flex items-center gap-3"
                      style={{ boxShadow: 'var(--shadow-card)' }}
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                        style={{ background: tx.type === 'expense' ? '#FFF0EB' : '#E8FFF5' }}>
                        {getCategoryIcon(tx.categoryId)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-800 truncate">
                          {tx.description || getCategoryName(tx.categoryId)}
                        </div>
                        <div className="text-xs text-gray-400">{getCategoryName(tx.categoryId)}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-bold text-base"
                          style={{ color: tx.type === 'expense' ? '#FF6B35' : '#00C896' }}>
                          {tx.type === 'expense' ? '−' : '+'}{tx.amount.toLocaleString('ru-RU')} ₽
                        </div>
                        <button
                          onClick={() => handleFillFromParsed(tx)}
                          className="text-xs text-purple-400 haptic"
                        >
                          Изменить
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSaveParsed}
                  className="w-full py-4 rounded-2xl text-white font-bold text-base haptic mb-3"
                  style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)', boxShadow: '0 4px 20px rgba(108,99,255,0.35)' }}
                >
                  💾 Сохранить {parsedTxs.length > 1 ? `все ${parsedTxs.length} операции` : 'операцию'}
                </motion.button>

                {parsedTxs.length === 1 && (
                  <button
                    onClick={() => handleFillFromParsed(parsedTxs[0]!)}
                    className="w-full py-3 rounded-2xl text-sm font-semibold haptic"
                    style={{ background: 'rgba(108,99,255,0.08)', color: '#6C63FF' }}
                  >
                    ✏️ Редактировать перед сохранением
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // ── Manual entry mode ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ background: 'var(--bg-warm)' }}>
      <div className="flex-shrink-0 flex items-center gap-3 px-4 pt-5 pb-4 glass border-b border-white/60">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-2xl flex items-center justify-center haptic text-lg"
          style={{ background: 'rgba(0,0,0,0.06)' }}
        >
          ←
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">Новая операция</h1>
        <button
          onClick={() => setDictateMode(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-sm font-semibold haptic"
          style={{ background: 'rgba(108,99,255,0.1)', color: '#6C63FF' }}
        >
          🎤 Надиктовать
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Type selector */}
        <div className="flex gap-1 mx-4 mt-4 rounded-2xl p-1" style={{ background: 'rgba(0,0,0,0.06)' }}>
          {([
            { label: '↓ Расход', value: 'expense' as TransactionType, color: '#FF6B35' },
            { label: '↑ Доход', value: 'income' as TransactionType, color: '#00C896' },
          ]).map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setType(tab.value); setSelectedCategory(''); }}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold haptic transition-all"
              style={type === tab.value
                ? { background: 'white', color: tab.color, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }
                : { color: '#9CA3AF' }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Amount */}
        <div className="mx-4 mt-3 bg-white rounded-2xl p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center mb-3">Сумма</div>
          <div className="flex items-center justify-center gap-2 mb-4">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="text-5xl font-bold bg-transparent outline-none text-center w-44 placeholder-gray-200"
              style={{ color: accentColor, fontSize: '3rem' }}
            />
            <span className="text-3xl font-bold text-gray-200">₽</span>
          </div>
          <div className="flex gap-2 justify-center">
            {[100, 500, 1000, 3000].map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(String(preset))}
                className="px-3 py-1.5 rounded-full text-xs font-semibold haptic transition-all"
                style={amount === String(preset)
                  ? { background: accentColor, color: 'white' }
                  : { background: accentBg, color: accentColor }
                }
              >
                {preset.toLocaleString('ru-RU')}
              </button>
            ))}
          </div>
        </div>

        {/* Categories */}
        <div className="mx-4 mt-3 bg-white rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Категория</div>
          <div className="grid grid-cols-4 gap-2">
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              const isCustom = cat.id.startsWith('custom_');
              return (
                <div key={cat.id} className="relative">
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={() => setSelectedCategory(cat.id)}
                    className="w-full flex flex-col items-center gap-1 p-2.5 rounded-2xl haptic transition-all"
                    style={isSelected
                      ? { background: accentBg, outline: `2px solid ${accentColor}` }
                      : { background: '#F9FAFB' }
                    }
                  >
                    <span className="text-2xl">{cat.icon}</span>
                    <span className="text-xs font-medium truncate w-full text-center leading-tight"
                      style={{ color: isSelected ? accentColor : '#6B7280' }}>
                      {cat.name}
                    </span>
                  </motion.button>
                  {/* Delete button for custom categories */}
                  {isCustom && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteCustomCat(cat.id, cat.name); }}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white haptic"
                      style={{ background: '#EF4444', fontSize: '9px', lineHeight: 1, zIndex: 1 }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {/* Create custom category button */}
          <button
            onClick={() => setShowCreateCat(true)}
            className="mt-3 w-full py-2 rounded-2xl text-xs font-semibold haptic flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(108,99,255,0.06)', color: '#6C63FF' }}
          >
            <span>+</span>
            <span>Создать категорию</span>
          </button>
        </div>

        {/* CreateCategorySheet portal */}
        {showCreateCat && (
          <CreateCategorySheet
            type={type}
            onClose={() => setShowCreateCat(false)}
            onCreated={(catId) => { setSelectedCategory(catId); setShowCreateCat(false); }}
          />
        )}

        {/* Description */}
        <div className="mx-4 mt-3 bg-white rounded-2xl px-4 py-3 flex items-center gap-2"
          style={{ boxShadow: 'var(--shadow-card)' }}>
          <span className="text-gray-300 text-lg">✏️</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Комментарий (необязательно)"
            className="flex-1 text-gray-800 placeholder-gray-300 outline-none text-sm font-medium"
            style={{ fontSize: '16px' }}
          />
        </div>

        {/* Submit */}
        <div className="mx-4 mt-4 mb-8">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSubmit}
            disabled={!amount || parseFloat(amount) <= 0 || !selectedCategory}
            className="w-full text-white font-bold text-lg py-4 rounded-2xl haptic disabled:opacity-40"
            style={{
              background: isExpense
                ? 'linear-gradient(135deg, #FF6B35, #FF8C42)'
                : 'linear-gradient(135deg, #00C896, #00A87A)',
              boxShadow: isExpense
                ? '0 4px 20px rgba(255,107,53,0.35)'
                : '0 4px 20px rgba(0,200,150,0.35)',
            }}
          >
            {isExpense ? '↓ Записать расход' : '↑ Записать доход'}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
