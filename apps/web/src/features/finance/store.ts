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
  /**
   * true = user manually corrected the category after auto-classification.
   * When set, the category must NOT be overwritten by re-import or AI re-categorisation.
   */
  userCorrected?: boolean;
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
  // TASK-023: linked category
  linkedCategoryId?: string;
  linkedCategoryMode?: 'savings' | 'spending';
  linkedSince?: string; // ISO date — transactions before this date are not counted
}

export interface NotificationSettings {
  budgetAlerts: boolean;
  recurringReminders: boolean;
  weeklyReport: boolean;
  aiInsights: boolean;
}

export interface Budget {
  id: string;
  categoryId: string;
  limit: number;
  spent: number;
  period: 'month';
}

/**
 * A recurring mandatory payment that should be reserved from the monthly budget.
 *
 * source:
 *   'auto'   — detected automatically from transaction history
 *   'manual' — added by the user
 *
 * dayOfMonth: expected payment day (1–31). Used to check if it's still upcoming.
 * amountMedian: rolling median of last 3 occurrences (auto) or user-entered amount (manual).
 * confidence: 'high' (3/3 months), 'medium' (2/3 months), 'low' (detected but uncertain).
 * confirmedByUser: user explicitly accepted an auto-detected suggestion.
 * dismissedByUser: user dismissed the suggestion — never show again.
 */
