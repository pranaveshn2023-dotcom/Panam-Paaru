import {
  Transaction,
  Budget,
  Wallet,
  Category,
  Investment,
  UserProfile,
  FinancialStats,
  SpendingAnalytics,
} from '../types';

export interface QueuedMutation {
  id: string;
  timestamp: number;
  type:
    | 'add_transaction'
    | 'update_transaction'
    | 'delete_transaction'
    | 'add_budget'
    | 'update_budget'
    | 'delete_budget'
    | 'topup_budget'
    | 'add_wallet'
    | 'update_wallet'
    | 'delete_wallet'
    | 'transfer_funds'
    | 'add_category'
    | 'update_category'
    | 'delete_category';
  payload: any;
}

// 100% Pure In-Memory Store (Zero Browser localStorage Persistence)
// All data lives exclusively in RAM during runtime and syncs directly to Convex Cloud DB.
const memoryStore = new Map<string, any>();

let activeUserId: string | null = null;

// Immediately purge any legacy or lingering localStorage entries from prior builds
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('paanam_') || k.startsWith('panam_'))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

function getStorageKey(baseKey: string): string {
  const prefix = activeUserId ? `user_${activeUserId}` : 'active_session';
  return `${prefix}_${baseKey}`;
}

const KEYS = {
  TRANSACTIONS: 'offline_transactions',
  BUDGETS: 'offline_budgets',
  WALLETS: 'offline_wallets',
  CATEGORIES: 'offline_categories',
  INVESTMENTS: 'offline_investments',
  USER: 'offline_user',
  STATS: 'offline_stats',
  ANALYTICS: 'offline_analytics',
  QUEUE: 'offline_mutation_queue',
};

function getStorageItem<T>(key: string, fallback: T): T {
  const storeKey = getStorageKey(key);
  if (memoryStore.has(storeKey)) {
    const val = memoryStore.get(storeKey);
    return val !== undefined && val !== null ? val : fallback;
  }
  return fallback;
}

function setStorageItem<T>(key: string, value: T): void {
  const storeKey = getStorageKey(key);
  memoryStore.set(storeKey, value);
}

