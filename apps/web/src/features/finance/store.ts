import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
        const category = getCategoryById(tx.categoryId);
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
    { name: 'finwise-finance' }
  )
);
