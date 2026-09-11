import React from 'react';
import {
  Transaction,
  Category,
  UserProfile,
  Wallet,
  WalletSummary,
  Budget,
  SpendingAnalytics,
} from '../types';
import { TransactionsPage } from './TransactionsPage';
import { WalletsPage } from './WalletsPage';
import { BudgetsPage } from './BudgetsPage';
import { InsightsPage } from './InsightsPage';
import {
  ArrowLeftRight,
  Wallet as WalletIcon,
  CalendarSync,
  PieChart,
  Layers,
} from 'lucide-react';
import { clsx } from 'clsx';

export type ExpenseSubTab = 'transactions' | 'wallets' | 'budgets' | 'insights';

interface ExpensesHubPageProps {
  activeSubTab: ExpenseSubTab;
  onSelectSubTab: (tab: ExpenseSubTab) => void;
  // Transactions
  transactions: Transaction[];
  categories: Category[];
  user: UserProfile | null;
  onOpenAddTransactionModal: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  // Wallets
  wallets: Wallet[];
  walletSummary?: WalletSummary | null;
  onOpenWalletModal: () => void;
  onOpenTransferModal: (sourceWalletId?: string) => void;
  onEditWallet: (w: Wallet) => void;
  onDeleteWallet: (id: string) => Promise<void>;
  // Budgets
  budgets: Budget[];
  onOpenBudgetModal: () => void;
  onEditBudget: (b: Budget) => void;
  onDeleteBudget: (id: string) => void;
  onTopUpBudget: (id: string, amount: number, walletId?: string) => Promise<void>;
  // Analytics
  analytics: SpendingAnalytics | null;
  currencySymbol?: string;
}

export const ExpensesHubPage: React.FC<ExpensesHubPageProps> = ({
  activeSubTab,
  onSelectSubTab,
  transactions,
  categories,
  user,
  onOpenAddTransactionModal,
  onEditTransaction,
  onDeleteTransaction,
  wallets,
  walletSummary,
  onOpenWalletModal,
  onOpenTransferModal,
  onEditWallet,
  onDeleteWallet,
  budgets,
  onOpenBudgetModal,
  onEditBudget,
  onDeleteBudget,
  onTopUpBudget,
  analytics,
  currencySymbol = '₹',
}) => {
  const subTabs = [
    {
      id: 'transactions' as ExpenseSubTab,
      label: 'Transactions',
      shortLabel: 'Ledger',
      badge: transactions.length,
      icon: ArrowLeftRight,
      color: '#00F0FF',
    },
    {
      id: 'wallets' as ExpenseSubTab,
      label: 'Accounts & Wallets',
      shortLabel: 'Accounts',
      badge: wallets.length,
      icon: WalletIcon,
      color: '#FFD700',
    },
    {
      id: 'budgets' as ExpenseSubTab,
      label: 'Budgets & Pockets',
      shortLabel: 'Budgets',
      badge: budgets.length,
      icon: CalendarSync,
      color: '#05DF72',
    },
    {
      id: 'insights' as ExpenseSubTab,
      label: 'Spending Flow',
      shortLabel: 'Flow',
      icon: PieChart,
      color: '#FF4D8D',
    },
  ];

  return (
    <div className="flex flex-col gap-5 w-full animate-in fade-in duration-150">
      {/* Sleek App-Grade Segmented Control */}
      <div className="bg-white border-[3px] border-[#121212] shadow-neo p-1.5 flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectSubTab(tab.id)}
              className={clsx(
                'flex-1 min-w-[70px] sm:min-w-[120px] py-2 px-2 sm:px-3 text-xs font-black uppercase flex items-center justify-center gap-1.5 border-2 transition-all cursor-pointer whitespace-nowrap',
                isActive
                  ? 'bg-[#121212] text-white border-[#121212] shadow-neo-sm'
                  : 'bg-transparent text-neutral-600 border-transparent hover:bg-neutral-100 hover:text-[#121212]'
              )}
            >
              <div
                className="w-4 h-4 border border-[#121212] flex items-center justify-center shrink-0"
                style={{ backgroundColor: isActive ? tab.color : '#E5E7EB' }}
              >
                <Icon size={10} className="text-[#121212]" strokeWidth={3} />
              </div>
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel}</span>
              {tab.badge !== undefined && (
                <span
                  className={clsx(
                    'text-[10px] font-mono font-black px-1.5 py-0.2 rounded-none border',
                    isActive
                      ? 'bg-[#FFE600] text-[#121212] border-[#FFE600]'
                      : 'bg-neutral-200 text-neutral-700 border-neutral-300'
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sub-view Content */}
      <div className="w-full">
        {activeSubTab === 'transactions' && (
          <TransactionsPage
            transactions={transactions}
            categories={categories}
            user={user}
            onOpenAddModal={onOpenAddTransactionModal}
            onEdit={onEditTransaction}
            onDelete={onDeleteTransaction}
            currencySymbol={currencySymbol}
          />
        )}

        {activeSubTab === 'wallets' && (
          <WalletsPage
            wallets={wallets}
            walletSummary={walletSummary}
            onOpenWalletModal={onOpenWalletModal}
            onOpenTransferModal={onOpenTransferModal}
            onEditWallet={onEditWallet}
            onDeleteWallet={onDeleteWallet}
            currencySymbol={currencySymbol}
          />
        )}

        {activeSubTab === 'budgets' && (
          <BudgetsPage
            budgets={budgets}
            categories={categories}
            wallets={wallets}
            onOpenBudgetModal={onOpenBudgetModal}
            onEdit={onEditBudget}
            onDelete={onDeleteBudget}
            onTopUp={onTopUpBudget}
            currencySymbol={currencySymbol}
          />
        )}

        {activeSubTab === 'insights' && (
          <InsightsPage
            analytics={analytics}
            transactions={transactions}
            currencySymbol={currencySymbol}
          />
        )}
      </div>
    </div>
  );
};