export const offlineStorage = {
  /**
   * Set the current authenticated user in memory
   */
  setCurrentUser(userId: string | null) {
    activeUserId = userId;
  },

  getCurrentUser(): string | null {
    return activeUserId;
  },

  /**
   * Wipes all cached snapshots for the active user upon sign-out from RAM
   */
  clearActiveSession() {
    if (activeUserId) {
      const prefix = `user_${activeUserId}_`;
      for (const k of Array.from(memoryStore.keys())) {
        if (k.startsWith(prefix)) {
          memoryStore.delete(k);
        }
      }
    }
    activeUserId = null;
  },

  /**
   * Completely purges the entire in-memory store
   */
  clearAll() {
    memoryStore.clear();
    activeUserId = null;
  },
  // --- Snapshot Savers & Getters ---
  saveTransactions(data: Transaction[]) {
    setStorageItem(KEYS.TRANSACTIONS, data);
  },
  getTransactions(): Transaction[] {
    return getStorageItem<Transaction[]>(KEYS.TRANSACTIONS, []);
  },

  saveBudgets(data: Budget[]) {
    setStorageItem(KEYS.BUDGETS, data);
  },
  getBudgets(): Budget[] {
    return getStorageItem<Budget[]>(KEYS.BUDGETS, []);
  },

  saveWallets(data: Wallet[]) {
    setStorageItem(KEYS.WALLETS, data);
  },
  getWallets(): Wallet[] {
    return getStorageItem<Wallet[]>(KEYS.WALLETS, []);
  },

  saveCategories(data: Category[]) {
    setStorageItem(KEYS.CATEGORIES, data);
  },
  getCategories(): Category[] {
    return getStorageItem<Category[]>(KEYS.CATEGORIES, []);
  },

  saveInvestments(data: Investment[]) {
    setStorageItem(KEYS.INVESTMENTS, data);
  },
  getInvestments(): Investment[] {
    return getStorageItem<Investment[]>(KEYS.INVESTMENTS, []);
  },

  saveUser(data: UserProfile | null) {
    setStorageItem(KEYS.USER, data);
  },
  getUser(): UserProfile | null {
    return getStorageItem<UserProfile | null>(KEYS.USER, null);
  },

  saveStats(data: FinancialStats) {
    setStorageItem(KEYS.STATS, data);
  },
  getStats(): FinancialStats | null {
    return getStorageItem<FinancialStats | null>(KEYS.STATS, null);
  },

  // --- Mutation Queue Management ---
  getQueue(): QueuedMutation[] {
    return getStorageItem<QueuedMutation[]>(KEYS.QUEUE, []);
  },

  queueMutation(
    type: QueuedMutation['type'],
    payload: any
  ): QueuedMutation {
    const queue = this.getQueue();
    const item: QueuedMutation = {
      id: `mut_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      type,
      payload,
    };
    queue.push(item);
    setStorageItem(KEYS.QUEUE, queue);
    return item;
  },

  removeQueueItem(mutationId: string) {
    const queue = this.getQueue().filter((m) => m.id !== mutationId);
    setStorageItem(KEYS.QUEUE, queue);
  },

  clearQueue() {
    setStorageItem(KEYS.QUEUE, []);
  },

  // --- Optimistic Local Updates ---
  applyOptimisticTransaction(
    data: any,
    editingId?: string
  ): { transaction: Transaction; all: Transaction[] } {
    const list = this.getTransactions();
    let tx: Transaction;

    if (editingId) {
      const idx = list.findIndex((t) => t._id === editingId);
      if (idx !== -1) {
        tx = { ...list[idx], ...data, _id: editingId };
        list[idx] = tx;
      } else {
        tx = { ...data, _id: editingId, createdAt: Date.now() };
        list.unshift(tx);
      }
    } else {
      tx = {
        ...data,
        _id: `local_tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: Date.now(),
      };
      list.unshift(tx);
    }

    this.saveTransactions(list);
    return { transaction: tx, all: list };
  },

  applyOptimisticDeleteTransaction(id: string): Transaction[] {
    const list = this.getTransactions().filter((t) => t._id !== id);
    this.saveTransactions(list);
    return list;
  },

  applyOptimisticBudget(
    data: any,
    editingId?: string
  ): { budget: Budget; all: Budget[] } {
    const list = this.getBudgets();
    let b: Budget;

    if (editingId) {
      const idx = list.findIndex((item) => item._id === editingId);
      if (idx !== -1) {
        b = { ...list[idx], ...data, _id: editingId };
        list[idx] = b;
      } else {
        b = { ...data, _id: editingId, isActive: true };
        list.unshift(b);
      }
    } else {
      b = {
        ...data,
        _id: `local_bgt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        isActive: true,
        spentAmount: 0,
        remainingAmount: data.amount,
        progressPercent: 0,
        remainingPercent: 100,
        transactionCount: 0,
      };
      list.unshift(b);
    }

    this.saveBudgets(list);
    return { budget: b, all: list };
  },

  applyOptimisticDeleteBudget(id: string): Budget[] {
    const list = this.getBudgets().filter((b) => b._id !== id);
    this.saveBudgets(list);
    return list;
  },

  applyOptimisticWallet(
    data: any,
    editingId?: string
  ): { wallet: Wallet; all: Wallet[] } {
    const list = this.getWallets();
    let w: Wallet;

    if (editingId) {
      const idx = list.findIndex((item) => item._id === editingId);
      if (idx !== -1) {
        w = { ...list[idx], ...data, _id: editingId, updatedAt: Date.now() };
        list[idx] = w;
      } else {
        w = { ...data, _id: editingId, createdAt: Date.now(), updatedAt: Date.now() };
        list.push(w);
      }
    } else {
      w = {
        ...data,
        _id: `local_wal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      list.push(w);
    }

    this.saveWallets(list);
    return { wallet: w, all: list };
  },

  applyOptimisticDeleteWallet(id: string): Wallet[] {
    const list = this.getWallets().filter((w) => w._id !== id);
    this.saveWallets(list);
    return list;
  },

  applyOptimisticCategory(
    data: any,
    editingId?: string
  ): { category: Category; all: Category[] } {
    const list = this.getCategories();
    let cat: Category;

    if (editingId) {
      const idx = list.findIndex((c) => c._id === editingId);
      if (idx !== -1) {
        cat = { ...list[idx], ...data, _id: editingId };
        list[idx] = cat;
      } else {
        cat = { ...data, _id: editingId, isCustom: true };
        list.push(cat);
      }
    } else {
      cat = {
        ...data,
        _id: `local_cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        isCustom: true,
        transactionCount: 0,
        totalAmount: 0,
      };
      list.push(cat);
    }

    this.saveCategories(list);
    return { category: cat, all: list };
  },

  applyOptimisticDeleteCategory(id: string): Category[] {
    const list = this.getCategories().filter((c) => c._id !== id);
    this.saveCategories(list);
    return list;
  },

  // --- Recalculate Stats & Analytics Client-Side when Offline ---
  calculateOfflineStats(transactions: Transaction[], wallets: Wallet[]): FinancialStats {
    let totalIncome = 0;
    let totalExpense = 0;
    let thisMonthIncome = 0;
    let thisMonthExpense = 0;

    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    for (const tx of transactions) {
      if (tx.type === 'income') {
        totalIncome += tx.amount;
        if (tx.date.startsWith(currentYearMonth)) {
          thisMonthIncome += tx.amount;
        }
      } else if (tx.type === 'expense') {
        totalExpense += tx.amount;
        if (tx.date.startsWith(currentYearMonth)) {
          thisMonthExpense += tx.amount;
        }
      }
    }

    const totalBalance = wallets.length > 0
      ? wallets.reduce((acc, w) => acc + (w.balance || 0), 0)
      : totalIncome - totalExpense;

    const savingsRate = thisMonthIncome > 0
      ? Math.max(0, Math.round(((thisMonthIncome - thisMonthExpense) / thisMonthIncome) * 100))
      : 0;

    return {
      totalIncome,
      totalExpense,
      totalBalance,
      thisMonthIncome,
      thisMonthExpense,
      savingsRate,
      transactionCount: transactions.length,
    };
  },

  calculateOfflineAnalytics(transactions: Transaction[], categories: Category[]): SpendingAnalytics {
    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const catSpend = new Map<string, number>();
    let totalExpensesThisMonth = 0;
    let totalIncomeThisMonth = 0;

    for (const tx of transactions) {
      if (tx.date.startsWith(currentYearMonth)) {
        if (tx.type === 'expense') {
          totalExpensesThisMonth += tx.amount;
          catSpend.set(tx.category, (catSpend.get(tx.category) || 0) + tx.amount);
        } else if (tx.type === 'income') {
          totalIncomeThisMonth += tx.amount;
        }
      }
    }

    const catCounts = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.date.startsWith(currentYearMonth) && tx.type === 'expense') {
        catCounts.set(tx.category, (catCounts.get(tx.category) || 0) + 1);
      }
    }

    const categoryBreakdown = Array.from(catSpend.entries()).map(([name, total]) => {
      const cat = categories.find((c) => c.name === name);
      return {
        name,
        total,
        count: catCounts.get(name) || 1,
        color: cat?.color || '#FFE600',
        percentage: totalExpensesThisMonth > 0 ? (total / totalExpensesThisMonth) * 100 : 0,
      };
    });

    let highestExpenseCategory: {
      name: string;
      total: number;
      count: number;
      color: string;
      percentage: number;
    } | null = null;

    if (categoryBreakdown.length > 0) {
      const top = [...categoryBreakdown].sort((a, b) => b.total - a.total)[0];
      highestExpenseCategory = top;
    }

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = Math.max(1, now.getDate());
    const dailyAverageExpense = totalExpensesThisMonth / dayOfMonth;

    return {
      categoryBreakdown,
      monthlyTrends: [],
      dailyAverageExpense,
      highestExpenseCategory,
      totalExpensesThisMonth,
      totalIncomeThisMonth,
    };
  },
};
