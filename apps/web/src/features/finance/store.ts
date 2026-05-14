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
//
// DESIGN:
// - Cloud payload is a SLIM object: { transactions, goals, streak, lastActiveDate }
//   (no aiMessages, no budgets, no functions — keeps payload small)
// - Chunks are 3500 chars each (CloudStorage limit 4096 bytes/key)
// - Chunks written SEQUENTIALLY, count written LAST as commit marker
// - Writes retry up to 3 times on failure
// - hybridStorage.setItem only writes to localStorage (fast path)
// - Cloud upload is triggered explicitly via scheduleCloudUpload() with debounce
// - On app start, rehydrateFromCloud() merges cloud into local store

const CLOUD_KEY = 'fw_finance';
const CHUNK_SIZE = 3500;
const CLOUD_VERSION = 1; // bump to invalidate old cloud data format

/** Slim payload stored in CloudStorage — excludes aiMessages and functions */
interface CloudPayload {
  v: number;
  transactions: Transaction[];
  goals: Goal[];
  streak: number;
  lastActiveDate: string;
}

function tgCloud() {
  return window.Telegram?.WebApp?.CloudStorage ?? null;
}

function splitChunks(str: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += CHUNK_SIZE) {
    chunks.push(str.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

/** Write string to CloudStorage (chunked, sequential, with retry) */
async function cloudSet(value: string, retries = 3): Promise<void> {
  const cloud = tgCloud();
  if (!cloud) return;
  const chunks = splitChunks(value);

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Write data chunks sequentially
      for (let i = 0; i < chunks.length; i++) {
        await new Promise<void>((res, rej) =>
          cloud.setItem(`${CLOUD_KEY}_${i}`, chunks[i]!, (err) => {
            if (err) rej(new Error(String(err))); else res();
          })
        );
      }
      // Write count LAST — commit marker. Partial write → count stays old → safe read.
      await new Promise<void>((res, rej) =>
        cloud.setItem(`${CLOUD_KEY}_n`, String(chunks.length), (err) => {
          if (err) rej(new Error(String(err))); else res();
        })
      );
      return; // success
    } catch {
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1))); // backoff
      }
    }
  }
}

/** Read string from CloudStorage (chunked).
 *  Returns null if the commit marker is missing, the count is invalid,
 *  or ANY chunk comes back empty (partial write / read failure).
 */
async function cloudGet(): Promise<string | null> {
  const cloud = tgCloud();
  if (!cloud) return null;
  const n = await new Promise<string | null>((res) =>
    cloud.getItem(`${CLOUD_KEY}_n`, (_err: unknown, val: string) => res(val ?? null))
  );
  if (!n) return null;
  const count = parseInt(n, 10);
  if (!count || isNaN(count) || count < 1) return null;
  const keys = Array.from({ length: count }, (_, i) => `${CLOUD_KEY}_${i}`);
  const chunks = await new Promise<(string | null)[]>((res) =>
    cloud.getItems(keys, (_err: unknown, vals: Record<string, string>) =>
      res(keys.map((k) => (vals[k] != null && vals[k] !== '' ? vals[k] : null)))
    )
  );
  // Integrity check: every chunk must be present. A missing chunk means a
  // partial write occurred — treat the whole read as invalid to avoid
  // silently joining corrupt JSON.
  if (chunks.some((c) => c === null)) return null;
  const result = (chunks as string[]).join('');
  return result || null;
}

/** Clear all CloudStorage keys for this app (use to wipe corrupted data) */
export async function clearCloudStorage(): Promise<void> {
  const cloud = tgCloud();
  if (!cloud) return;
  const n = await new Promise<string | null>((res) =>
    cloud.getItem(`${CLOUD_KEY}_n`, (_err: unknown, val: string) => res(val ?? null))
  );
  const count = n ? parseInt(n, 10) : 0;
  const keys = [`${CLOUD_KEY}_n`, ...Array.from({ length: Math.max(count, 20) }, (_, i) => `${CLOUD_KEY}_${i}`)];
  await new Promise<void>((res) => cloud.removeItems(keys, () => res()));
}

/** Build slim cloud payload from current store state.
 *  Strips the embedded `category` object from each transaction — it's derived
 *  from `categoryId` and can be reconstructed on read, saving ~30% payload size.
 */
function buildCloudPayload(state: FinanceState): CloudPayload {
  return {
    v: CLOUD_VERSION,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    transactions: (state.transactions ?? []).map(({ category: _cat, ...tx }) => tx),
    goals: state.goals ?? [],
    streak: state.streak ?? 1,
    lastActiveDate: state.lastActiveDate ?? '',
  };
}

/** Debounced cloud upload — waits 1s after last call before writing */
let _uploadTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleCloudUpload(): void {
  if (_uploadTimer) clearTimeout(_uploadTimer);
  _uploadTimer = setTimeout(async () => {
    _uploadTimer = null;
    if (!tgCloud()) return; // CloudStorage not available yet — will be called again after ready()
    const state = useFinanceStore.getState();
    const payload = buildCloudPayload(state);
    await cloudSet(JSON.stringify(payload)).catch(() => {/* ignore */});
  }, 1000);
}

