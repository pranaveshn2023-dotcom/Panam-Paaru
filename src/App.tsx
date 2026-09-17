import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '../convex/_generated/api';
import {
  Transaction,
  Budget,
  Category,
  FinancialStats,
  SpendingAnalytics,
  UserProfile,
  TransactionType,
  RecurrenceType,
  Investment,
  AssetType,
  PortfolioSummary,
  Wallet,
  WalletType,
  WalletSummary,
} from './types';

// Contexts
import { PinLockProvider, usePinLock } from './context/PinLockContext';
import { PrivacyProvider, usePrivacy } from './context/PrivacyContext';
import { NoInternetScreen } from './components/ui/NoInternetScreen';
import { ToastProvider } from './components/ui/ToastProvider';
import { toast } from 'sonner';

// Layout & Components
import { Header } from './components/layout/Header';
import { Sidebar, NavTab } from './components/layout/Sidebar';
import { BottomNav } from './components/layout/BottomNav';
import { AuthScreen } from './components/auth/AuthScreen';
import { PinLockScreen } from './components/pin/PinLockScreen';
import { SecuringSessionScreen } from './components/pin/SecuringSessionScreen';
import { PinSetupModal } from './components/pin/PinSetupModal';
import { TransactionFormModal } from './components/transactions/TransactionFormModal';
import { BudgetModal } from './components/budgets/BudgetModal';
import { WalletModal } from './components/wallets/WalletModal';
import { TransferModal } from './components/wallets/TransferModal';
import { InvestmentModal } from './components/investments/InvestmentModal';
import { InvestmentImportModal } from './components/investments/InvestmentImportModal';
import { InvestmentDashboard } from './components/investments/InvestmentDashboard';
import { NotificationModal } from './components/notifications/NotificationModal';

// Pages
import { OverviewPage } from './pages/OverviewPage';
import { ExpensesHubPage, ExpenseSubTab } from './pages/ExpensesHubPage';
import { SettingsPage } from './pages/SettingsPage';

// Default categories
const DEFAULT_CATEGORIES: Category[] = [
  { name: 'Food & Dining', type: 'expense', color: '#FFE600', icon: 'Utensils' },
  { name: 'Shopping & Retail', type: 'expense', color: '#FF4D8D', icon: 'ShoppingBag' },
  { name: 'Transport & Fuel', type: 'expense', color: '#00F0FF', icon: 'Car' },
  { name: 'Housing & Utilities', type: 'expense', color: '#9B51E0', icon: 'Home' },
  { name: 'Bills & Subscriptions', type: 'expense', color: '#FF8800', icon: 'Receipt' },
  { name: 'Health & Fitness', type: 'expense', color: '#05DF72', icon: 'HeartPulse' },
  { name: 'Entertainment', type: 'expense', color: '#FF4343', icon: 'Film' },
  { name: 'Salary & Wages', type: 'income', color: '#05DF72', icon: 'Briefcase' },
  { name: 'Freelance & Projects', type: 'income', color: '#2EE59D', icon: 'Laptop' },
  { name: 'Investments & Dividends', type: 'income', color: '#00F0FF', icon: 'TrendingUp' },
];

