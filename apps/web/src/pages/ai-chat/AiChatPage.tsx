import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '@/shared/api/client';
import type { AiMessage } from '@finwise/shared-types';

const QUICK_PROMPTS = [
  'Как я трачу деньги?',
  'Где можно сэкономить?',
  'Как накопить быстрее?',
  'Анализ за месяц',
];

export function AiChatPage() {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: messages } = useQuery<AiMessage[]>({
    queryKey: ['ai', 'chat'],
    queryFn: () => apiClient.get('/ai/chat').then((r) => r.data.data),
    initialData: [],
  });

  const sendMutation = useMutation({
    mutationFn: (text: string) => apiClient.post('/ai/chat', { message: text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'chat'] });
    },
  });

  const handleSend = (text: string) => {
    if (!text.trim()) return;
    setInput('');
    sendMutation.mutate(text);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-xl">
            🦉
          </div>
          <div>
            <div className="font-bold text-gray-900">Финансовый советник</div>
            <div className="text-xs text-green-500">● Онлайн</div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {!messages?.length && (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">🦉</div>
            <div className="font-semibold text-gray-700 mb-1">Привет! Я твой финансовый советник</div>
            <div className="text-sm text-gray-400 mb-6">
              Задай любой вопрос о своих финансах
            </div>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 haptic text-left"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages?.map((msg) => (
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
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
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

        {sendMutation.isPending && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-sm mr-2 flex-shrink-0">
              🦉
            </div>
            <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1">
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

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-white border-t border-gray-100">
        <div className="flex gap-2 items-end">
          <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 min-h-[44px] flex items-center">
            <input
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
            disabled={!input.trim() || sendMutation.isPending}
            className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center haptic disabled:opacity-40"
          >
            ↑
          </motion.button>
        </div>
      </div>
    </div>
  );
}
