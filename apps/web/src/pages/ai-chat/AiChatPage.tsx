import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useFinanceStore } from '@/features/finance/store';
import { generateAiResponse } from '@/features/ai/smartResponses';
import { apiClient } from '@/shared/api/client';

// ─── Groq AI Chat (via backend /api/ai/chat) ──────────────────────────────────

function buildFinancialContext(store: {
  transactions: any[];
  goals: any[];
  summary: { income: number; expenses: number; savings: number; savingsRate: number };
  categorySpending: { category: { name: string; icon: string }; amount: number }[];
}): string {
  const { summary, categorySpending, goals, transactions } = store;

  const topCategories = categorySpending
    .slice(0, 5)
    .map((c) => `${c.category.icon} ${c.category.name}: ${c.amount.toLocaleString('ru-RU')} ₽`)
    .join(', ');

  const activeGoals = goals
    .filter((g) => g.currentAmount < g.targetAmount)
    .slice(0, 3)
    .map((g) => {
      const pct = Math.round((g.currentAmount / g.targetAmount) * 100);
      return `${g.icon} ${g.name} (${pct}%, осталось ${(g.targetAmount - g.currentAmount).toLocaleString('ru-RU')} ₽)`;
    })
    .join('; ');

  return `ФИНАНСОВЫЙ КОНТЕКСТ ПОЛЬЗОВАТЕЛЯ (текущий месяц):
- Доходы: ${summary.income.toLocaleString('ru-RU')} ₽
- Расходы: ${summary.expenses.toLocaleString('ru-RU')} ₽
- Баланс: ${summary.savings.toLocaleString('ru-RU')} ₽
- Норма сбережений: ${summary.savingsRate}%
- Всего операций: ${transactions.length}
${topCategories ? `- Топ категории расходов: ${topCategories}` : '- Расходов пока нет'}
${activeGoals ? `- Активные цели: ${activeGoals}` : '- Целей пока нет'}`;
}

async function askGroqChat(
  userMessage: string,
  financialContext: string,
  history: { role: 'user' | 'assistant'; content: string }[]
): Promise<string | null> {
  // Keep last 6 messages for context (3 exchanges)
  const recentHistory = history.slice(-6);

  try {
    const response = await apiClient.post<{ data: { content: string } }>('/ai/chat', {
      message: userMessage,
      context: financialContext,
      history: recentHistory,
    });
    return response.data?.data?.content || null;
  } catch (err) {
    console.error('[AiChat] Backend chat error:', err);
    return null;
  }
}

// ─── Quick Prompts ────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  { text: 'Как я трачу деньги?', icon: '📊' },
  { text: 'Где можно сэкономить?', icon: '💡' },
  { text: 'Анализ за месяц', icon: '📅' },
  { text: 'Помоги с бюджетом', icon: '🎯' },
  { text: 'Как накопить быстрее?', icon: '🚀' },
  { text: 'Советы по инвестициям', icon: '📈' },
];

// Detect Telegram WebView environment
const isTelegramWebView =
  typeof window !== 'undefined' &&
  !!(window as any).Telegram?.WebApp;

// ─── Voice Hook ───────────────────────────────────────────────────────────────

function useVoiceInput(onResult: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [voiceBlocked, setVoiceBlocked] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const recognitionRef = useRef<any>(null);

  const hasSpeechAPI =
    typeof window !== 'undefined' &&
    (!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition);

  // In Telegram WebView, SpeechRecognition always fails — hide proactively
  const supported = hasSpeechAPI && !voiceBlocked && !isTelegramWebView;

  const toggle = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceError('Голосовой ввод не поддерживается');
      setTimeout(() => setVoiceError(''), 3000);
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setVoiceText('');
      return;
    }

    setVoiceError('');

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
        setVoiceBlocked(true);
        setVoiceError('Голосовой ввод недоступен в этом браузере');
        setTimeout(() => setVoiceError(''), 4000);
      } else if (e.error === 'no-speech') {
        setVoiceError('Речь не распознана, попробуйте ещё раз');
        setTimeout(() => setVoiceError(''), 3000);
      } else if (e.error === 'audio-capture') {
        setVoiceError('Микрофон недоступен');
        setTimeout(() => setVoiceError(''), 3000);
      } else if (e.error === 'network') {
        setVoiceError('Нет сети для распознавания речи');
        setTimeout(() => setVoiceError(''), 3000);
      } else {
        setVoiceError('Ошибка голосового ввода');
        setTimeout(() => setVoiceError(''), 3000);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    try {
      recognition.start();
    } catch {
      setIsListening(false);
      setVoiceBlocked(true);
      setVoiceError('Не удалось запустить голосовой ввод');
      setTimeout(() => setVoiceError(''), 3000);
    }
  }, [isListening, onResult]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return { isListening, voiceText, voiceError, toggle, supported };
}