export function AppContent() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const { isPinLoading, isLocked } = usePinLock();
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [expenseSubTab, setExpenseSubTab] = useState<ExpenseSubTab>('transactions');

  const handleNavigate = useCallback((tab: string) => {
    if (tab === 'transactions' || tab === 'wallets' || tab === 'budgets' || tab === 'categories' || tab === 'insights') {
      setExpenseSubTab(tab as ExpenseSubTab);
      setActiveTab('expenses');
    } else if (tab === 'overview' || tab === 'expenses' || tab === 'investments' || tab === 'settings') {
      setActiveTab(tab as NavTab);
    }
  }, []);

  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [transactionDefaultType, setTransactionDefaultType] = useState<TransactionType>('expense');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const handleOpenTransactionModal = useCallback((defaultType: TransactionType = 'expense') => {
    setEditingTransaction(null);
    setTransactionDefaultType(defaultType);
    setIsTransactionModalOpen(true);
  }, []);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [isInvestmentModalOpen, setIsInvestmentModalOpen] = useState(false);
  const [isInvestmentImportModalOpen, setIsInvestmentImportModalOpen] = useState(false);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const directUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [editingInvestment, setEditingInvestment] = useState<Investment | null>(null);
  const [isTopUpMode, setIsTopUpMode] = useState(false);
  const [isPinSetupModalOpen, setIsPinSetupModalOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [defaultTransferSourceWalletId, setDefaultTransferSourceWalletId] = useState<string | undefined>(undefined);

  const cloudUser = useQuery(api.users.currentUser);
  const cloudTransactions = useQuery(api.transactions.list, undefined) ?? [];
  const cloudStats = useQuery(api.transactions.getStats, undefined) ?? {
    totalIncome: 0, totalExpense: 0, totalBalance: 0,
    thisMonthIncome: 0, thisMonthExpense: 0, savingsRate: 0, transactionCount: 0,
  };
  const cloudWalletsData = useQuery(api.wallets.list, undefined);
  const cloudBudgets = useQuery(api.budgets.listWithProgress, undefined) ?? [];
  const cloudCategories = useQuery(api.categories.listWithStats, undefined) ?? [];
  const cloudAnalytics = useQuery(api.insights.getSpendingAnalytics, undefined) ?? {
    categoryBreakdown: [], monthlyTrends: [], dailyAverageExpense: 0,
    highestExpenseCategory: null, totalExpensesThisMonth: 0, totalIncomeThisMonth: 0,
  };
  const cloudInvestments = useQuery(api.investments.list, undefined) ?? [];
  const cloudPortfolioSummary = useQuery(api.investments.getPortfolioSummary, undefined) ?? null;

  const addTransactionMutation = useMutation(api.transactions.add);
  const updateTransactionMutation = useMutation(api.transactions.update);
  const removeTransactionMutation = useMutation(api.transactions.remove);
  const createWalletMutation = useMutation(api.wallets.create);
  const updateWalletMutation = useMutation(api.wallets.update);
  const removeWalletMutation = useMutation(api.wallets.remove);
  const transferFundsMutation = useMutation(api.wallets.transfer);
  const createBudgetMutation = useMutation(api.budgets.create);
  const updateBudgetMutation = useMutation(api.budgets.update);
  const removeBudgetMutation = useMutation(api.budgets.remove);
  const topUpBudgetMutation = useMutation(api.budgets.topUp);
  const checkAndRenewRecurringBudgetsMutation = useMutation(api.budgets.checkAndRenewRecurringBudgets);
  const createCategoryMutation = useMutation(api.categories.create);
  const updateCategoryMutation = useMutation(api.categories.update);
  const removeCategoryMutation = useMutation(api.categories.remove);
  const addInvestmentMutation = useMutation(api.investments.add);
  const batchAddInvestmentMutation = useMutation(api.investments.batchAdd);
  const syncLiveMarketPricesAction = useAction(api.investments.syncLiveMarketPrices);
  const updateInvestmentMutation = useMutation(api.investments.update);
  const quickUpdateInvestmentMutation = useMutation(api.investments.quickUpdateValue);
  const removeInvestmentMutation = useMutation(api.investments.remove);
  const updateSettingsMutation = useMutation(api.users.updateSettings);
  const initializeUserDataMutation = useMutation(api.users.initializeUserData);
  const autoClassifyCommoditiesMutation = useMutation(api.investments.autoClassifyCommodities);
  const autoDeduplicateHoldingsMutation = useMutation(api.investments.autoDeduplicateExistingHoldings);

  const isLoading = isAuthLoading || cloudInvestments === undefined || cloudPortfolioSummary === undefined;
  const isPortfolioLoading = cloudPortfolioSummary === undefined && isAuthenticated;

  const handleDirectFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingUploadFile(file);
    setActiveTab('investments');
    setIsInvestmentImportModalOpen(true);
    e.target.value = '';
  };

  useEffect(() => {
    if (isAuthenticated) {
      initializeUserDataMutation().catch(() => {});
      checkAndRenewRecurringBudgetsMutation().catch(() => {});
      autoClassifyCommoditiesMutation().catch(() => {});
      autoDeduplicateHoldingsMutation().catch(() => {});
    }
  }, [isAuthenticated, initializeUserDataMutation, checkAndRenewRecurringBudgetsMutation, autoClassifyCommoditiesMutation, autoDeduplicateHoldingsMutation]);

  useEffect(() => {
    if (!isAuthenticated || isLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Direct File Upload Shortcut (Ctrl+U / Cmd+U) -> Native OS File Dialog
      if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        directUploadInputRef.current?.click();
        return;
      }

      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        handleOpenTransactionModal('expense');
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        setEditingBudget(null);
        setIsBudgetModalOpen(true);
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        setEditingInvestment(null);
        setIsInvestmentModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated, isLocked]);

  // --- DIRECT CLOUD DATA RESOLUTION (Zero Offline Storage) ---
  const transactions: Transaction[] = cloudTransactions ?? [];
  const budgets: Budget[] = cloudBudgets ?? [];
  const wallets: Wallet[] = (cloudWalletsData?.wallets as Wallet[]) ?? [];

  const walletSummary: WalletSummary = (cloudWalletsData?.wallets && cloudWalletsData.wallets.length > 0)
    ? cloudWalletsData
    : {
        wallets: wallets || [],
        totalBalance: (wallets || []).reduce((acc, w) => acc + (w.balance || 0), 0),
        expenseSoFar: 0,
        incomeSoFar: 0,
      };

  const categories: Category[] = cloudCategories ?? DEFAULT_CATEGORIES;
  const investments: Investment[] = cloudInvestments ?? [];
  const portfolioSummary: PortfolioSummary | null = cloudPortfolioSummary ?? null;
  const user: UserProfile | null = cloudUser ?? null;

  const currencySymbol = user?.settings?.currencySymbol || '₹';
  const currentCurrency = user?.settings?.currency || 'INR';

  const stats: FinancialStats = (cloudStats && cloudStats.transactionCount > 0)
    ? cloudStats
    : {
        totalBalance: (wallets || []).reduce((acc, w) => acc + (w.balance || 0), 0),
        totalIncome: 0,
        totalExpense: 0,
        thisMonthIncome: 0,
        thisMonthExpense: 0,
        savingsRate: 0,
        transactionCount: transactions.length,
      };

  const analytics: SpendingAnalytics = (cloudAnalytics && cloudAnalytics.categoryBreakdown.length > 0)
    ? cloudAnalytics
    : {
        categoryBreakdown: [],
        monthlyTrends: [],
        dailyAverageExpense: 0,
        highestExpenseCategory: null,
        totalExpensesThisMonth: 0,
        totalIncomeThisMonth: 0,
      };

  // --- DIRECT LIVE ACTION HANDLERS ---
  const handleSaveTransaction = async (data: {
    title: string; amount: number; type: TransactionType; category: string;
    date: string; notes?: string; walletId?: string; transferToWalletId?: string;
  }) => {
    if (navigator.vibrate) navigator.vibrate(20);

    try {
      if (editingTransaction) {
        await updateTransactionMutation({
          id: editingTransaction._id as any,
          ...data,
          walletId: data.walletId as any,
          transferToWalletId: data.transferToWalletId as any,
        });
        toast.success('Transaction updated');
      } else {
        await addTransactionMutation({
          ...data,
          walletId: data.walletId as any,
          transferToWalletId: data.transferToWalletId as any,
        });
        toast.success('Transaction added');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save transaction');
      return;
    }

    // Simple, direct notification when an expense causes a budget alert limit to be reached
    if (data.type === 'expense') {
      const matchedBudget = budgets.find((b) => {
        const matchCategory = b.category === data.category || b.category === 'All Categories';
        if (!matchCategory) return false;
        if (b.sourceWalletId && data.walletId && b.sourceWalletId !== data.walletId) {
          return false;
        }
        return true;
      });
      if (matchedBudget) {
        const currentSpent = (matchedBudget.spentAmount ?? 0) + data.amount;
        const total = (matchedBudget.currentLoadedAmount ?? matchedBudget.initialLoadedAmount) ?? matchedBudget.amount;
        const remaining = Math.max(0, total - currentSpent);
        const hasLowAmt = matchedBudget.lowBalanceThresholdAmount !== undefined &&
          matchedBudget.lowBalanceThresholdAmount > 0 &&
          matchedBudget.lowBalanceThresholdAmount < total
          ? remaining <= matchedBudget.lowBalanceThresholdAmount
          : false;
        const hasLowPct = matchedBudget.lowBalanceThresholdPercent !== undefined && matchedBudget.lowBalanceThresholdPercent > 0
          ? (total > 0 && (remaining / total) * 100 <= matchedBudget.lowBalanceThresholdPercent)
          : false;
        const isOver = currentSpent >= total;

        if (isOver || hasLowAmt || hasLowPct) {
          setTimeout(() => {
            toast.warning(`⚠️ Budget alert reached: Add money to ${matchedBudget.name}!`, {
              action: {
                label: '+ Add Money',
                onClick: () => setIsNotificationsOpen(true),
              },
              duration: 6000,
            });

            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification(`⚠️ Budget Alert: ${matchedBudget.name}`, {
                  body: `Budget alert reached — add money to top up!`,
                  icon: '/favicon.ico',
                });
              } catch {}
            }
          }, 350);
        }
      }
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (navigator.vibrate) navigator.vibrate(20);
    try {
      await removeTransactionMutation({ id: id as any });
      toast.success('Transaction deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete transaction');
    }
  };

  const handleSaveWallet = async (data: {
    name: string;
    type: WalletType;
    balance: number;
    color: string;
    icon: string;
    accountNumberLast4?: string;
    isDefault?: boolean;
    notes?: string;
  }) => {
    if (navigator.vibrate) navigator.vibrate(20);
    const payload = {
      ...data,
      isDefault: data.isDefault ?? false,
    };

    try {
      if (editingWallet) {
        await updateWalletMutation({ id: editingWallet._id as any, ...payload });
        toast.success('Account updated');
      } else {
        await createWalletMutation(payload);
        toast.success('Account created');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save account');
    }
  };

  const handleDeleteWallet = async (id: string) => {
    if (navigator.vibrate) navigator.vibrate(20);
    try {
      await removeWalletMutation({ id: id as any });
      toast.success('Account deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete account');
    }
  };

  const handleTransferFunds = async (data: {
    fromWalletId: string;
    toWalletId: string;
    amount: number;
    notes?: string;
    date?: string;
  }) => {
    if (navigator.vibrate) navigator.vibrate(30);
    try {
      await transferFundsMutation({
        fromWalletId: data.fromWalletId as any,
        toWalletId: data.toWalletId as any,
        amount: data.amount,
        notes: data.notes,
        date: data.date,
      });
      toast.success('Transfer complete');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to transfer funds');
    }
  };

  const handleSaveBudget = async (data: {
    name: string; amount: number; initialLoadedAmount?: number;
    category: string; recurrence: RecurrenceType; startDate: string;
    alertThreshold?: number; lowBalanceThresholdAmount?: number;
    lowBalanceThresholdPercent?: number;
    alertTarget?: 'wallet' | 'pocket';
    sourceWalletId?: string; autoDeductFromWallet?: boolean;
  }) => {
    if (navigator.vibrate) navigator.vibrate(20);

    try {
      if (editingBudget) {
        await updateBudgetMutation({
          id: editingBudget._id as any,
          isActive: true,
          ...data,
          sourceWalletId: data.sourceWalletId as any,
        });
        toast.success('Budget updated');
      } else {
        await createBudgetMutation({
          ...data,
          sourceWalletId: data.sourceWalletId as any,
        });
        toast.success('Budget created');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save budget');
    }
  };

  const handleTopUpBudget = async (id: string, topUpAmount: number, walletId?: string) => {
    if (navigator.vibrate) navigator.vibrate(20);
    try {
      await topUpBudgetMutation({ id: id as any, topUpAmount, walletId: walletId as any });
      toast.success('Budget topped up');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to top up budget');
    }
  };

  const handleDeleteBudget = async (id: string) => {
    if (navigator.vibrate) navigator.vibrate(20);
    try {
      await removeBudgetMutation({ id: id as any });
      toast.success('Budget deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete budget');
    }
  };

  const handleCreateCategory = async (data: {
    name: string;
    type: 'income' | 'expense';
    color: string;
    icon: string;
  }) => {
    if (navigator.vibrate) navigator.vibrate(20);
    try {
      await createCategoryMutation(data);
      toast.success('Category created');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create category');
    }
  };

  const handleUpdateCategory = async (data: {
    id: string;
    name: string;
    type: 'income' | 'expense';
    color: string;
    icon: string;
  }) => {
    if (navigator.vibrate) navigator.vibrate(20);
    try {
      await updateCategoryMutation({
        id: data.id as any,
        name: data.name,
        type: data.type,
        color: data.color,
        icon: data.icon,
      });
      toast.success('Category updated');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update category');
    }
  };

  const handleDeleteCategory = async (id: string, reassignTo?: string) => {
    if (navigator.vibrate) navigator.vibrate(30);
    try {
      await removeCategoryMutation({ id: id as any, reassignTo });
      toast.success('Category deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete category');
    }
  };

  const handleSaveInvestment = async (data: {
    name: string; assetType: AssetType; investedAmount: number; currentValue: number;
    units?: number; buyPrice?: number; currentPrice?: number;
    sipAmount?: number; sipDay?: number; xirr?: string; notes?: string;
    existingIdToMerge?: string;
  }) => {
    if (navigator.vibrate) navigator.vibrate(20);
    if (data.existingIdToMerge) {
      await updateInvestmentMutation({
        id: data.existingIdToMerge as any,
        name: data.name,
        assetType: data.assetType,
        investedAmount: data.investedAmount,
        currentValue: data.currentValue,
        units: data.units,
        buyPrice: data.buyPrice,
        currentPrice: data.currentPrice,
        sipAmount: data.sipAmount,
        sipDay: data.sipDay,
        xirr: data.xirr,
        notes: data.notes,
      });
      toast.success(`Successfully topped up ${data.name}!`);
    } else if (editingInvestment) {
      await updateInvestmentMutation({ id: editingInvestment._id as any, ...data });
    } else {
      await addInvestmentMutation(data);
    }
  };

  const handleBatchImportInvestments = async (
    items: {
      name: string; assetType: AssetType; subType?: string; sector?: string; broker?: string;
      investedAmount: number; currentValue: number;
      units?: number; buyPrice?: number; currentPrice?: number; xirr?: string; notes?: string;
    }[],
    fileName?: string,
    broker?: string
  ) => {
    if (navigator.vibrate) navigator.vibrate(30);
    const res = await batchAddInvestmentMutation({ items, fileName, broker });
    if (res) {
      const summaryParts: string[] = [];
      if (res.inserted > 0) summaryParts.push(`${res.inserted} new`);
      if (res.updated > 0) summaryParts.push(`${res.updated} updated`);
      if (res.unchanged > 0) summaryParts.push(`${res.unchanged} unchanged`);

      if (summaryParts.length > 0) {
        toast.success(`Processed holdings: ${summaryParts.join(', ')}`);
      } else {
        toast.info('All holdings are up to date.');
      }
      // Immediately refresh live market prices for the newly imported assets
      syncLiveMarketPricesAction({}).catch(() => {});
    }
  };

  const handleQuickUpdateInvestmentValue = async (id: string, currentValue: number, currentPrice?: number) => {
    if (navigator.vibrate) navigator.vibrate(15);
    await quickUpdateInvestmentMutation({ id: id as any, currentValue, currentPrice });
  };

  const handleDeleteInvestment = async (id: string) => {
    await removeInvestmentMutation({ id: id as any });
  };

  const handleUpdateCurrency = async (curr: string, symbol: string) => {
    await updateSettingsMutation({
      currency: curr, currencySymbol: symbol, monthStartDay: 1, budgetRollover: false,
    });
  };

  const renderInvestmentsPage = () => (
    isLoading ? (
      <div className="flex flex-col gap-6 w-full animate-in fade-in duration-150">
        <div className="h-32 bg-white border-[3px] border-[#121212] shadow-neo animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-white border-[3px] border-[#121212] shadow-neo animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-white border-[3px] border-[#121212] shadow-neo animate-pulse" />
      </div>
    ) : (
      <InvestmentDashboard
        investments={investments}
        portfolioSummary={portfolioSummary}
        onOpenAddModal={(defaultType) => {
          setEditingInvestment(null);
          setIsTopUpMode(false);
          setIsInvestmentModalOpen(true);
        }}
        onOpenImportModal={() => setIsInvestmentImportModalOpen(true)}
        onEdit={(inv) => {
          setEditingInvestment(inv);
          setIsTopUpMode(false);
          setIsInvestmentModalOpen(true);
        }}
        onTopUp={(inv) => {
          setEditingInvestment(inv);
          setIsTopUpMode(true);
          setIsInvestmentModalOpen(true);
        }}
        onDelete={handleDeleteInvestment}
        onQuickUpdateValue={handleQuickUpdateInvestmentValue}
        currencySymbol={currencySymbol}
      />
    )
  );

  // 0. Offline Guard: "no internet no app opening"
  if (!isOnline) {
    return <NoInternetScreen />;
  }

  // 1. Loading authentication state
  if (isAuthLoading) {
    return <SecuringSessionScreen message="Securing Session..." subMessage="Verifying credentials & auth state" />;
  }

  // 2. Unauthenticated screen
  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  // 3. Strict PIN Lock Guard (if locked, immediately show PIN keypad)
  if (isLocked) {
    return <PinLockScreen />;
  }

  // 4. Verifying security lock state (prevents homepage from ever flashing before PIN check completes)
  if (isPinLoading) {
    return <SecuringSessionScreen message="Securing Session..." subMessage="Verifying security lock & credentials" />;
  }

  return (
    <div className="min-h-screen bg-[#FFFDF5] text-[#121212] flex flex-col font-sans selection:bg-[#FFE600] selection:text-[#121212]">
      <Header
        user={user}
        alertCount={budgets.filter((b) => b.isOverBudget || b.isLowAmount || b.isLowPercent || b.isWarning).length}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        onOpenTransactionModal={() => handleOpenTransactionModal('expense')}
        onOpenPinSetup={() => setIsPinSetupModalOpen(true)}
      />

      <div className="flex-1 flex w-full max-w-7xl mx-auto pb-24 md:pb-8 min-w-0">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          stats={stats}
          currencySymbol={currencySymbol}
        />

        <main className="flex-1 p-3 sm:p-6 lg:p-8 overflow-y-auto min-w-0">
          {activeTab === 'overview' && (
            <OverviewPage
              stats={stats} transactions={transactions} budgets={budgets}
              categories={categories} wallets={wallets} walletSummary={walletSummary}
              onOpenAddModal={(defaultType) => handleOpenTransactionModal(defaultType || 'expense')}
              onOpenBudgetModal={() => { setEditingBudget(null); setIsBudgetModalOpen(true); }}
              onOpenTransferModal={() => {
                setDefaultTransferSourceWalletId(undefined);
                setIsTransferModalOpen(true);
              }}
              onNavigateToTab={handleNavigate}
              currencySymbol={currencySymbol} userName={user?.name}
            />
          )}

          {activeTab === 'expenses' && (
            <ExpensesHubPage
              activeSubTab={expenseSubTab}
              onSelectSubTab={setExpenseSubTab}
              transactions={transactions}
              categories={categories}
              user={user}
              onOpenAddTransactionModal={() => handleOpenTransactionModal('expense')}
              onEditTransaction={(tx) => { setEditingTransaction(tx); setIsTransactionModalOpen(true); }}
              onDeleteTransaction={handleDeleteTransaction}
              wallets={wallets}
              walletSummary={walletSummary}
              onOpenWalletModal={() => {
                setEditingWallet(null);
                setIsWalletModalOpen(true);
              }}
              onOpenTransferModal={(sourceWalletId) => {
                setDefaultTransferSourceWalletId(sourceWalletId);
                setIsTransferModalOpen(true);
              }}
              onEditWallet={(w) => {
                setEditingWallet(w);
                setIsWalletModalOpen(true);
              }}
              onDeleteWallet={handleDeleteWallet}
              budgets={budgets}
              onOpenBudgetModal={() => { setEditingBudget(null); setIsBudgetModalOpen(true); }}
              onEditBudget={(b) => { setEditingBudget(b); setIsBudgetModalOpen(true); }}
              onDeleteBudget={handleDeleteBudget}
              onTopUpBudget={handleTopUpBudget}
              onCreateCategory={handleCreateCategory}
              onUpdateCategory={handleUpdateCategory}
              onDeleteCategory={handleDeleteCategory}
              analytics={analytics}
              currencySymbol={currencySymbol}
            />
          )}

          {activeTab === 'investments' && renderInvestmentsPage()}

          {activeTab === 'settings' && (
            <SettingsPage
              user={user}
              onOpenPinSetup={(isChange) => setIsPinSetupModalOpen(true)}
              onUpdateCurrency={handleUpdateCurrency}
              onNavigateToCategories={() => handleNavigate('categories')}
              currencySymbol={currencySymbol} currentCurrency={currentCurrency}
            />
          )}
        </main>
      </div>

      <BottomNav
        activeTab={activeTab} onSelectTab={setActiveTab}
        onOpenAddModal={() => handleOpenTransactionModal('expense')}
      />

      <TransactionFormModal
        isOpen={isTransactionModalOpen}
        onClose={() => { setIsTransactionModalOpen(false); setEditingTransaction(null); }}
        onSubmit={handleSaveTransaction} initialData={editingTransaction}
        defaultType={transactionDefaultType}
        categories={categories} wallets={wallets} currencySymbol={currencySymbol}
        onCreateCategory={handleCreateCategory}
      />

      <BudgetModal
        isOpen={isBudgetModalOpen}
        onClose={() => { setIsBudgetModalOpen(false); setEditingBudget(null); }}
        onSubmit={handleSaveBudget} initialData={editingBudget}
        categories={categories} wallets={wallets} currencySymbol={currencySymbol}
        onCreateCategory={handleCreateCategory}
      />

      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => { setIsWalletModalOpen(false); setEditingWallet(null); }}
        onSubmit={handleSaveWallet}
        initialData={editingWallet}
        currencySymbol={currencySymbol}
      />

      <TransferModal
        isOpen={isTransferModalOpen}
        onClose={() => { setIsTransferModalOpen(false); setDefaultTransferSourceWalletId(undefined); }}
        onTransfer={handleTransferFunds}
        wallets={wallets}
        defaultSourceWalletId={defaultTransferSourceWalletId}
        currencySymbol={currencySymbol}
      />

      <InvestmentModal
        isOpen={isInvestmentModalOpen}
        onClose={() => {
          setIsInvestmentModalOpen(false);
          setEditingInvestment(null);
          setIsTopUpMode(false);
        }}
        onSubmit={handleSaveInvestment}
        initialData={editingInvestment}
        currencySymbol={currencySymbol}
        existingInvestments={cloudInvestments as Investment[]}
        isTopUpMode={isTopUpMode}
      />

      {/* Hidden File Input for Direct OS File Dialog Upload (Ctrl+U) */}
      <input
        type="file"
        ref={directUploadInputRef}
        onChange={handleDirectFileSelect}
        accept=".pdf,.xlsx,.xls,.csv,.tsv,.docx,.doc"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />

      {isInvestmentImportModalOpen && (
        <InvestmentImportModal
          isOpen={isInvestmentImportModalOpen}
          onClose={() => {
            setIsInvestmentImportModalOpen(false);
            setPendingUploadFile(null);
          }}
          onBatchImport={handleBatchImportInvestments}
          currencySymbol={currencySymbol}
          initialFile={pendingUploadFile}
          onClearInitialFile={() => setPendingUploadFile(null)}
        />
      )}

      <PinSetupModal
        isOpen={isPinSetupModalOpen}
        onClose={() => setIsPinSetupModalOpen(false)}
      />

      <NotificationModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        budgets={budgets}
        wallets={wallets}
        currencySymbol={currencySymbol}
        onTopUpBudget={handleTopUpBudget}
        onNavigateToBudgets={() => handleNavigate('budgets')}
      />
    </div>
  );
}

export default function App() {
  return (
    <PrivacyProvider>
      <ToastProvider />
      <Suspense fallback={<SecuringSessionScreen message="Securing Session..." subMessage="Verifying security lock & credentials" />}>
        <AppContent />
      </Suspense>
    </PrivacyProvider>
  );
}
