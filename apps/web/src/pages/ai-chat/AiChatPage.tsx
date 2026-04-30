import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFinanceStore } from '@/features/finance/store';
import { generateAiResponse } from '@/features/ai/smartResponses';

const QUICK_PROMPTS = [
  { text: 'Как я трачу деньги?', icon: '📊' },
  { text: 'Где можно сэкономить?', icon: '💡' },
  { text: 'Анализ за месяц', icon: '📅' },
  { text: 'Помоги с бюджетом', icon: '🎯' },
  { text: 'Как накопить быстрее?', icon: '🚀' },
  { text: 'Советы по инвестициям', icon: '📈' },
];

// Voice hook — checks isSecureContext to avoid service-not-allowed in Telegram WebView
function useVoiceInput(onResult: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  // voiceBlocked: set true when service-not-allowed fires — hides button dynamically
  const [voiceBlocked, setVoiceBlocked] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Only show voice button when: API exists AND page is in a secure context (HTTPS/localhost)
  // Telegram WebView may have the API but block it — isSecureContext catches that
  const supported =
    typeof window !== 'undefined' &&
    !!window.isSecureContext &&
    (!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition) &&
    !voiceBlocked;

  const toggle = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setVoiceText('');
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'ru-RU';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join('');
      setVoiceText(transcript);

      const lastResult = event.results[event.results.length - 1];
      if (lastResult?.isFinal) {
        onResult(transcript);
        setVoiceText('');
        setIsListening(false);
      }
    };

    recognition.onerror = (e: any) => {
      setIsListening(false);
      setVoiceText('');
      if (e.error === 'service-not-allowed' || e.error === 'not-allowed') {
        // Silently hide the voice button — WebView/browser doesn't permit it
        setVoiceBlocked(true);
      } else if (e.error === 'no-speech') {
        // User didn't speak — ignore silently
      } else {
        console.warn('Voice recognition error:', e.error);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    try {
      recognition.start();
    } catch (err) {
      console.warn('Recognition start error:', err);
      setIsListening(false);
      setVoiceBlocked(true);
    }
  }, [isListening, onResult]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return { isListening, voiceText, toggle, supported };
}

