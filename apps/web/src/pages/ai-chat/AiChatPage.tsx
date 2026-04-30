import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFinanceStore } from '@/features/finance/store';
import { generateAiResponse } from '@/features/ai/smartResponses';

const QUICK_PROMPTS = [
  'Как я трачу деньги?',
  'Где можно сэкономить?',
  'Анализ за месяц',
  'Помоги с бюджетом',
];

export function AiChatPage() {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { aiMessages, addAiMessage, clearAiChat, transactions, goals, getMonthSummary, getCategorySpending } =
    useFinanceStore();

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;
    setInput('');

    // Add user message
    addAiMessage({ role: 'user', content: trimmed });

    // Simulate AI thinking
    setIsTyping(true);
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));

    // Generate smart response
    const summary = getMonthSummary();
    const categorySpending = getCategorySpending();
    const response = generateAiResponse(trimmed, { transactions, goals, summary, categorySpending });

    addAiMessage({ role: 'assistant', content: response });
    setIsTyping(false);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, isTyping]);

  // Send welcome message on first open
  useEffect(() => {
    if (aiMessages.length === 0) {
      setTimeout(() => {
        addAiMessage({
          role: 'assistant',
          content:
            '🦉 Привет! Я твой финансовый советник FinWise.\n\nЯ анализирую твои доходы и расходы и даю персональные советы. Спроси меня что-нибудь!',
        });
      }, 500);
    }
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-xl">
              🦉
            </div>
            <div>
              <div className="font-bold text-gray-900">Финансовый советник</div>
              <div className="text-xs text-green-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block" />
                Онлайн
              </div>
            </div>
          </div>
          {aiMessages.length > 0 && (
            <button
              onClick={clearAiChat}
              className="text-xs text-gray-400 px-3 py-1 rounded-full border border-gray-200 haptic"
            >
              Очистить
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {aiMessages.length === 0 && !isTyping && (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">🦉</div>
            <div className="font-semibold text-gray-700 mb-1">Привет! Я твой финансовый советник</div>
            <div className="text-sm text-gray-400 mb-6">Задай любой вопрос о своих финансах</div>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 haptic text-left active:bg-gray-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {aiMessages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-sm mr-2 mt-1 flex-shrink-0">
                  🦉
                </div>
              )}
              <div
                className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm whitespace-pre-line ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-white text-gray-800 shadow-sm rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isTyping && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-sm mr-2 flex-shrink-0">
              🦉
            </div>
            <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ y: [0, -4, 0] }}
                    transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.15 }}
                    className="w-2 h-2 bg-gray-400 rounded-full"
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Quick prompts after first message */}
        {aiMessages.length > 0 && !isTyping && (
          <div className="flex flex-wrap gap-2 pt-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleSend(prompt)}
                className="bg-white border border-gray-200 rounded-full px-3 py-1.5 text-xs text-gray-600 haptic active:bg-gray-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-white border-t border-gray-100 safe-bottom">
        <div className="flex gap-2 items-end">
          <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 min-h-[44px] flex items-center">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
              placeholder="Спроси что-нибудь..."
              className="flex-1 bg-transparent outline-none text-sm text-gray-800 placeholder-gray-400"
            />
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => handleSend(input)}
            disabled={!input.trim() || isTyping}
            className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center haptic disabled:opacity-40 text-lg"
          >
            ↑
          </motion.button>
        </div>
      </div>
    </div>
  );
}
