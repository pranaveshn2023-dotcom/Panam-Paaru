import React, { useEffect, useState } from 'react';
import { FinancialStats, Transaction, Budget, Category, Wallet as WalletType, WalletSummary } from '../types';
import { NeoButton } from '../components/ui/NeoButton';
import { usePrivacy } from '../context/PrivacyContext';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  CalendarSync,
  Plus,
  AlertTriangle,
  Sparkles,
  Command,
  Eye,
  EyeOff,
  Zap,
  Target,
  Activity,
  RefreshCw,
  Bell,
  Search,
  Filter,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface OverviewPageProps {
  stats: FinancialStats | null;
  transactions: Transaction[];
  budgets: Budget[];
  categories: Category[];
  wallets?: WalletType[];
  walletSummary?: WalletSummary | null;
  onOpenAddModal: (defaultType?: 'expense' | 'income' | 'transfer') => void;
  onOpenBudgetModal: () => void;
  onOpenTransferModal?: () => void;
  onNavigateToTab: (tab: any) => void;
  currencySymbol?: string;
  userName?: string;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  stats,
  transactions,
  budgets,
  categories,
  wallets = [],
  walletSummary,
  onOpenAddModal,
  onOpenBudgetModal,
  onOpenTransferModal,
  onNavigateToTab,
  currencySymbol = '₹',
  userName,
}) => {
  const { isPrivacyMode, togglePrivacyMode, formatPrivateAmount } = usePrivacy();

  const totalBalance = stats?.totalBalance ?? 0;
  const monthIncome = stats?.thisMonthIncome ?? 0;
  const monthExpense = stats?.thisMonthExpense ?? 0;
  const savingsRate = stats?.savingsRate ?? 0;

  // Time of day greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Trigger celebratory confetti ONLY ONCE upon fresh login session (or after re-signing in)
  useEffect(() => {
    const hasCelebrated = sessionStorage.getItem('panam_welcome_celebrated');
    if (!hasCelebrated && (monthIncome > 0 || totalBalance > 0)) {
      sessionStorage.setItem('panam_welcome_celebrated', 'true');
      try {
        confetti({
          particleCount: 40,
          spread: 70,
          origin: { y: 0.8 },
          colors: ['#FFE600', '#05DF72', '#121212'],
        });
      } catch (e) {}
    }
  }, [monthIncome, totalBalance]);

  const overBudgetItems = budgets.filter((b) => b.isOverBudget || b.isWarning);

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-150">
      
      {/* Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#FFE600] p-5 sm:p-7 border-[3px] border-[#121212] shadow-neo relative overflow-hidden">
        
        {/* Subtle decorative stamp */}
        <div className="absolute right-4 -bottom-6 select-none opacity-10 font-black text-8xl font-mono pointer-events-none hidden md:block">
          பணம்
        </div>

        <div className="z-10">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-mono font-black uppercase tracking-widest bg-[#121212] text-[#FFE600] px-2 py-0.5 inline-block">
              {getGreeting()}{userName ? `, ${userName.split(' ')[0]}` : ''} 👋
            </span>
            {savingsRate >= 50 && monthIncome > 0 && (
              <span className="text-[10px] font-black bg-[#05DF72] text-[#121212] px-2 py-0.5 border border-[#121212] flex items-center gap-1 shadow-neo-sm">
                <Sparkles size={11} /> 50%+ SAVINGS CLUB
              </span>
            )}
          </div>

          <h2 className="text-2xl sm:text-4xl font-black uppercase text-[#121212] tracking-tight">
            SEE YOUR MONEY. <br className="hidden sm:inline" />
            CONTROL YOUR SPENDING.
          </h2>
          <p className="text-xs font-bold text-neutral-800 mt-1 max-w-lg">
            Track daily cash flow, automate recurring cycles, and protect your wealth.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 z-10 shrink-0">
          <NeoButton
            variant="dark"
            size="md"
            onClick={() => onOpenAddModal('expense')}
            className="flex items-center gap-1.5"
          >
            <ArrowUpRight size={16} strokeWidth={3} className="text-[#FF4343]" />
            <span>- Expense</span>
          </NeoButton>

          <NeoButton
            variant="secondary"
            size="md"
            onClick={() => onOpenAddModal('income')}
            className="flex items-center gap-1.5"
          >
            <ArrowDownLeft size={16} strokeWidth={3} className="text-[#121212]" />
            <span>+ Income</span>
          </NeoButton>
        </div>
      </div>

      {/* Over-Budget Alert Banner if any */}
      {overBudgetItems.length > 0 && (
        <div className="bg-[#FF4343] text-white p-4 border-[3px] border-[#121212] shadow-neo flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white text-[#FF4343] border-2 border-[#121212] flex items-center justify-center shrink-0">
              <AlertTriangle size={20} strokeWidth={3} />
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-wider block">
                BUDGET ALERT ({overBudgetItems.length} Cycle{overBudgetItems.length > 1 ? 's' : ''})
              </span>
              <p className="text-xs font-medium">
                {overBudgetItems.map((b) => b.name).join(', ')} exceeded or near limit!
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToTab('budgets')}
            className="px-3 py-1.5 bg-white text-[#121212] hover:bg-[#FFE600] text-xs font-black uppercase border-2 border-[#121212] shadow-neo-sm cursor-pointer whitespace-nowrap"
          >
            Review Budgets →
          </button>
        </div>
      )}

      {/* Smart Accounts / Wallets Widget (Matching MyMoney Screenshot 3) */}
      <div className="bg-white border-[3px] border-[#121212] shadow-neo p-4 sm:p-5 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[#121212] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#FFE600] border-2 border-[#121212] flex items-center justify-center font-black">
              <Wallet size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-[#121212]">
                  ACCOUNTS & WALLETS
                </span>
                <span className="px-2 py-0.5 bg-[#121212] text-[#05DF72] text-[10px] font-mono font-black shadow-neo-sm">
                  TOTAL: {formatPrivateAmount(walletSummary?.totalBalance ?? totalBalance, currencySymbol)}
                </span>
              </div>
              <span className="text-[10px] font-bold text-neutral-500">
                {wallets.length} active account{wallets.length !== 1 ? 's' : ''} connected
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onOpenTransferModal ? onOpenTransferModal() : onOpenAddModal('transfer')}
              className="px-2.5 py-1.5 bg-[#00F0FF] text-[#121212] border-2 border-[#121212] text-xs font-black uppercase flex items-center gap-1 shadow-neo-sm hover:translate-x-0.5 hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <ArrowLeftRight size={13} strokeWidth={3} />
              <span>Transfer</span>
            </button>
            <button
              onClick={() => onOpenAddModal('income')}
              className="px-2.5 py-1.5 bg-[#05DF72] text-[#121212] border-2 border-[#121212] text-xs font-black uppercase flex items-center gap-1 shadow-neo-sm hover:translate-x-0.5 hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <ArrowDownLeft size={13} strokeWidth={3} />
              <span>Income</span>
            </button>
            <button
              onClick={() => onOpenAddModal('expense')}
              className="px-2.5 py-1.5 bg-[#FF4343] text-white border-2 border-[#121212] text-xs font-black uppercase flex items-center gap-1 shadow-neo-sm hover:translate-x-0.5 hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <ArrowUpRight size={13} strokeWidth={3} />
              <span>Expense</span>
            </button>
            <button
              onClick={() => onNavigateToTab('wallets')}
              className="px-2.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-[#121212] border-2 border-[#121212] text-xs font-black uppercase shadow-neo-sm transition-all cursor-pointer ml-auto sm:ml-0"
            >
              Manage →
            </button>
          </div>
        </div>

        {/* Mini Account Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          {wallets.length === 0 ? (
            <div className="col-span-full py-2 text-xs font-bold text-neutral-500">
              No accounts created yet. Click Manage to add bank, cash or card accounts.
            </div>
          ) : (
            wallets.map((w) => (
              <div
                key={w._id}
                onClick={() => onNavigateToTab('wallets')}
                className="p-3 bg-neutral-50 hover:bg-neutral-100 border-2 border-[#121212] shadow-neo-sm flex items-center justify-between cursor-pointer transition-all"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-3.5 h-3.5 border border-[#121212] shrink-0 shadow-neo-sm"
                    style={{ backgroundColor: w.color }}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-black uppercase text-[#121212] truncate">
                      {w.name}
                    </span>
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">
                      {w.type} {w.accountNumberLast4 ? `• ••${w.accountNumberLast4}` : ''}
                    </span>
                  </div>
                </div>
                <span className="text-xs sm:text-sm font-mono font-black text-[#121212] shrink-0">
                  {formatPrivateAmount(w.balance, currencySymbol)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Top 4 Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Net Balance with inline Eye Toggle */}
        <div className="bg-white border-[3px] border-[#121212] shadow-neo p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-neutral-500 tracking-wider">
              NET BALANCE
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={togglePrivacyMode}
                title={isPrivacyMode ? 'Show Balances' : 'Hide Balances'}
                className="p-1 hover:bg-neutral-100 border border-transparent hover:border-[#121212] transition-colors cursor-pointer"
              >
                {isPrivacyMode ? <EyeOff size={14} className="text-neutral-500" /> : <Eye size={14} className="text-neutral-500" />}
              </button>
              <div className="w-7 h-7 bg-[#05DF72] border border-[#121212] flex items-center justify-center">
                <Wallet size={14} className="text-[#121212]" />
              </div>
            </div>
          </div>
          <div className="text-2xl font-mono font-black text-[#05DF72]">
            {formatPrivateAmount(totalBalance, currencySymbol)}
          </div>
          <span className="text-[10px] font-mono font-bold text-neutral-600">
            All-time cumulative total
          </span>
        </div>

        {/* Monthly Income */}
        <div className="bg-white border-[3px] border-[#121212] shadow-neo p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-neutral-500 tracking-wider">
              THIS MONTH INFLOW
            </span>
            <div className="w-7 h-7 bg-[#05DF72] border border-[#121212] flex items-center justify-center">
              <TrendingUp size={14} />
            </div>
          </div>
          <div className="text-2xl font-mono font-black text-[#05DF72]">
            {isPrivacyMode ? '••••••' : `+${formatPrivateAmount(monthIncome, currencySymbol)}`}
          </div>
          <span className="text-[10px] font-mono font-bold text-neutral-600">
            Earned this month
          </span>
        </div>

        {/* Monthly Expense */}
        <div className="bg-white border-[3px] border-[#121212] shadow-neo p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-neutral-500 tracking-wider">
              THIS MONTH OUTFLOW
            </span>
            <div className="w-7 h-7 bg-[#FF4343] text-white border border-[#121212] flex items-center justify-center">
              <TrendingDown size={14} />
            </div>
          </div>
          <div className="text-2xl font-mono font-black text-[#FF4343]">
            {isPrivacyMode ? '••••••' : `-${formatPrivateAmount(monthExpense, currencySymbol)}`}
          </div>
          <span className="text-[10px] font-mono font-bold text-neutral-600">
            Spent this month
          </span>
        </div>

        {/* Savings Rate */}
        <div className="bg-white border-[3px] border-[#121212] shadow-neo p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-neutral-500 tracking-wider">
              SAVINGS RATIO
            </span>
            <div className="w-7 h-7 bg-[#00F0FF] border border-[#121212] flex items-center justify-center">
              <PiggyBank size={14} />
            </div>
          </div>
          <div className="text-2xl font-mono font-black text-[#121212]">
            {isPrivacyMode ? '••••' : `${savingsRate}%`}
          </div>
          <span className="text-[10px] font-mono font-bold text-neutral-600">
            {savingsRate >= 50
              ? 'Excellent capital retention'
              : savingsRate > 0
              ? 'Positive savings cushion'
              : 'Add income to track ratio'}
          </span>
        </div>

      </div>

      {/* Middle Section: Active Recurring Budgets Showcase + Quick Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Active Budgets Preview (2 cols) */}
        <div className="lg:col-span-2 bg-white border-[3px] border-[#121212] shadow-neo p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b-2 border-[#121212] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-[#05DF72] border border-[#121212] flex items-center justify-center">
                  <CalendarSync size={14} />
                </div>
                <h3 className="text-sm font-black uppercase text-[#121212] tracking-wider">
                  Active Recurring Budgets ({budgets.length})
                </h3>
              </div>
              <button
                onClick={onOpenBudgetModal}
                className="text-xs font-black uppercase text-[#121212] hover:text-[#0066FF] flex items-center gap-1 cursor-pointer underline"
              >
                <Plus size={14} /> New Budget
              </button>
            </div>

            {budgets.length === 0 ? (
              <div className="py-10 text-center flex flex-col items-center gap-3">
                <p className="text-xs font-bold text-neutral-600 max-w-sm">
                  Set spending limits for Daily, Weekly, or Monthly cycles. We calculate actual period spend automatically.
                </p>
                <NeoButton variant="secondary" size="sm" onClick={onOpenBudgetModal}>
                  Create First Recurring Budget
                </NeoButton>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {budgets.slice(0, 4).map((b) => {
                  const spent = b.spentAmount ?? 0;
                  const total = b.amount;
                  const percent = b.progressPercent ?? Math.round((spent / total) * 100);
                  const isOver = b.isOverBudget ?? spent > total;

                  return (
                    <div
                      key={b._id}
                      className="p-3.5 bg-[#FFFDF5] border-2 border-[#121212] shadow-neo-sm flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase text-[#121212] truncate">
                          {b.name}
                        </span>
                        <span className="text-[10px] font-mono font-bold bg-[#FFE600] px-1.5 py-0.2 border border-[#121212]">
                          {b.recurrence.toUpperCase()}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between text-xs font-mono font-bold">
                        <span className={isOver ? 'text-[#FF4343] font-black' : 'text-[#121212]'}>
                          {isPrivacyMode ? '••••' : `${currencySymbol}${spent.toLocaleString()}`}
                        </span>
                        <span className="text-neutral-500">
                          {isPrivacyMode ? '••••' : `/ ${currencySymbol}${total.toLocaleString()}`}
                        </span>
                      </div>

                      {/* Mini Progress */}
                      <div className="w-full h-2.5 bg-white border border-[#121212] overflow-hidden p-[1px]">
                        <div
                          className={`h-full transition-all duration-300 ${
                            isOver ? 'bg-[#FF4343]' : percent >= 80 ? 'bg-[#FF8800]' : 'bg-[#05DF72]'
                          }`}
                          style={{ width: `${Math.min(percent, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-200 flex items-center justify-between">
            <span className="text-[11px] font-bold text-neutral-500 hidden sm:inline">
              Calendar Engine handles leap years & variable month lengths
            </span>
            <button
              onClick={() => onNavigateToTab('budgets')}
              className="text-xs font-black uppercase text-neutral-800 hover:text-[#121212] underline cursor-pointer"
            >
              View All Cycles →
            </button>
          </div>
        </div>

        {/* Quick Recent Transactions (1 col) */}
        <div className="bg-white border-[3px] border-[#121212] shadow-neo p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b-2 border-[#121212] pb-3 mb-4">
              <h3 className="text-sm font-black uppercase text-[#121212] tracking-wider">
                Recent Activity
              </h3>
              <button
                onClick={() => onNavigateToTab('transactions')}
                className="text-xs font-black uppercase text-[#121212] hover:text-[#0066FF] underline cursor-pointer"
              >
                View All ({transactions.length})
              </button>
            </div>

            {transactions.length === 0 ? (
              <div className="py-10 text-center text-xs font-bold text-neutral-500 flex flex-col items-center gap-2">
                <span>No transactions recorded yet.</span>
                <span className="text-[11px] text-neutral-400">Click below to record your first entry.</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {transactions.slice(0, 5).map((tx) => {
                  const isExp = tx.type === 'expense';
                  return (
                    <div
                      key={tx._id}
                      className="flex items-center justify-between p-2.5 bg-[#FFFDF5] border border-[#121212] text-xs font-bold"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <div
                          className={`w-5 h-5 border border-[#121212] flex items-center justify-center shrink-0 ${
                            isExp ? 'bg-[#FF4343] text-white' : 'bg-[#05DF72] text-[#121212]'
                          }`}
                        >
                          {isExp ? <ArrowUpRight size={12} strokeWidth={3} /> : <ArrowDownLeft size={12} strokeWidth={3} />}
                        </div>
                        <span className="text-[#121212] truncate">{tx.title}</span>
                      </div>
                      <span
                        className={`font-mono font-black shrink-0 ${
                          isExp ? 'text-[#FF4343]' : 'text-[#05DF72]'
                        }`}
                      >
                        {isPrivacyMode
                          ? '••••••'
                          : `${isExp ? '-' : '+'} ${currencySymbol}${tx.amount.toLocaleString()}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-200">
            <NeoButton
              variant="outline"
              size="sm"
              isFullWidth
              onClick={() => onOpenAddModal('expense')}
            >
              + Quick Record
            </NeoButton>
          </div>
        </div>

      </div>

      {/* Desktop Keyboard Shortcut Bar */}
      <div className="hidden lg:flex items-center justify-between p-3 bg-white border-2 border-[#121212] shadow-neo-sm text-xs font-bold text-neutral-700">
        <div className="flex items-center gap-2">
          <Command size={14} className="text-neutral-500" />
          <span>Quick Shortcuts:</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] font-mono">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-neutral-100 border border-[#121212] font-black">N</kbd> New Transaction
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-neutral-100 border border-[#121212] font-black">B</kbd> New Budget
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-neutral-100 border border-[#121212] font-black">L</kbd> 6-PIN Lock
          </span>
        </div>
      </div>

    </div>
  );
};