// ─── AiChatPage ───────────────────────────────────────────────────────────────

export function AiChatPage() {
  const [isTyping, setIsTyping] = useState(false);
  const [inputHasText, setInputHasText] = useState(false);
  const [groqError, setGroqError] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // UNCONTROLLED input — ref only, no React value state
  const inputRef = useRef<HTMLInputElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { aiMessages, addAiMessage, clearAiChat, transactions, goals, getMonthSummary, getCategorySpending } =
    useFinanceStore();

  const handleSend = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    // Clear the native input directly — no React state needed
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    setInputHasText(false);

    addAiMessage({ role: 'user', content: trimmed });
    setIsTyping(true);

    // Build financial context for Groq
    const summary = getMonthSummary();
    const categorySpending = getCategorySpending();
    const financialContext = buildFinancialContext({ transactions, goals, summary, categorySpending });

    // Build conversation history (exclude the message we just added — it's not in store yet)
    const history = aiMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // Try Groq first, fall back to local smartResponses
    let response: string;
    const groqReply = await askGroqChat(trimmed, financialContext, history);

    if (groqReply) {
      response = groqReply;
      setGroqError(false);
    } else {
      // Local fallback
      response = generateAiResponse(trimmed, { transactions, goals, summary, categorySpending });
      setGroqError(true);
      setTimeout(() => setGroqError(false), 4000);
    }

    addAiMessage({ role: 'assistant', content: response });
    setIsTyping(false);
  }, [isTyping, addAiMessage, getMonthSummary, getCategorySpending, transactions, goals, aiMessages]);

  // Read value directly from DOM — the only reliable method in Telegram WebView
  const handleSendFromInput = useCallback(() => {
    const val = inputRef.current?.value ?? '';
    handleSend(val);
  }, [handleSend]);

  const { isListening, voiceText, voiceError, toggle: toggleVoice, supported: voiceSupported } = useVoiceInput((text) => {
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
            'Привет! Я FinWise — твой персональный финансовый советник 🦉\n\nЯ анализирую твои доходы и расходы в реальном времени и даю конкретные советы. Спроси меня что-нибудь!',
        });
      }, 400);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // VisualViewport — position input bar at the top of the keyboard.
  // CSS env(keyboard-inset-height) handles it natively on iOS 15+ / Chrome 94+.
  // JS visualViewport is a fallback for older Telegram WebView versions.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      if (!inputBarRef.current) return;
      // Distance from bottom of visual viewport to bottom of layout viewport
      const offsetBottom = window.innerHeight - (vv.offsetTop + vv.height);
      const clamped = Math.max(0, offsetBottom);
      // Only override via JS when CSS env(keyboard-inset-height) is NOT supported
      // (i.e. when the bar hasn't already moved). We always set it to be safe.
      inputBarRef.current.style.bottom = `${clamped}px`;

      const isOpen = clamped > 100;
      setKeyboardOpen(isOpen);
      if (isOpen) {
        // Use requestAnimationFrame to scroll after layout settles
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'instant' });
        });
      }
    };

    // Run immediately and on every viewport change
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  const hasMessages = aiMessages.length > 0;

  return (
    <div
      className="flex flex-col flex-1 min-h-0"
      style={{ background: '#F8F7FF', position: 'relative' }}
      // Tapping outside input dismisses keyboard immediately
      onPointerDown={(e) => {
        if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
          inputRef.current.blur();
        }
      }}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-5 pb-4 glass border-b border-white/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="w-9 h-9 rounded-2xl flex items-center justify-center haptic text-lg flex-shrink-0"
              style={{ background: 'rgba(0,0,0,0.06)' }}
            >
              ←
            </button>
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
                <span className="text-xs text-green-600 font-medium">Groq Llama 3.1</span>
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

      {/* Messages area — scrollable; padding-bottom reserves space for fixed input bar */}
      <div
        ref={messagesRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4"
        style={{ paddingBottom: keyboardOpen ? '80px' : '80px' }}
      >
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

      {/* Input bar — position:fixed so it moves instantly with the keyboard (no lag).
          CSS env(keyboard-inset-height) is the primary mechanism (iOS 15+ / Chrome 94+).
          visualViewport JS overrides bottom as a fallback for older WebView versions. */}
      <div
        ref={inputBarRef}
        className="glass border-t border-white/60"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          // Primary: CSS env(keyboard-inset-height) — zero-lag, no JS needed on modern iOS
          // Fallback: safe-area-inset-bottom for notched devices without keyboard API
          bottom: `env(keyboard-inset-height, env(safe-area-inset-bottom, 0px))`,
          zIndex: 50,
          paddingLeft: '16px',
          paddingRight: '16px',
          paddingTop: '12px',
          paddingBottom: '12px',
          // Smooth transition only when keyboard is closing (avoids lag on open)
          transition: 'bottom 0.0s',
        }}
      >
        {/* Groq fallback notice */}
        <AnimatePresence>
          {groqError && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="mb-2 px-3 py-2 rounded-xl text-xs text-orange-700 font-medium"
              style={{ background: 'rgba(255, 152, 0, 0.12)' }}
            >
              ⚠️ Groq недоступен — использован локальный ответ
            </motion.div>
          )}
        </AnimatePresence>

        {/* Voice error toast */}
        <AnimatePresence>
          {voiceError && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="mb-2 px-3 py-2 rounded-xl text-xs text-orange-700 font-medium"
              style={{ background: 'rgba(255, 152, 0, 0.12)' }}
            >
              ⚠️ {voiceError}
            </motion.div>
          )}
        </AnimatePresence>

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
          {/* Voice button */}
          {voiceSupported && (
            <button
              onClick={toggleVoice}
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0 active:scale-95 transition-transform"
              style={isListening
                ? { background: '#FF4757', boxShadow: '0 4px 16px rgba(255,71,87,0.4)' }
                : { background: 'rgba(108,99,255,0.1)' }
              }
              aria-label={isListening ? 'Остановить запись' : 'Голосовой ввод'}
            >
              🎤
            </button>
          )}

          {/* Text input — UNCONTROLLED, native DOM only for Telegram WebView compatibility */}
          <div
            className="flex-1 flex items-center rounded-2xl px-4 gap-2"
            style={{
              background: 'rgba(108,99,255,0.06)',
              border: '1.5px solid rgba(108,99,255,0.15)',
              minHeight: '44px',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              inputMode="text"
              enterKeyHint="send"
              // UNCONTROLLED: no value/onChange — Telegram WebView breaks React synthetic events
              defaultValue=""
              onInput={(e) => {
                setInputHasText((e.target as HTMLInputElement).value.length > 0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSendFromInput();
                }
              }}
              onFocus={() => {
                // Scroll to bottom after keyboard animation (~300ms)
                setTimeout(() => {
                  bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
                }, 300);
              }}
              placeholder={isListening ? 'Слушаю...' : 'Спроси что-нибудь...'}
              disabled={isListening}
              className="flex-1 bg-transparent outline-none text-gray-800 placeholder-gray-400 min-w-0 py-2.5"
              style={{
                WebkitAppearance: 'none',
                appearance: 'none',
                border: 'none',
                fontSize: '16px', // Prevents iOS zoom on focus
                lineHeight: '1.4',
                caretColor: '#6C63FF',
              }}
              // Enable standard text editing features (autocorrect, spellcheck, autocomplete)
              autoComplete="on"
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck={true}
            />
          </div>

          {/* Send button */}
          <button
            onClick={handleSendFromInput}
            disabled={isTyping}
            className="w-11 h-11 rounded-2xl text-white flex items-center justify-center disabled:opacity-40 text-lg flex-shrink-0 active:scale-95 transition-transform"
            style={{ background: 'linear-gradient(135deg, #6C63FF, #9B59B6)' }}
            aria-label="Отправить"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
