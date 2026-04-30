import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useFinanceStore, EXPENSE_CATEGORIES, INCOME_CATEGORIES, type TransactionType } from '@/features/finance/store';

// Parse voice input like "потратил 500 рублей на кофе"
function parseVoiceInput(text: string): { amount: number | undefined; description: string | undefined } {
  const amountMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:рублей|рубля|руб|₽|р\.?)?/i);
  const amount = amountMatch ? parseFloat(amountMatch[1]!.replace(',', '.')) : undefined;
  const description = text
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:рублей|рубля|руб|₽|р\.?)?/gi, '')
    .replace(/(?:потратил|потратила|заплатил|заплатила|купил|купила|на|за|в|у)\s*/gi, '')
    .trim();
  return { amount, description: description || undefined };
}

export function AddTransactionPage() {
  const navigate = useNavigate();
  const { addTransaction } = useFinanceStore();
  const [type, setType] = useState<TransactionType>('expense');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const recognitionRef = useRef<any>(null);

  const categories = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const isExpense = type === 'expense';

  const handleVoiceInput = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Голосовой ввод не поддерживается в вашем браузере');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'ru-RU';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results).map((r: any) => r[0].transcript).join('');
      setVoiceText(transcript);
      if (event.results[0]?.isFinal) {
        const parsed = parseVoiceInput(transcript);
        if (parsed.amount) setAmount(String(parsed.amount));
        if (parsed.description) setDescription(parsed.description);
        setVoiceText('');
      }
    };
    recognition.onerror = () => { setIsListening(false); setVoiceText(''); };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

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

  const accentColor = isExpense ? '#FF6B35' : '#00C896';
  const accentBg = isExpense ? '#FFF0EB' : '#E8FFF5';

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ background: 'var(--bg-warm)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4 glass border-b border-white/60">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-2xl flex items-center justify-center haptic text-lg"
          style={{ background: 'rgba(0,0,0,0.06)' }}
        >
          ←
        </button>
        <h1 className="text-lg font-bold text-gray-900">Новая операция</h1>
      </div>

      <div className="flex flex-col flex-1 overflow-y-auto">
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

        {/* Amount card */}
        <div className="mx-4 mt-3 bg-white rounded-2xl p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center mb-3">Сумма</div>
          <div className="flex items-center justify-center gap-2 mb-4">
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="text-5xl font-bold bg-transparent outline-none text-center w-44 placeholder-gray-200"
              style={{ color: accentColor }}
            />
            <span className="text-3xl font-bold text-gray-200">₽</span>
          </div>

          {/* Quick amounts */}
          <div className="flex gap-2 justify-center mb-4">
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

          {/* Voice button */}
          <div className="flex justify-center">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleVoiceInput}
              animate={isListening ? { scale: [1, 1.08, 1] } : {}}
              transition={isListening ? { repeat: Infinity, duration: 0.8 } : {}}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold haptic transition-all"
              style={isListening
                ? { background: '#FF4757', color: 'white', boxShadow: '0 4px 16px rgba(255,71,87,0.4)' }
                : { background: accentBg, color: accentColor }
              }
            >
              🎤 {isListening ? 'Слушаю...' : 'Голосовой ввод'}
            </motion.button>
          </div>

          <AnimatePresence>
            {voiceText && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 text-center text-sm text-gray-500 italic"
              >
                "{voiceText}"
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Categories */}
        <div className="mx-4 mt-3 bg-white rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Категория</div>
          <div className="grid grid-cols-4 gap-2">
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <motion.button
                  key={cat.id}
                  whileTap={{ scale: 0.93 }}
                  onClick={() => setSelectedCategory(cat.id)}
                  className="flex flex-col items-center gap-1 p-2.5 rounded-2xl haptic transition-all"
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
              );
            })}
          </div>
        </div>

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
          />
        </div>

        {/* Submit */}
        <div className="mx-4 mt-4 mb-6">
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
