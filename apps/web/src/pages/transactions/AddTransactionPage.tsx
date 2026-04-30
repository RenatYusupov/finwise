import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useFinanceStore, EXPENSE_CATEGORIES, INCOME_CATEGORIES, type TransactionType } from '@/features/finance/store';

const TYPE_TABS: { label: string; value: TransactionType; color: string }[] = [
  { label: 'Расход', value: 'expense', color: 'text-red-600' },
  { label: 'Доход', value: 'income', color: 'text-green-600' },
];

// Parse voice input like "потратил 500 рублей на кофе"
function parseVoiceInput(text: string): { amount?: number; description?: string } {
  const amountMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:рублей|рубля|руб|₽|р\.?)?/i);
  const amount = amountMatch ? parseFloat(amountMatch[1]!.replace(',', '.')) : undefined;

  // Remove amount from text to get description
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
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join('');
      setVoiceText(transcript);

      if (event.results[0]?.isFinal) {
        const parsed = parseVoiceInput(transcript);
        if (parsed.amount) setAmount(String(parsed.amount));
        if (parsed.description) setDescription(parsed.description);
        setVoiceText('');
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      setVoiceText('');
    };

    recognition.onend = () => {
      setIsListening(false);
    };

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

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-4 bg-white border-b border-gray-100">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center haptic text-lg"
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

      <div className="flex flex-col flex-1 px-4 pt-4 gap-4 overflow-y-auto">
        {/* Amount + Voice */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="text-gray-400 text-sm mb-2 text-center">Сумма</div>
          <div className="flex items-center justify-center gap-3">
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="text-4xl font-bold text-gray-900 bg-transparent outline-none text-center w-40 placeholder-gray-200"
            />
            <span className="text-3xl font-bold text-gray-300">₽</span>
          </div>

          {/* Voice button */}
          <div className="flex justify-center mt-3">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleVoiceInput}
              animate={isListening ? { scale: [1, 1.1, 1] } : {}}
              transition={isListening ? { repeat: Infinity, duration: 1 } : {}}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium haptic transition-all ${
                isListening
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              🎤 {isListening ? 'Слушаю...' : 'Голосовой ввод'}
            </motion.button>
          </div>

          {voiceText && (
            <div className="mt-2 text-center text-sm text-gray-500 italic">"{voiceText}"</div>
          )}

          {/* Quick amounts */}
          <div className="flex gap-2 mt-3 justify-center">
            {[100, 500, 1000, 3000].map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(String(preset))}
                className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-gray-600 haptic"
              >
                {preset.toLocaleString('ru-RU')}
              </button>
            ))}
          </div>
        </div>

        {/* Categories */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-sm font-medium text-gray-500 mb-3">Категория</div>
          <div className="grid grid-cols-4 gap-2">
            {categories.map((cat) => (
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
                <span className="text-xs text-gray-600 truncate w-full text-center leading-tight">{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-2">
          <span className="text-gray-400">✏️</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Комментарий (необязательно)"
            className="flex-1 text-gray-800 placeholder-gray-400 outline-none text-sm"
          />
        </div>

        {/* Submit */}
        <div className="pb-4">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSubmit}
            disabled={!amount || parseFloat(amount) <= 0 || !selectedCategory}
            className="w-full bg-blue-600 text-white font-semibold text-lg py-4 rounded-2xl haptic disabled:opacity-40"
          >
            Добавить операцию
          </motion.button>
        </div>
      </div>
    </div>
  );
}
