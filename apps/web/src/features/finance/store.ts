import { create } from 'zustand';
import { persist, type StorageValue } from 'zustand/middleware';

export type TransactionType = 'expense' | 'income' | 'transfer';

export interface Category {
  id: string;
  name: string;
  icon: string;
  type: TransactionType;
  color: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  category?: Category;
  description: string;
  date: string; // ISO
}

export interface Goal {
  id: string;
  name: string;
  icon: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  color: string;
  createdAt: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  limit: number;
  spent: number;
  period: 'month';
}

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export const EXPENSE_CATEGORIES: Category[] = [
  { id: 'food', name: 'Еда', icon: '🍔', type: 'expense', color: '#FF6B6B' },
  { id: 'transport', name: 'Транспорт', icon: '🚗', type: 'expense', color: '#4ECDC4' },
  { id: 'shopping', name: 'Покупки', icon: '🛍️', type: 'expense', color: '#45B7D1' },
  { id: 'health', name: 'Здоровье', icon: '💊', type: 'expense', color: '#96CEB4' },
  { id: 'entertainment', name: 'Развлечения', icon: '🎮', type: 'expense', color: '#FFEAA7' },
  { id: 'cafe', name: 'Кафе', icon: '☕', type: 'expense', color: '#DDA0DD' },
  { id: 'sport', name: 'Спорт', icon: '🏋️', type: 'expense', color: '#98D8C8' },
  { id: 'beauty', name: 'Красота', icon: '💄', type: 'expense', color: '#F7DC6F' },
  { id: 'home', name: 'Дом', icon: '🏠', type: 'expense', color: '#82E0AA' },
  { id: 'education', name: 'Учёба', icon: '📚', type: 'expense', color: '#AED6F1' },
  { id: 'travel', name: 'Путешествия', icon: '✈️', type: 'expense', color: '#F0B27A' },
  { id: 'other_exp', name: 'Другое', icon: '💸', type: 'expense', color: '#BDC3C7' },
];

export const INCOME_CATEGORIES: Category[] = [
  { id: 'salary', name: 'Зарплата', icon: '💼', type: 'income', color: '#2ECC71' },
  { id: 'freelance', name: 'Фриланс', icon: '💻', type: 'income', color: '#27AE60' },
  { id: 'gift', name: 'Подарок', icon: '🎁', type: 'income', color: '#F39C12' },
  { id: 'investment', name: 'Инвестиции', icon: '📈', type: 'income', color: '#8E44AD' },
  { id: 'cashback', name: 'Кэшбэк', icon: '💳', type: 'income', color: '#16A085' },
  { id: 'other_inc', name: 'Другое', icon: '💰', type: 'income', color: '#2980B9' },
];

export const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

function getCategoryById(id: string): Category | undefined {
  return ALL_CATEGORIES.find((c) => c.id === id);
}

// ─── Telegram CloudStorage sync ───────────────────────────────────────────────
// Splits large data into 1KB chunks (CloudStorage limit per key is 4096 bytes,
// but we chunk at 1000 chars to stay safe with JSON overhead).
// Falls back to localStorage when CloudStorage is unavailable (desktop browser).

const CLOUD_KEY = 'fw_finance';
const CHUNK_SIZE = 1000; // chars per chunk

function tgCloud() {
  return window.Telegram?.WebApp?.CloudStorage ?? null;
}

/** Public: check CloudStorage status and transaction count — for debug UI */
export async function debugCloudStorage(): Promise<{
  available: boolean;
  chunkCount: number | null;
  totalChars: number | null;
  txCount: number | null;
  error: string | null;
}> {
  const cloud = tgCloud();
  if (!cloud) return { available: false, chunkCount: null, totalChars: null, txCount: null, error: null };
  try {
    const raw = await cloudGet();
    if (!raw) return { available: true, chunkCount: 0, totalChars: 0, txCount: 0, error: null };
    const parsed = JSON.parse(raw);
    const txCount = (parsed?.state as FinanceState)?.transactions?.length ?? 0;
    const n = await new Promise<string | null>((res) =>
      cloud.getItem(`${CLOUD_KEY}_n`, (_e: unknown, v: string) => res(v ?? null))
    );
    return {
      available: true,
      chunkCount: n ? parseInt(n, 10) : 0,
      totalChars: raw.length,
      txCount,
      error: null,
    };
  } catch (e) {
    return { available: true, chunkCount: null, totalChars: null, txCount: null, error: String(e) };
  }
}