export function AiChatPage() {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { aiMessages, addAiMessage, clearAiChat, transactions, goals, getMonthSummary, getCategorySpending } =
    useFinanceStore();

  const handleSend = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;
    setInput('');

    addAiMessage({ role: 'user', content: trimmed });

    setIsTyping(true);
    await new Promise((r) => setTimeout(r, 900 + Math.random() * 600));

    const summary = getMonthSummary();
    const categorySpending = getCategorySpending();
    const response = generateAiResponse(trimmed, { transactions, goals, summary, categorySpending });

    addAiMessage({ role: 'assistant', content: response });
    setIsTyping(false);
  }, [isTyping, addAiMessage, getMonthSummary, getCategorySpending, transactions, goals]);

  const { isListening, voiceText, toggle: toggleVoice, supported: voiceSupported } = useVoiceInput((text) => {
    handleSend(text);
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, isTyping, voiceText]);

  useEffect(() => {
    if (aiMessages.length === 0) {
      const timer = setTimeout(() => {
        addAiMessage({
          role: 'assistant',
          content:
            'Привет! Я FinWise — твой персональный финансовый советник 🦉\n\nЯ анализирую твои доходы и расходы в реальном времени и даю конкретные советы. Спроси меня что-нибудь или нажми на микрофон!',
        });
      }, 400);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasMessages = aiMessages.length > 0;

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ background: '#F8F7FF' }}>
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-5 pb-4 glass border-b border-white/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 3 }}
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl shadow-md"
              style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #9B59B6 100%)' }}
            >
              🦉
            </motion.div>
            <div>
              <div className="font-bold text-gray-900">FinWise AI</div>
              <div className="flex items-center gap-1.5">
                <motion.div
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="w-1.5 h-1.5 rounded-full bg-green-500"
                />
                <span className="text-xs text-green-600 font-medium">Онлайн · Анализирует ваши данные</span>
              </div>
            </div>
          </div>
          {hasMessages && (
            <button
              onClick={clearAiChat}
              className="text-xs text-gray-400 px-3 py-1.5 rounded-full haptic"
              style={{ background: 'rgba(0,0,0,0.05)' }}
            >
              Очистить
            </button>
          )}
        </div>
      </div>

      {/* Messages area — flex-1 min-h-0 makes it scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        {/* Empty state */}
        {!hasMessages && !isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="pt-4"
          >
            <div className="text-center mb-6">
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ repeat: Infinity, duration: 3 }}
                className="text-6xl mb-3"
              >
                🦉
              </motion.div>
              <div className="font-bold text-gray-800 text-lg mb-1">Чем могу помочь?</div>
              <div className="text-sm text-gray-500">
                {voiceSupported ? 'Задай вопрос или нажми 🎤' : 'Задай вопрос текстом'}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_PROMPTS.map((prompt, i) => (
                <motion.button
                  key={prompt.text}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  onClick={() => handleSend(prompt.text)}
                  className="flex items-center gap-2 bg-white rounded-2xl px-3 py-3 text-sm text-gray-700 haptic text-left shadow-sm border border-gray-100"
                >
                  <span className="text-lg flex-shrink-0">{prompt.icon}</span>
                  <span className="font-medium leading-tight">{prompt.text}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {aiMessages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0 mb-0.5"
                  style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)' }}>
                  🦉
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-line leading-relaxed ${
                  msg.role === 'user' ? 'rounded-br-sm' : 'rounded-bl-sm shadow-sm'
                }`}
                style={msg.role === 'user'
                  ? { background: 'linear-gradient(135deg, #6C63FF, #9B59B6)', color: 'white' }
                  : { background: '#FFFFFF', color: '#1a1a2e', border: '1px solid rgba(108,99,255,0.08)' }
                }
              >
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-end gap-2"
          >
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)' }}>
              🦉
            </div>
            <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-gray-100">
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ y: [0, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 0.7, delay: i * 0.15 }}
                    className="w-2 h-2 rounded-full"
                    style={{ background: '#6C63FF' }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Voice text preview */}
        <AnimatePresence>
          {voiceText && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex justify-end"
            >
              <div className="max-w-[80%] rounded-2xl rounded-br-sm px-4 py-3 text-sm italic opacity-70"
                style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)', color: 'white' }}>
                🎤 {voiceText}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick prompts after messages */}
        {hasMessages && !isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-wrap gap-2 pt-1"
          >
            {QUICK_PROMPTS.slice(0, 4).map((prompt) => (
              <button
                key={prompt.text}
                onClick={() => handleSend(prompt.text)}
                className="flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5 text-xs font-medium text-gray-600 haptic shadow-sm border border-gray-100"
              >
                <span>{prompt.icon}</span>
                <span>{prompt.text}</span>
              </button>
            ))}
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar — flex-shrink-0 ensures it's ALWAYS visible, never scrolled away */}
      <div className="flex-shrink-0 px-4 py-3 glass border-t border-white/60 safe-bottom">
        {/* Listening indicator */}
        <AnimatePresence>
          {isListening && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 mb-2 px-1"
            >
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 0.6 }}
                className="w-2 h-2 rounded-full bg-red-500"
              />
              <span className="text-xs text-red-500 font-medium">Говорите сейчас...</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-2 items-center">
          {/* Voice button — only shown if supported */}
          {voiceSupported && (
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={toggleVoice}
              animate={isListening ? { scale: [1, 1.1, 1] } : { scale: 1 }}
              transition={isListening ? { repeat: Infinity, duration: 0.8 } : { duration: 0.1 }}
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0 haptic"
              style={isListening
                ? { background: '#FF4757', boxShadow: '0 4px 16px rgba(255,71,87,0.4)' }
                : { background: 'rgba(108,99,255,0.1)' }
              }
              aria-label={isListening ? 'Остановить запись' : 'Голосовой ввод'}
            >
              🎤
            </motion.button>
          )}

          {/* Text input — textarea for better mobile/WebView compatibility */}
          <div
            className="flex-1 flex items-center rounded-2xl px-4 py-2.5 gap-2"
            style={{ background: 'rgba(108,99,255,0.06)', border: '1.5px solid rgba(108,99,255,0.15)' }}
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(input);
                }
              }}
              placeholder={isListening ? 'Слушаю...' : 'Спроси что-нибудь...'}
              readOnly={isListening}
              className="flex-1 bg-transparent outline-none text-sm text-gray-800 placeholder-gray-400 min-w-0 resize-none leading-5"
              style={{ maxHeight: '80px', overflowY: 'auto' }}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          {/* Send button */}
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => handleSend(input)}
            disabled={!input.trim() || isTyping}
            className="w-11 h-11 rounded-2xl text-white flex items-center justify-center haptic disabled:opacity-40 text-lg flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)' }}
            aria-label="Отправить"
          >
            ↑
          </motion.button>
        </div>
      </div>
    </div>
  );
}