export interface RecurringPayment {
  id: string;
  label: string;
  amountMedian: number;
  dayOfMonth: number;
  source: 'auto' | 'manual';
  confidence: 'high' | 'medium' | 'low';
  confirmedByUser: boolean;
  dismissedByUser: boolean;
  createdAt: string;
  /** ISO date of last detected occurrence (for staleness check) */
  lastSeenAt?: string;
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

/** Module-level cache for custom categories — kept in sync with store state.
 *  Used by getCategoryById so store actions (addTransaction, etc.) can resolve
 *  custom category objects without importing the store (avoids circular ref).
 */
let _customCategoryCache: Category[] = [];

function getCategoryById(id: string): Category | undefined {
  return [...ALL_CATEGORIES, ..._customCategoryCache].find((c) => c.id === id);
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
  /** Budget limits per category — persisted so device-switch doesn't lose them */
  budgets: Budget[];
  /** Recurring payment patterns — persisted so device-switch doesn't lose them */
  recurringPayments: RecurringPayment[];
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
    budgets: state.budgets ?? [],
    recurringPayments: (state.recurringPayments ?? []).map((p) => p),
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

/** Merge two cloud payloads: union of transactions/goals/budgets/recurringPayments, keep higher streak */
function mergePayloads(a: CloudPayload, b: CloudPayload): CloudPayload {
  const txMap = new Map<string, Transaction>();
  // Prefer the version with userCorrected=true when merging the same transaction
  [...(a.transactions ?? []), ...(b.transactions ?? [])].forEach((t) => {
    const existing = txMap.get(t.id);
    if (!existing || t.userCorrected) txMap.set(t.id, t);
  });
  const transactions = Array.from(txMap.values()).sort(
    (x, y) => new Date(y.date).getTime() - new Date(x.date).getTime()
  );

  const goalMap = new Map<string, Goal>();
  [...(a.goals ?? []), ...(b.goals ?? [])].forEach((g) => goalMap.set(g.id, g));
  const goals = Array.from(goalMap.values());

  // Budgets: prefer the entry with higher limit (most recent user intent)
  const budgetMap = new Map<string, Budget>();
  [...(a.budgets ?? []), ...(b.budgets ?? [])].forEach((bgt) => {
    const existing = budgetMap.get(bgt.id);
    if (!existing || bgt.limit > existing.limit) budgetMap.set(bgt.id, bgt);
  });
  const budgets = Array.from(budgetMap.values());

  // RecurringPayments: prefer confirmed/manual over auto; keep dismissed flags
  const rpMap = new Map<string, RecurringPayment>();
  [...(a.recurringPayments ?? []), ...(b.recurringPayments ?? [])].forEach((rp) => {
    const existing = rpMap.get(rp.id);
    if (!existing) { rpMap.set(rp.id, rp); return; }
    // Merge: keep dismissedByUser=true if either side has it; prefer confirmedByUser=true
    rpMap.set(rp.id, {
      ...existing,
      ...rp,
      dismissedByUser: existing.dismissedByUser || rp.dismissedByUser,
      confirmedByUser: existing.confirmedByUser || rp.confirmedByUser,
    });
  });
  const recurringPayments = Array.from(rpMap.values());

  const streak = Math.max(a.streak ?? 1, b.streak ?? 1);
  const lastActiveDate = (a.lastActiveDate ?? '') > (b.lastActiveDate ?? '')
    ? a.lastActiveDate : b.lastActiveDate;

  return { v: CLOUD_VERSION, transactions, goals, budgets, recurringPayments, streak, lastActiveDate };
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

// ─── Recurring payment detection ──────────────────────────────────────────────
//
// Algorithm:
//   1. Take all expense + transfer transactions from the last 6 months.
//   2. Group by "amount bucket" (round to nearest 500 ₽) + "day bucket" (±7 days).
//   3. A pattern qualifies if it appears in ≥ 2 distinct calendar months AND
//      the median amount is ≥ 5,000 ₽.
//   4. Confidence: 'high' = 4+ months, 'medium' = 3 months, 'low' = 2 months.
//   5. Salary transactions (categoryId === 'salary') are excluded.
//   6. Transfer transactions are included — they may be loan payments.
//
// The result is a list of RecurringPayment candidates. The user can then
// confirm or dismiss each one. Only confirmed (or manual) payments are
// used in the budget reservation calculation.

function medianOf(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2 : (s[m] ?? 0);
}

/**
 * Detect recurring mandatory payments from transaction history.
 * Returns NEW candidates only — payments not already in `existing`.
 */
/**
 * Deactivate recurring payment patterns that haven't been seen in 2+ months.
 * Returns updated list with stale auto-detected entries marked as dismissed.
 * Manual entries are never auto-dismissed.
 *
 * Staleness rule (ALG-001 Change 4):
 *   - If lastSeenAt is more than 65 days ago → mark dismissedByUser = true
 *     (65 days = ~2 months, gives buffer for irregular billing cycles)
 *   - Only applies to source='auto' entries not yet confirmed by user
 */
export function updateStaleness(payments: RecurringPayment[]): RecurringPayment[] {
  const now = new Date();
  const STALE_DAYS = 65;
  return payments.map((p) => {
    if (p.source === 'manual' || p.confirmedByUser || p.dismissedByUser) return p;
    if (!p.lastSeenAt) return p;
    const lastSeen = new Date(p.lastSeenAt);
    const daysSince = (now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > STALE_DAYS) {
      return { ...p, dismissedByUser: true };
    }
    return p;
  });
}

export function detectRecurringPayments(
  transactions: Transaction[],
  existing: RecurringPayment[],
): RecurringPayment[] {
  // Thresholds — raised to reduce false positives
  const MIN_AMOUNT = 500;        // raised from 100 to 500 ₽ (subscriptions handled via whitelist)
  const MIN_MONTHS = 3;          // raised from 2 to 3 months
  const MIN_CLUSTER_SIZE = 3;    // minimum transactions in cluster
  const AMOUNT_TOLERANCE = 0.15; // ±15%
  const DAY_TOLERANCE = 7;       // ±7 days

  // Categories that are inherently non-recurring (variable spend)
  const EXCLUDE_CATEGORIES = new Set([
    'cafe', 'food', 'shopping', 'entertainment',
  ]);

  // Subscription keyword whitelist — allow amounts 100–499 ₽ if description matches
  const SUBSCRIPTION_KEYWORDS =
    /яндекс.?плюс|яндекс.?музык|netflix|spotify|apple|google.?play|vk.?музык|okko|кинопоиск|ivi|more\.tv|premier|lit\.res|liters|wink|megafon\.tv|beeline\.tv|mts\.tv/i;

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString();

  // Only expenses and transfers (not income, not salary, not variable-spend categories)
  const candidates = transactions.filter(
    (t) =>
      (t.type === 'expense' || t.type === 'transfer') &&
      t.categoryId !== 'salary' &&
      !EXCLUDE_CATEGORIES.has(t.categoryId) &&
      t.date >= sixMonthsAgo &&
      (t.amount >= MIN_AMOUNT ||
        // Allow small subscription amounts if description matches known services
        (t.amount >= 100 && SUBSCRIPTION_KEYWORDS.test(t.description || ''))),
  );

  if (candidates.length === 0) return [];

  // Group transactions into clusters: same amount bucket + same day bucket
  // We use a greedy approach: sort by amount, then try to merge nearby transactions
  const sorted = [...candidates].sort((a, b) => a.amount - b.amount);

  // Build clusters
  interface Cluster {
    txs: Transaction[];
    months: Set<string>; // 'YYYY-MM'
  }
  const clusters: Cluster[] = [];

  for (const tx of sorted) {
    const txDay = new Date(tx.date).getDate();
    const txMonth = tx.date.slice(0, 7); // 'YYYY-MM'

    // Try to find an existing cluster this tx fits into
    let matched = false;
    for (const cluster of clusters) {
      const clusterMedian = medianOf(cluster.txs.map((t) => t.amount));
      const amountDiff = Math.abs(tx.amount - clusterMedian) / clusterMedian;
      if (amountDiff > AMOUNT_TOLERANCE) continue;

      // Check day proximity: compare against median day of cluster
      const clusterDays = cluster.txs.map((t) => new Date(t.date).getDate());
      const clusterMedianDay = Math.round(medianOf(clusterDays));
      const dayDiff = Math.abs(txDay - clusterMedianDay);
      // Handle month-boundary wrap (e.g., day 28 vs day 2 of next month)
      const dayDiffWrapped = Math.min(dayDiff, 31 - dayDiff);
      if (dayDiffWrapped > DAY_TOLERANCE) continue;

      // Don't add a second tx from the same month to the same cluster
      // (prevents double-counting two similar payments in one month)
      if (cluster.months.has(txMonth)) continue;

      cluster.txs.push(tx);
      cluster.months.add(txMonth);
      matched = true;
      break;
    }

    if (!matched) {
      clusters.push({ txs: [tx], months: new Set([txMonth]) });
    }
  }

  // Filter clusters that qualify as recurring
  const qualifying = clusters.filter(
    (c) => c.months.size >= MIN_MONTHS && c.txs.length >= MIN_CLUSTER_SIZE,
  );

  // Build label from most common description words
  function buildLabel(txs: Transaction[]): string {
    // Use the most common description (exact match first)
    const descCounts = new Map<string, number>();
    for (const t of txs) {
      const d = t.description?.trim() ?? '';
      if (d) descCounts.set(d, (descCounts.get(d) ?? 0) + 1);
    }
    if (descCounts.size === 0) return 'Регулярный платёж';
    // Return the most frequent description, truncated
    const best = [...descCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    return best.length > 40 ? best.slice(0, 37) + '…' : best;
  }

  // IDs of already-known payments (to avoid re-suggesting dismissed ones)
  const existingLabels = new Set(existing.map((p) => p.label));
  const existingDismissed = new Set(
    existing.filter((p) => p.dismissedByUser).map((p) => p.label),
  );

  const results: RecurringPayment[] = [];

  for (const cluster of qualifying) {
    const amounts = cluster.txs.map((t) => t.amount);
    const days = cluster.txs.map((t) => new Date(t.date).getDate());
    const amountMedian = Math.round(medianOf(amounts));
    const dayOfMonth = Math.round(medianOf(days));
    const monthCount = cluster.months.size;
    const confidence: RecurringPayment['confidence'] =
      monthCount >= 4 ? 'high' : monthCount >= 3 ? 'medium' : 'low';

    const label = buildLabel(cluster.txs);

    // Skip if already known (confirmed or dismissed)
    if (existingLabels.has(label)) continue;
    if (existingDismissed.has(label)) continue;

    // Find the most recent occurrence date
    const lastTx = cluster.txs.sort((a, b) => b.date.localeCompare(a.date))[0];

    const entry: RecurringPayment = {
      id: `rp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      label,
      amountMedian,
      dayOfMonth,
      source: 'auto',
      confidence,
      confirmedByUser: false,
      dismissedByUser: false,
      createdAt: new Date().toISOString(),
    };
    if (lastTx?.date) entry.lastSeenAt = lastTx.date;
    results.push(entry);
  }

  // Sort by confidence desc, cap at 20 to avoid overwhelming the user
  const confidenceOrder: Record<RecurringPayment['confidence'], number> = {
    high: 0, medium: 1, low: 2,
  };
  return results
    .sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence])
    .slice(0, 20);
}

// ─── State ────────────────────────────────────────────────────────────────────

export interface FinanceState {
  transactions: Transaction[];
  goals: Goal[];
  budgets: Budget[];
  aiMessages: AiMessage[];
  recurringPayments: RecurringPayment[];
  streak: number;
  lastActiveDate: string;
  // TASK-020: notification settings
  notificationSettings: NotificationSettings;
  // TASK-042: custom categories
  customCategories: Category[];

  addTransaction: (tx: Omit<Transaction, 'id' | 'category'>) => void;
  /** Batch import with deduplication. Returns { imported, skipped } counts. */
  addTransactionsBatch: (txs: Omit<Transaction, 'id' | 'category'>[]) => { imported: number; skipped: number };
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
  // TASK-020
  updateNotificationSettings: (settings: Partial<NotificationSettings>) => void;

  // TASK-042: custom category CRUD
  /** Creates a new custom category. Returns the new category id, or '' if at 20-category limit. */
  addCustomCategory: (cat: Omit<Category, 'id'>) => string;
  deleteCustomCategory: (id: string) => void;

  // Recurring payments CRUD
  addRecurringPayment: (p: Omit<RecurringPayment, 'id' | 'createdAt'>) => void;
  updateRecurringPayment: (id: string, updates: Partial<RecurringPayment>) => void;
  deleteRecurringPayment: (id: string) => void;
  /** Run auto-detection and merge new candidates into the store (does not overwrite existing). */
  runDetectRecurringPayments: () => void;
  getUpcomingPayments: (days: number) => Array<RecurringPayment & { dueDate: string; daysUntil: number }>;

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
      recurringPayments: [],
      customCategories: [],
      streak: 1,
      lastActiveDate: new Date().toISOString().split('T')[0] ?? '',
      notificationSettings: {
        budgetAlerts: true,
        recurringReminders: true,
        weeklyReport: true,
        aiInsights: true,
      },

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
        set((s) => {
          // TASK-023: update linked goals
          const updatedGoals = s.goals.map((g) => {
            if (!g.linkedCategoryId || g.linkedCategoryId !== tx.categoryId) return g;
            if (g.linkedSince && tx.date < g.linkedSince) return g;
            if (g.linkedCategoryMode === 'savings' && tx.type === 'income') {
              return { ...g, currentAmount: Math.min(g.targetAmount, g.currentAmount + tx.amount) };
            }
            return g;
          });
          return { transactions: [newTx, ...s.transactions], goals: updatedGoals };
        });
        get().updateStreak();
        scheduleCloudUpload();
      },

      updateNotificationSettings: (settings) => {
        set((s) => ({ notificationSettings: { ...s.notificationSettings, ...settings } }));
        scheduleCloudUpload();
      },

      addTransactionsBatch: (txs) => {
        // Build dedup key: date(10 chars)|amount|description(50 chars)
        const dedupKey = (tx: Omit<Transaction, 'id' | 'category'>) =>
          `${tx.date.slice(0, 10)}|${tx.amount}|${(tx.description || '').slice(0, 50)}`;

        const existing = get().transactions;
        const existingKeys = new Set(existing.map(dedupKey));

        let imported = 0;
        let skipped = 0;
        const newTxs: Transaction[] = [];

        for (const tx of txs) {
          const key = dedupKey(tx);
          if (existingKeys.has(key)) {
            skipped++;
            continue;
          }
          existingKeys.add(key); // prevent duplicates within the batch itself
          const category = getCategoryById(tx.categoryId) ?? {
            id: tx.categoryId,
            name: tx.categoryId,
            icon: '📦',
            color: '#6B7280',
            type: 'expense' as const,
          };
          newTxs.push({
            ...tx,
            description: tx.description || 'Операция',
            id: `tx_${Date.now()}_${Math.random().toString(36).slice(2)}_${imported}`,
            category,
          });
          imported++;
        }

        if (newTxs.length > 0) {
          set((s) => ({ transactions: [...newTxs, ...s.transactions] }));
          get().updateStreak();
          scheduleCloudUpload();
        }

        return { imported, skipped };
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
        _customCategoryCache = [];
        set({ transactions: [], goals: [], budgets: [], aiMessages: [], recurringPayments: [], customCategories: [], streak: 1, lastActiveDate: '' });
        // Also wipe cloud storage so other devices don't re-sync old data
        clearCloudStorage().catch(() => {/* ignore */});
      },

      // ── Custom categories CRUD (TASK-042) ────────────────────────────────────

      addCustomCategory: (catData) => {
        const MAX_CUSTOM = 20;
        if (get().customCategories.length >= MAX_CUSTOM) return '';
        const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const newCat: Category = { ...catData, id };
        _customCategoryCache = [..._customCategoryCache, newCat];
        set((s) => ({ customCategories: [...s.customCategories, newCat] }));
        scheduleCloudUpload();
        return id;
      },

      deleteCustomCategory: (id) => {
        _customCategoryCache = _customCategoryCache.filter((c) => c.id !== id);
        set((s) => ({ customCategories: s.customCategories.filter((c) => c.id !== id) }));
        scheduleCloudUpload();
      },

      // ── Recurring payments CRUD ──────────────────────────────────────────────

      addRecurringPayment: (p) => {
        const newPayment: RecurringPayment = {
          ...p,
          id: `rp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ recurringPayments: [...s.recurringPayments, newPayment] }));
      },

      updateRecurringPayment: (id, updates) => {
        set((s) => ({
          recurringPayments: s.recurringPayments.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        }));
      },

      deleteRecurringPayment: (id) => {
        set((s) => ({
          recurringPayments: s.recurringPayments.filter((p) => p.id !== id),
        }));
      },

      runDetectRecurringPayments: () => {
        const { transactions, recurringPayments } = get();
        // FIX-3: Run staleness check first — deactivate patterns not seen in 65+ days
        const freshPayments = updateStaleness(recurringPayments);
        const newCandidates = detectRecurringPayments(transactions, freshPayments);
        set((s) => ({
          recurringPayments: [
            ...updateStaleness(s.recurringPayments),
            ...newCandidates,
          ],
        }));
      },

      getUpcomingPayments: (days) => {
        const now = new Date();
        const end = new Date(now);
        end.setDate(now.getDate() + days);

        const daysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        const dueFor = (p: RecurringPayment): { dueDate: string; daysUntil: number } => {
          const mkDate = (base: Date) => {
            const maxDay = daysInMonth(base);
            return new Date(base.getFullYear(), base.getMonth(), Math.min(p.dayOfMonth, maxDay));
          };
          let due = mkDate(now);
          if (due < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
            due = mkDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
          }
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
          const daysUntil = Math.round((due.getTime() - todayStart) / 86400000);
          return { dueDate: due.toISOString(), daysUntil };
        };

        return get().recurringPayments
          .filter((p) => !p.dismissedByUser && (p.confirmedByUser || p.source === 'manual'))
          .map((p) => ({ ...p, ...dueFor(p) }))
          .filter((p) => p.daysUntil >= 0 && p.daysUntil <= days)
          .sort((a, b) => a.daysUntil - b.daysUntil);
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
      onRehydrateStorage: () => (state) => {
        // Sync _customCategoryCache from persisted state so getCategoryById
        // resolves custom categories immediately after cold-start localStorage read.
        if (state?.customCategories?.length) {
          _customCategoryCache = state.customCategories;
        }
      },
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
      budgets: merged.budgets ?? [],
      recurringPayments: merged.recurringPayments ?? [],
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
        budgets: merged.budgets ?? [],
        recurringPayments: merged.recurringPayments ?? [],
        streak: merged.streak,
        lastActiveDate: merged.lastActiveDate,
      };
      localStorage.setItem(storeName, JSON.stringify(localStoreValue));
    } catch { /* ignore — live store already updated */ }

    // If merged has MORE data than what was in cloud (local had extra transactions),
    // write the merged result back to cloud so other devices get the full union.
    if (
      merged.transactions.length > cloudPayload.transactions.length ||
      merged.goals.length > cloudPayload.goals.length ||
      (merged.budgets ?? []).length > (cloudPayload.budgets ?? []).length ||
      (merged.recurringPayments ?? []).length > (cloudPayload.recurringPayments ?? []).length
    ) {
      cloudSet(JSON.stringify(merged)).catch(() => {/* ignore */});
    }
  } catch { /* ignore */ } finally {
    _rehydrating = false; // always release the guard
  }
}
