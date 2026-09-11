import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useQuery, useMutation } from 'convex/react';
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
import { ToastProvider } from './components/ui/ToastProvider';

// Layout & Components
import { Header } from './components/layout/Header';
import { Sidebar, NavTab } from './components/layout/Sidebar';
import { BottomNav } from './components/layout/BottomNav';
import { AuthScreen } from './components/auth/AuthScreen';
import { PinLockScreen } from './components/pin/PinLockScreen';
import { PinSetupModal } from './components/pin/PinSetupModal';
import { TransactionFormModal } from './components/transactions/TransactionFormModal';
import { BudgetModal } from './components/budgets/BudgetModal';
import { WalletModal } from './components/wallets/WalletModal';
import { TransferModal } from './components/wallets/TransferModal';
import { InvestmentModal } from './components/investments/InvestmentModal';
import { InvestmentImportModal } from './components/investments/InvestmentImportModal';
import { InvestmentDashboard } from './components/investments/InvestmentDashboard';

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
  const { isPinEnabled, lockNow, isLocked } = usePinLock();

  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [expenseSubTab, setExpenseSubTab] = useState<ExpenseSubTab>('transactions');

  const handleNavigate = useCallback((tab: string) => {
    if (tab === 'transactions' || tab === 'wallets' || tab === 'budgets' || tab === 'insights') {
      setExpenseSubTab(tab as ExpenseSubTab);
      setActiveTab('expenses');
    } else if (tab === 'overview' || tab === 'expenses' || tab === 'investments' || tab === 'settings') {
      setActiveTab(tab as NavTab);
    }
  }, []);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [isInvestmentModalOpen, setIsInvestmentModalOpen] = useState(false);
  const [isInvestmentImportModalOpen, setIsInvestmentImportModalOpen] = useState(false);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const directUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [editingInvestment, setEditingInvestment] = useState<Investment | null>(null);
  const [isPinSetupModalOpen, setIsPinSetupModalOpen] = useState(false);

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
  const wallets = (cloudWalletsData?.wallets as Wallet[]) ?? [];
  const walletSummary: WalletSummary = cloudWalletsData ?? {
    wallets: [],
    totalBalance: 0,
    expenseSoFar: 0,
    incomeSoFar: 0,
  };
  const cloudBudgets = useQuery(api.budgets.listWithProgress, undefined) ?? [];
  const cloudCategories = useQuery(api.transactions.getCategories, undefined) ?? [];
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
  const addInvestmentMutation = useMutation(api.investments.add);
  const batchAddInvestmentMutation = useMutation(api.investments.batchAdd);
  const updateInvestmentMutation = useMutation(api.investments.update);
  const quickUpdateInvestmentMutation = useMutation(api.investments.quickUpdateValue);
  const removeInvestmentMutation = useMutation(api.investments.remove);
  const updateSettingsMutation = useMutation(api.users.updateSettings);
  const initializeUserDataMutation = useMutation(api.users.initializeUserData);

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
    }
  }, [isAuthenticated, initializeUserDataMutation, checkAndRenewRecurringBudgetsMutation]);

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
        setEditingTransaction(null);
        setIsTransactionModalOpen(true);
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        setEditingBudget(null);
        setIsBudgetModalOpen(true);
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        setEditingInvestment(null);
        setIsInvestmentModalOpen(true);
      } else if (e.key === 'l' || e.key === 'L') {
        if (isPinEnabled) {
          e.preventDefault();
          lockNow();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated, isLocked, isPinEnabled, lockNow]);

  const transactions: Transaction[] = cloudTransactions ?? [];
  const budgets: Budget[] = cloudBudgets ?? [];
  const investments: Investment[] = cloudInvestments ?? [];
  const portfolioSummary: PortfolioSummary | null = cloudPortfolioSummary ?? null;
  const categories: Category[] = cloudCategories && cloudCategories.length > 0 ? cloudCategories : DEFAULT_CATEGORIES;
  const user: UserProfile | null = cloudUser ?? null;

  const currencySymbol = user?.settings?.currencySymbol || '₹';
  const currentCurrency = user?.settings?.currency || 'INR';

  const stats: FinancialStats = cloudStats ?? {
    totalIncome: 0,
    totalExpense: 0,
    totalBalance: 0,
    thisMonthIncome: 0,
    thisMonthExpense: 0,
    savingsRate: 0,
    transactionCount: 0,
  };

  const analytics: SpendingAnalytics = cloudAnalytics ?? {
    categoryBreakdown: [],
    monthlyTrends: [],
    dailyAverageExpense: 0,
    highestExpenseCategory: null,
    totalExpensesThisMonth: 0,
    totalIncomeThisMonth: 0,
  };

  const handleSaveTransaction = async (data: {
    title: string; amount: number; type: TransactionType; category: string;
    date: string; notes?: string; walletId?: string; transferToWalletId?: string;
  }) => {
    if (navigator.vibrate) navigator.vibrate(20);
    if (editingTransaction) {
      await updateTransactionMutation({
        id: editingTransaction._id as any,
        ...data,
        walletId: data.walletId as any,
        transferToWalletId: data.transferToWalletId as any,
      });
    } else {
      await addTransactionMutation({
        ...data,
        walletId: data.walletId as any,
        transferToWalletId: data.transferToWalletId as any,
      });
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    await removeTransactionMutation({ id: id as any });
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
    if (editingWallet) {
      await updateWalletMutation({ id: editingWallet._id as any, ...payload });
    } else {
      await createWalletMutation(payload);
    }
  };

  const handleDeleteWallet = async (id: string) => {
    if (navigator.vibrate) navigator.vibrate(20);
    await removeWalletMutation({ id: id as any });
  };

  const handleTransferFunds = async (data: {
    fromWalletId: string;
    toWalletId: string;
    amount: number;
    notes?: string;
    date?: string;
  }) => {
    if (navigator.vibrate) navigator.vibrate(30);
    await transferFundsMutation({
      fromWalletId: data.fromWalletId as any,
      toWalletId: data.toWalletId as any,
      amount: data.amount,
      notes: data.notes,
      date: data.date,
    });
  };

  const handleSaveBudget = async (data: {
    name: string; amount: number; initialLoadedAmount?: number;
    category: string; recurrence: RecurrenceType; startDate: string;
    alertThreshold?: number; lowBalanceThresholdAmount?: number;
    lowBalanceThresholdPercent?: number;
    sourceWalletId?: string; autoDeductFromWallet?: boolean;
  }) => {
    if (navigator.vibrate) navigator.vibrate(20);
    if (editingBudget) {
      await updateBudgetMutation({
        id: editingBudget._id as any,
        isActive: true,
        ...data,
        sourceWalletId: data.sourceWalletId as any,
      });
    } else {
      await createBudgetMutation({
        ...data,
        sourceWalletId: data.sourceWalletId as any,
      });
    }
  };

  const handleTopUpBudget = async (id: string, topUpAmount: number, walletId?: string) => {
    if (navigator.vibrate) navigator.vibrate(20);
    await topUpBudgetMutation({ id: id as any, topUpAmount, walletId: walletId as any });
  };

  const handleDeleteBudget = async (id: string) => {
    await removeBudgetMutation({ id: id as any });
  };

  const handleSaveInvestment = async (data: {
    name: string; assetType: AssetType; investedAmount: number; currentValue: number;
    units?: number; buyPrice?: number; currentPrice?: number;
    sipAmount?: number; sipDay?: number; xirr?: string; notes?: string;
  }) => {
    if (navigator.vibrate) navigator.vibrate(20);
    if (editingInvestment) {
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
    await batchAddInvestmentMutation({ items, fileName, broker });
  };

  const handleQuickUpdateInvestmentValue = async (id: string, currentValue: number) => {
    if (navigator.vibrate) navigator.vibrate(15);
    await quickUpdateInvestmentMutation({ id: id as any, currentValue });
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
          setIsInvestmentModalOpen(true);
        }}
        onOpenImportModal={() => setIsInvestmentImportModalOpen(true)}
        onEdit={(inv) => {
          setEditingInvestment(inv);
          setIsInvestmentModalOpen(true);
        }}
        onDelete={handleDeleteInvestment}
        onQuickUpdateValue={handleQuickUpdateInvestmentValue}
        currencySymbol={currencySymbol}
      />
    )
  );

  // 1. Unauthenticated screen
  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  // 2. Strict PIN Lock Guard
  if (isLocked) {
    return <PinLockScreen />;
  }

  return (
    <div className="min-h-screen bg-[#FFFDF5] text-[#121212] flex flex-col font-sans selection:bg-[#FFE600] selection:text-[#121212]">
      <Header
        user={user}
        onOpenTransactionModal={() => {
          setEditingTransaction(null);
          setIsTransactionModalOpen(true);
        }}
        onOpenPinSetup={() => setIsPinSetupModalOpen(true)}
      />

      <div className="flex-1 flex w-full max-w-7xl mx-auto pb-20 md:pb-8 min-w-0">
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
              onOpenAddModal={(defaultType) => {
                setEditingTransaction(null);
                setIsTransactionModalOpen(true);
              }}
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
              onOpenAddTransactionModal={() => { setEditingTransaction(null); setIsTransactionModalOpen(true); }}
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
              currencySymbol={currencySymbol} currentCurrency={currentCurrency}
            />
          )}
        </main>
      </div>

      <BottomNav
        activeTab={activeTab} onSelectTab={setActiveTab}
        onOpenAddModal={() => { setEditingTransaction(null); setIsTransactionModalOpen(true); }}
      />

      <TransactionFormModal
        isOpen={isTransactionModalOpen}
        onClose={() => { setIsTransactionModalOpen(false); setEditingTransaction(null); }}
        onSubmit={handleSaveTransaction} initialData={editingTransaction}
        categories={categories} wallets={wallets} currencySymbol={currencySymbol}
      />

      <BudgetModal
        isOpen={isBudgetModalOpen}
        onClose={() => { setIsBudgetModalOpen(false); setEditingBudget(null); }}
        onSubmit={handleSaveBudget} initialData={editingBudget}
        categories={categories} wallets={wallets} currencySymbol={currencySymbol}
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
        onClose={() => { setIsInvestmentModalOpen(false); setEditingInvestment(null); }}
        onSubmit={handleSaveInvestment} initialData={editingInvestment}
        currencySymbol={currencySymbol}
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
    </div>
  );
}

export default function App() {
  return (
    <PrivacyProvider>
      <ToastProvider />
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#FFFDF5] flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 bg-[#FFE600] border-[3px] border-[#121212] shadow-neo flex items-center justify-center font-black text-2xl mx-auto mb-4 animate-pulse">
                PA
              </div>
              <p className="text-sm font-bold text-neutral-600">Loading Panam Paaru...</p>
            </div>
          </div>
        }
      >
        <AppContent />
      </Suspense>
    </PrivacyProvider>
  );
}