/** Public: force upload localStorage data to CloudStorage now */
export async function forceSyncToCloud(name = 'finwise-finance'): Promise<string> {
  const cloud = tgCloud();
  if (!cloud) return '❌ CloudStorage недоступен (не Telegram WebApp)';
  const raw = localStorage.getItem(name);
  if (!raw) return '❌ localStorage пуст';
  try {
    await cloudSet(raw);
    const parsed = JSON.parse(raw);
    const txCount = (parsed?.state as FinanceState)?.transactions?.length ?? 0;
    return `✅ Загружено ${txCount} транзакций в CloudStorage`;
  } catch (e) {
    return `❌ Ошибка: ${e}`;
  }
}

function splitChunks(str: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += CHUNK_SIZE) {
    chunks.push(str.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

/** Write value to Telegram CloudStorage (chunked) */
async function cloudSet(value: string): Promise<void> {
  const cloud = tgCloud();
  if (!cloud) {
    console.log('[CloudStorage] not available for write');
    return;
  }
  const chunks = splitChunks(value);
  console.log(`[CloudStorage] writing ${chunks.length} chunks (${value.length} chars)`);
  // Store chunk count first
  await new Promise<void>((res, rej) =>
    cloud.setItem(`${CLOUD_KEY}_n`, String(chunks.length), (err) => {
      if (err) { console.warn('[CloudStorage] setItem _n error:', err); rej(err); }
      else res();
    })
  );
  await Promise.all(
    chunks.map(
      (chunk, i) =>
        new Promise<void>((res, rej) =>
          cloud.setItem(`${CLOUD_KEY}_${i}`, chunk, (err) => {
            if (err) { console.warn(`[CloudStorage] setItem _${i} error:`, err); rej(err); }
            else res();
          })
        )
    )
  );
  console.log('[CloudStorage] write complete');
}

/** Read value from Telegram CloudStorage (chunked) */
async function cloudGet(): Promise<string | null> {
  const cloud = tgCloud();
  if (!cloud) {
    console.log('[CloudStorage] not available for read');
    return null;
  }
  const n = await new Promise<string | null>((res) =>
    cloud.getItem(`${CLOUD_KEY}_n`, (err: unknown, val: string) => {
      if (err) console.warn('[CloudStorage] getItem _n error:', err);
      res(val ?? null);
    })
  );
  console.log(`[CloudStorage] chunk count key = "${n}"`);
  if (!n) return null;
  const count = parseInt(n, 10);
  if (!count || isNaN(count)) return null;
  const keys = Array.from({ length: count }, (_, i) => `${CLOUD_KEY}_${i}`);
  const chunks = await new Promise<string[]>((res) =>
    cloud.getItems(keys, (err: unknown, vals: Record<string, string>) => {
      if (err) console.warn('[CloudStorage] getItems error:', err);
      res(keys.map((k) => vals[k] ?? ''));
    })
  );
  const result = chunks.join('');
  console.log(`[CloudStorage] read ${result.length} chars`);
  return result || null;
}

/** Merge two persisted states: union of transactions/goals, keep higher streak */
function mergeStates(
  a: StorageValue<FinanceState>,
  b: StorageValue<FinanceState>
): StorageValue<FinanceState> {
  const aState = a.state as FinanceState;
  const bState = b.state as FinanceState;

  // Union transactions by id
  const txMap = new Map<string, Transaction>();
  [...(aState.transactions ?? []), ...(bState.transactions ?? [])].forEach((t) =>
    txMap.set(t.id, t)
  );
  const transactions = Array.from(txMap.values()).sort(
    (x, y) => new Date(y.date).getTime() - new Date(x.date).getTime()
  );

  // Union goals by id
  const goalMap = new Map<string, Goal>();
  [...(aState.goals ?? []), ...(bState.goals ?? [])].forEach((g) =>
    goalMap.set(g.id, g)
  );
  const goals = Array.from(goalMap.values());

  // Keep higher streak
  const streak = Math.max(aState.streak ?? 1, bState.streak ?? 1);
  const lastActiveDate =
    (aState.lastActiveDate ?? '') > (bState.lastActiveDate ?? '')
      ? aState.lastActiveDate
      : bState.lastActiveDate;

  return {
    ...a,
    state: { ...aState, transactions, goals, streak, lastActiveDate },
  };
}

/** Custom Zustand persist storage: localStorage (fast) + CloudStorage (cross-device sync) */
const hybridStorage = {
  getItem: async (name: string): Promise<StorageValue<FinanceState> | null> => {
    console.log('[HybridStorage] getItem called, tgCloud=', !!tgCloud());

    const localRaw = localStorage.getItem(name);
    let localParsed: StorageValue<FinanceState> | null = null;
    try {
      if (localRaw) {
        localParsed = JSON.parse(localRaw) as StorageValue<FinanceState>;
        const txCount = (localParsed?.state as FinanceState)?.transactions?.length ?? 0;
        console.log(`[HybridStorage] localStorage has ${txCount} transactions`);
      }
    } catch { /* ignore */ }

    // Try CloudStorage
    let cloudParsed: StorageValue<FinanceState> | null = null;
    try {
      const cloudRaw = await cloudGet();
      if (cloudRaw) {
        cloudParsed = JSON.parse(cloudRaw) as StorageValue<FinanceState>;
        const txCount = (cloudParsed?.state as FinanceState)?.transactions?.length ?? 0;
        console.log(`[HybridStorage] CloudStorage has ${txCount} transactions`);
      } else {
        console.log('[HybridStorage] CloudStorage is empty');
      }
    } catch (e) {
      console.warn('[HybridStorage] CloudStorage parse error:', e);
    }

    if (cloudParsed && localParsed) {
      console.log('[HybridStorage] merging cloud + local');
      const merged = mergeStates(cloudParsed, localParsed);
      const mergedStr = JSON.stringify(merged);
      localStorage.setItem(name, mergedStr);
      cloudSet(mergedStr).catch(() => {/* ignore */});
      return merged;
    }

    if (cloudParsed) {
      console.log('[HybridStorage] using cloud only, mirroring to localStorage');
      localStorage.setItem(name, JSON.stringify(cloudParsed));
      return cloudParsed;
    }

    if (localParsed) {
      console.log('[HybridStorage] using local only, uploading to CloudStorage');
      cloudSet(localRaw!).catch(() => {/* ignore */});
      return localParsed;
    }

    console.log('[HybridStorage] no data found anywhere');
    return null;
  },

  setItem: async (name: string, value: StorageValue<FinanceState>): Promise<void> => {
    const str = JSON.stringify(value);
    // Always write to localStorage immediately (synchronous UX)
    localStorage.setItem(name, str);
    // Write to CloudStorage asynchronously (cross-device sync)
    cloudSet(str).catch((e) => console.warn('[HybridStorage] cloudSet error:', e));
  },

  removeItem: async (name: string): Promise<void> => {
    localStorage.removeItem(name);
    const cloud = tgCloud();
    if (cloud) {
      cloud.getItem(`${CLOUD_KEY}_n`, (_err: unknown, val: string) => {
        const count = parseInt(val ?? '0', 10);
        const keys = [`${CLOUD_KEY}_n`, ...Array.from({ length: count }, (_, i) => `${CLOUD_KEY}_${i}`)];
        cloud.removeItems(keys, () => {});
      });
    }
  },
};

// ─── State ────────────────────────────────────────────────────────────────────

interface FinanceState {
  transactions: Transaction[];
  goals: Goal[];
  budgets: Budget[];
  aiMessages: AiMessage[];
  streak: number;
  lastActiveDate: string;

  addTransaction: (tx: Omit<Transaction, 'id' | 'category'>) => void;
  deleteTransaction: (id: string) => void;
  addGoal: (goal: Omit<Goal, 'id' | 'createdAt'>) => void;
  updateGoal: (id: string, updates: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  addToGoal: (id: string, amount: number) => void;
  addAiMessage: (msg: Omit<AiMessage, 'id' | 'timestamp'>) => void;
  clearAiChat: () => void;
  updateStreak: () => void;

  // Computed helpers
  getMonthSummary: () => { income: number; expenses: number; savings: number; savingsRate: number };
  getRecentTransactions: (limit?: number) => Transaction[];
  getCategorySpending: () => { category: Category; amount: number }[];
}

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      transactions: [],
      goals: [],
      budgets: [],
      aiMessages: [],
      streak: 1,
      lastActiveDate: new Date().toISOString().split('T')[0] ?? '',

      addTransaction: (tx) => {
        const category = getCategoryById(tx.categoryId) ?? {
          id: tx.categoryId,
          name: tx.categoryId,
          icon: '📦',
          color: '#6B7280',
          type: 'expense' as const,
        };
        const newTx: Transaction = {
          ...tx,
          id: `tx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          category,
        };
        set((s) => ({ transactions: [newTx, ...s.transactions] }));
        get().updateStreak();
      },

      deleteTransaction: (id) =>
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),

      addGoal: (goal) => {
        const newGoal: Goal = {
          ...goal,
          id: `goal_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ goals: [newGoal, ...s.goals] }));
      },

      updateGoal: (id, updates) =>
        set((s) => ({
          goals: s.goals.map((g) => (g.id === id ? { ...g, ...updates } : g)),
        })),

      deleteGoal: (id) =>
        set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),

      addToGoal: (id, amount) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === id
              ? { ...g, currentAmount: Math.min(g.currentAmount + amount, g.targetAmount) }
              : g
          ),
        })),

      addAiMessage: (msg) => {
        const newMsg: AiMessage = {
          ...msg,
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          timestamp: new Date().toISOString(),
        };
        set((s) => ({ aiMessages: [...s.aiMessages, newMsg] }));
      },

      clearAiChat: () => set({ aiMessages: [] }),

      updateStreak: () => {
        const today = new Date().toISOString().split('T')[0] ?? '';
        const { lastActiveDate, streak } = get();
        if (lastActiveDate === today) return;
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0] ?? '';
        const newStreak = lastActiveDate === yesterday ? streak + 1 : 1;
        set({ streak: newStreak, lastActiveDate: today });
      },

      getMonthSummary: () => {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const txs = get().transactions.filter((t) => t.date >= monthStart);
        const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const expenses = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const savings = income - expenses;
        const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0;
        return { income, expenses, savings, savingsRate };
      },

      getRecentTransactions: (limit = 10) => get().transactions.slice(0, limit),

      getCategorySpending: () => {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const txs = get().transactions.filter(
          (t) => t.type === 'expense' && t.date >= monthStart
        );
        const map = new Map<string, number>();
        txs.forEach((t) => {
          map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount);
        });
        return Array.from(map.entries())
          .map(([catId, amount]) => ({
            category: getCategoryById(catId) ?? {
              id: catId,
              name: catId,
              icon: '💸',
              type: 'expense' as TransactionType,
              color: '#BDC3C7',
            },
            amount,
          }))
          .sort((a, b) => b.amount - a.amount);
      },
    }),
    {
      name: 'finwise-finance',
      storage: hybridStorage,
    }
  )
);
