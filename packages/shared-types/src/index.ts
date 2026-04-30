// ============================================================
// FinWise Shared Types
// ============================================================

// --- User ---
export interface User {
  id: string;
  telegramId: number;
  username?: string;
  firstName: string;
  currency: Currency;
  timezone: string;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile extends User {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  streak: UserStreak;
  achievements: UserAchievement[];
}

// --- Currency ---
export type Currency = 'RUB' | 'USD' | 'EUR' | 'CNY';

// --- Account ---
export type AccountType = 'cash' | 'card' | 'bank' | 'investment' | 'crypto';

export interface Account {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  balance: number;
  currency: Currency;
  bankConnectionId?: string;
  isPrimary: boolean;
  color: string;
  icon: string;
}

// --- Transaction ---
export type TransactionType = 'income' | 'expense' | 'transfer';
export type TransactionSource = 'manual' | 'bank_sync' | 'sms_parse';

export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  categoryId: string;
  amount: number;
  type: TransactionType;
  description?: string;
  date: string;
  isRecurring: boolean;
  tags: string[];
  source: TransactionSource;
  createdAt: string;
  // Joined
  category?: Category;
  account?: Account;
}

export interface CreateTransactionDto {
  accountId: string;
  categoryId: string;
  amount: number;
  type: TransactionType;
  description?: string;
  date: string;
  tags?: string[];
}

export interface TransactionFilters {
  startDate?: string;
  endDate?: string;
  type?: TransactionType;
  categoryId?: string;
  accountId?: string;
  limit?: number;
  offset?: number;
}

// --- Category ---
export type CategoryType = 'income' | 'expense';

export interface Category {
  id: string;
  userId?: string;
  name: string;
  icon: string;
  color: string;
  type: CategoryType;
  parentId?: string;
  budgetLimit?: number;
  isSystem: boolean;
}

// --- Goal ---
export type GoalStatus = 'active' | 'completed' | 'paused' | 'cancelled';
export type AutoSaveFrequency = 'daily' | 'weekly' | 'monthly';

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  icon: string;
  color: string;
  autoSaveAmount?: number;
  autoSaveFrequency?: AutoSaveFrequency;
  status: GoalStatus;
  createdAt: string;
  // Computed
  progressPercent: number;
  daysLeft?: number;
  monthlyRequired?: number;
}

export interface CreateGoalDto {
  title: string;
  description?: string;
  targetAmount: number;
  deadline?: string;
  icon?: string;
  color?: string;
  autoSaveAmount?: number;
  autoSaveFrequency?: AutoSaveFrequency;
}

// --- Budget ---
export type BudgetPeriod = 'monthly' | 'weekly';

export interface Budget {
  id: string;
  userId: string;
  categoryId: string;
  amount: number;
  period: BudgetPeriod;
  month: number;
  year: number;
  spent: number;
  // Computed
  remaining: number;
  percentUsed: number;
  category?: Category;
}

// --- Bank Connection ---
export type BankConnectionStatus = 'active' | 'expired' | 'revoked';

export interface BankConnection {
  id: string;
  userId: string;
  bankId: string;
  bankName: string;
  status: BankConnectionStatus;
  lastSyncAt?: string;
}

export interface SupportedBank {
  id: string;
  name: string;
  logo: string;
  color: string;
  supportsOpenApi: boolean;
  supportsSmsParser: boolean;
}

// --- Analytics ---
export interface AnalyticsSummary {
  period: { start: string; end: string };
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  savingsRate: number;
  topCategories: CategorySpending[];
  dailySpending: DailySpending[];
  comparedToPrevious: {
    incomeChange: number;
    expensesChange: number;
  };
}

export interface CategorySpending {
  category: Category;
  amount: number;
  percent: number;
  transactionCount: number;
  budget?: number;
  budgetPercent?: number;
}

export interface DailySpending {
  date: string;
  income: number;
  expenses: number;
}

export interface MonthlyTrend {
  month: string;
  income: number;
  expenses: number;
  savings: number;
}

// --- AI ---
export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface AiInsight {
  id: string;
  type: 'pattern' | 'goal' | 'optimization' | 'warning';
  title: string;
  description: string;
  actionText?: string;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
}

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  totalIncome: number;
  totalExpenses: number;
  plannedExpenses: number;
  insights: AiInsight[];
  goalProgress: GoalProgress[];
  weeklyTip: string;
  motivationMessage: string;
}

export interface GoalProgress {
  goal: Goal;
  weeklyContribution: number;
  onTrack: boolean;
}

// --- Gamification ---
export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: 'financial' | 'analytical' | 'streak' | 'social';
  requirement: number;
  points: number;
}

export interface UserAchievement {
  achievement: Achievement;
  unlockedAt: string;
  progress: number;
}

export interface UserStreak {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string;
  isFrozen: boolean;
  freezesRemaining: number;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  icon: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  reward: string;
  isCompleted: boolean;
}

// --- Onboarding ---
export type OnboardingGoalType =
  | 'housing'
  | 'travel'
  | 'car'
  | 'emergency_fund'
  | 'investment'
  | 'other';

export interface OnboardingData {
  goalType: OnboardingGoalType;
  monthlyIncome: number;
  incomeType: 'regular' | 'irregular';
  bankId?: string;
  firstTransaction?: CreateTransactionDto;
}

// --- API Responses ---
export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

// --- Notifications ---
export interface NotificationSettings {
  budgetAlerts: boolean;
  streakReminders: boolean;
  goalMilestones: boolean;
  weeklyReport: boolean;
  aiInsights: boolean;
  reminderTime: string; // HH:MM
}