/** Cancel any pending debounced upload (call before forceSyncToCloud to avoid double-write) */
export function cancelScheduledUpload(): void {
  if (_uploadTimer) {
    clearTimeout(_uploadTimer);
    _uploadTimer = null;
  }
}

/** Merge two cloud payloads: union of transactions/goals, keep higher streak */
function mergePayloads(a: CloudPayload, b: CloudPayload): CloudPayload {
  const txMap = new Map<string, Transaction>();
  [...(a.transactions ?? []), ...(b.transactions ?? [])].forEach((t) => txMap.set(t.id, t));
  const transactions = Array.from(txMap.values()).sort(
    (x, y) => new Date(y.date).getTime() - new Date(x.date).getTime()
  );

  const goalMap = new Map<string, Goal>();
  [...(a.goals ?? []), ...(b.goals ?? [])].forEach((g) => goalMap.set(g.id, g));
  const goals = Array.from(goalMap.values());

  const streak = Math.max(a.streak ?? 1, b.streak ?? 1);
  const lastActiveDate = (a.lastActiveDate ?? '') > (b.lastActiveDate ?? '')
    ? a.lastActiveDate : b.lastActiveDate;

  return { v: CLOUD_VERSION, transactions, goals, streak, lastActiveDate };
}

/** Custom Zustand persist storage: localStorage only (fast path).
 *  Cloud sync is handled separately via scheduleCloudUpload() and rehydrateFromCloud().
 */
const hybridStorage = {
  getItem: async (name: string): Promise<StorageValue<FinanceState> | null> => {
    const raw = localStorage.getItem(name);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StorageValue<FinanceState>;
    } catch { return null; }
  },

  setItem: async (name: string, value: StorageValue<FinanceState>): Promise<void> => {
    // Write to localStorage immediately (synchronous UX, no cloud here)
    localStorage.setItem(name, JSON.stringify(value));
  },

  removeItem: async (name: string): Promise<void> => {
    localStorage.removeItem(name);
  },
};

/** Public: check CloudStorage status — for debug UI */
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
    const parsed = JSON.parse(raw) as CloudPayload;
    const txCount = parsed?.transactions?.length ?? 0;
    const n = await new Promise<string | null>((res) =>
      cloud.getItem(`${CLOUD_KEY}_n`, (_e: unknown, v: string) => res(v ?? null))
    );
    return { available: true, chunkCount: n ? parseInt(n, 10) : 0, totalChars: raw.length, txCount, error: null };
  } catch (e) {
    return { available: true, chunkCount: null, totalChars: null, txCount: null, error: String(e) };
  }
}

/** Public: force upload current store state to CloudStorage */
export async function forceSyncToCloud(): Promise<string> {
  if (!tgCloud()) return '❌ CloudStorage недоступен (не Telegram WebApp)';
  try {
    const state = useFinanceStore.getState();
    const payload = buildCloudPayload(state);
    await cloudSet(JSON.stringify(payload));
    return `✅ Загружено ${payload.transactions.length} транзакций в CloudStorage`;
  } catch (e) {
    return `❌ Ошибка: ${e}`;
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

export interface FinanceState {
  transactions: Transaction[];
  goals: Goal[];
  budgets: Budget[];
  aiMessages: AiMessage[];
  streak: number;
  lastActiveDate: string;

  addTransaction: (tx: Omit<Transaction, 'id' | 'category'>) => void;
  updateTransaction: (id: string, updates: Partial<Omit<Transaction, 'id'>>) => void;
  deleteTransaction: (id: string) => void;
  addGoal: (goal: Omit<Goal, 'id' | 'createdAt'>) => void;
  updateGoal: (id: string, updates: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  addToGoal: (id: string, amount: number) => void;
  addAiMessage: (msg: Omit<AiMessage, 'id' | 'timestamp'>) => void;
  clearAiChat: () => void;
  clearAllData: () => void;
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
        scheduleCloudUpload();
      },

      updateTransaction: (id, updates) => {
        set((s) => ({
          transactions: s.transactions.map((t) => {
            if (t.id !== id) return t;
            const categoryId = updates.categoryId ?? t.categoryId;
            const category = getCategoryById(categoryId) ?? {
              id: categoryId,
              name: categoryId,
              icon: '📦',
              color: '#6B7280',
              type: 'expense' as const,
            };
            return { ...t, ...updates, category };
          }),
        }));
        scheduleCloudUpload();
      },

      deleteTransaction: (id) => {
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }));
        scheduleCloudUpload();
      },

      addGoal: (goal) => {
        const newGoal: Goal = {
          ...goal,
          id: `goal_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ goals: [newGoal, ...s.goals] }));
        scheduleCloudUpload();
      },

      updateGoal: (id, updates) => {
        set((s) => ({
          goals: s.goals.map((g) => (g.id === id ? { ...g, ...updates } : g)),
        }));
        scheduleCloudUpload();
      },

      deleteGoal: (id) => {
        set((s) => ({ goals: s.goals.filter((g) => g.id !== id) }));
        scheduleCloudUpload();
      },

      addToGoal: (id, amount) => {
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === id
              ? { ...g, currentAmount: Math.min(g.currentAmount + amount, g.targetAmount) }
              : g
          ),
        }));
        scheduleCloudUpload();
      },

      addAiMessage: (msg) => {
        const newMsg: AiMessage = {
          ...msg,
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          timestamp: new Date().toISOString(),
        };
        set((s) => ({ aiMessages: [...s.aiMessages, newMsg] }));
      },

      clearAiChat: () => set({ aiMessages: [] }),

      clearAllData: () => {
        set({ transactions: [], goals: [], budgets: [], aiMessages: [], streak: 1, lastActiveDate: '' });
        // Also wipe cloud storage so other devices don't re-sync old data
        clearCloudStorage().catch(() => {/* ignore */});
      },

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

/**
 * Re-read CloudStorage and merge into the live Zustand store.
 * Call this after window.Telegram.WebApp.ready() — at that point
 * CloudStorage is guaranteed to be available, whereas during store
 * initialisation it may not have been.
 *
 * SAFETY RULES:
 * 1. If cloud is empty → no-op (never wipe local data)
 * 2. Merged result must have >= local transaction count (additive only)
 * 3. Use setState() directly — never persist.rehydrate() which re-runs
 *    hybridStorage.getItem and can trigger another cloud read/overwrite
 */
/** In-flight guard: prevents concurrent rehydrateFromCloud() calls */
let _rehydrating = false;

export async function rehydrateFromCloud(storeName = 'finwise-finance'): Promise<void> {
  if (!tgCloud()) return;
  if (_rehydrating) return; // already in progress — skip duplicate call
  _rehydrating = true;
  try {
    const cloudRaw = await cloudGet();

    // Build local payload from live store state (always available)
    const currentState = useFinanceStore.getState();
    const localPayload = buildCloudPayload(currentState);

    // If cloud is empty but we have local data → upload local to cloud so other
    // devices can pick it up, then return (nothing to merge).
    if (!cloudRaw) {
      if (localPayload.transactions.length > 0) {
        cloudSet(JSON.stringify(localPayload)).catch(() => {/* ignore */});
      }
      return;
    }

    let cloudPayload: CloudPayload;
    try {
      cloudPayload = JSON.parse(cloudRaw) as CloudPayload;
    } catch { return; } // Corrupt cloud data → abort

    // Guard: cloud payload must have the expected shape
    if (!Array.isArray(cloudPayload.transactions)) return;

    // Merge: union of both transaction/goal sets, keep higher streak
    const merged = mergePayloads(cloudPayload, localPayload);

    // Safety: merged result must not have fewer transactions than local
    if (merged.transactions.length < currentState.transactions.length) return;

    // Re-attach category objects stripped from cloud payload to save space.
    // They are derived from categoryId and always available in ALL_CATEGORIES.
    const transactionsWithCats = merged.transactions.map((tx) => ({
      ...tx,
      category: getCategoryById(tx.categoryId) ?? {
        id: tx.categoryId,
        name: tx.categoryId,
        icon: '📦',
        color: '#6B7280',
        type: 'expense' as const,
      },
    }));

    // Apply merged state directly to live store
    useFinanceStore.setState({
      transactions: transactionsWithCats,
      goals: merged.goals,
      streak: merged.streak,
      lastActiveDate: merged.lastActiveDate,
    });

    // Persist merged state back to localStorage so next cold-start is correct.
    // Use transactionsWithCats so localStorage has full category objects (fast cold-start).
    // IMPORTANT: also handle fresh devices where localRaw is null — create the entry
    // from scratch so the data survives the next cold start without another cloud read.
    try {
      const localRaw = localStorage.getItem(storeName);
      let localStoreValue: { state: Partial<FinanceState>; version?: number };
      if (localRaw) {
        localStoreValue = JSON.parse(localRaw) as { state: Partial<FinanceState>; version?: number };
      } else {
        // Fresh device — bootstrap the persist entry so Zustand can read it on next start
        localStoreValue = { state: {}, version: 0 };
      }
      localStoreValue.state = {
        ...localStoreValue.state,
        transactions: transactionsWithCats,
        goals: merged.goals,
        streak: merged.streak,
        lastActiveDate: merged.lastActiveDate,
      };
      localStorage.setItem(storeName, JSON.stringify(localStoreValue));
    } catch { /* ignore — live store already updated */ }

    // If merged has MORE data than what was in cloud (local had extra transactions),
    // write the merged result back to cloud so other devices get the full union.
    if (merged.transactions.length > cloudPayload.transactions.length ||
        merged.goals.length > cloudPayload.goals.length) {
      cloudSet(JSON.stringify(merged)).catch(() => {/* ignore */});
    }
  } catch { /* ignore */ } finally {
    _rehydrating = false; // always release the guard
  }
}
