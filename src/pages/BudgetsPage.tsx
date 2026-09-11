import React, { useState } from 'react';
import { Budget, Category, RecurrenceType, Wallet } from '../types';
import { BudgetCard } from '../components/budgets/BudgetCard';
import { NeoButton } from '../components/ui/NeoButton';
import { usePrivacy } from '../context/PrivacyContext';
import { CalendarSync, Plus, ShieldAlert, Sparkles, Filter } from 'lucide-react';

interface BudgetsPageProps {
  budgets: Budget[];
  categories: Category[];
  wallets?: Wallet[];
  onOpenBudgetModal: () => void;
  onEdit: (b: Budget) => void;
  onDelete: (id: string) => void;
  onTopUp: (id: string, amount: number, walletId?: string) => Promise<void>;
  currencySymbol?: string;
}

export const BudgetsPage: React.FC<BudgetsPageProps> = ({
  budgets,
  categories,
  wallets = [],
  onOpenBudgetModal,
  onEdit,
  onDelete,
  onTopUp,
  currencySymbol = '₹',
}) => {
  const { formatPrivateAmount } = usePrivacy();
  const [selectedRecurrence, setSelectedRecurrence] = useState<'all' | RecurrenceType>('all');

  const filteredBudgets = selectedRecurrence === 'all'
    ? budgets
    : budgets.filter((b) => b.recurrence === selectedRecurrence);

  const totalLoaded = budgets.reduce((acc, b) => acc + ((b.currentLoadedAmount ?? b.initialLoadedAmount) ?? b.amount), 0);
  const totalSpent = budgets.reduce((acc, b) => acc + (b.spentAmount ?? 0), 0);
  const totalRemaining = Math.max(0, totalLoaded - totalSpent);
  const lowFundsCount = budgets.filter((b) => b.isLowAmount || b.isLowPercent || b.isOverBudget).length;

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-150">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#05DF72] p-4 sm:p-6 border-[3px] border-[#121212] shadow-neo">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono font-black uppercase tracking-widest bg-[#121212] text-[#05DF72] px-2 py-0.5 inline-block">
              RELOADABLE POCKETS & BUDGETS
            </span>
            {lowFundsCount > 0 && (
              <span className="text-[10px] font-black bg-[#FF4343] text-white px-2 py-0.5 border border-[#121212] flex items-center gap-1 shadow-neo-sm">
                <ShieldAlert size={11} /> {lowFundsCount} LOW FUNDS ALERT
              </span>
            )}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black uppercase text-[#121212] tracking-tight">
            RECURRING BUDGETS & POCKETS
          </h2>
          <p className="text-xs font-bold text-neutral-900 mt-0.5">
            Allocate funds, top-up whenever low, and automate Daily, Weekly & Monthly spending limits.
          </p>
        </div>

        <NeoButton
          variant="dark"
          size="md"
          onClick={onOpenBudgetModal}
          className="flex items-center gap-1.5 shrink-0"
        >
          <Plus size={16} strokeWidth={3} className="text-[#FFE600]" />
          <span>New Budget / Pocket</span>
        </NeoButton>
      </div>

      {/* Engine Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white border-[3px] border-[#121212] shadow-neo flex flex-col justify-between gap-1">
          <span className="text-[10px] font-black uppercase text-neutral-500 block">
            TOTAL LOADED CAPITAL
          </span>
          <span className="text-2xl font-mono font-black text-[#121212]">
            {formatPrivateAmount(totalLoaded, currencySymbol)}
          </span>
          <span className="text-[10px] font-bold text-neutral-500">Across {budgets.length} active pockets</span>
        </div>

        <div className="p-4 bg-white border-[3px] border-[#121212] shadow-neo flex flex-col justify-between gap-1">
          <span className="text-[10px] font-black uppercase text-neutral-500 block">
            SPENT THIS CYCLE
          </span>
          <span className="text-2xl font-mono font-black text-[#FF4343]">
            {formatPrivateAmount(totalSpent, currencySymbol)}
          </span>
          <span className="text-[10px] font-bold text-neutral-500">Live aggregated period spend</span>
        </div>

        <div className="p-4 bg-white border-[3px] border-[#121212] shadow-neo flex flex-col justify-between gap-1">
          <span className="text-[10px] font-black uppercase text-neutral-500 block">
            AVAILABLE REMAINING BALANCE
          </span>
          <span className="text-2xl font-mono font-black text-[#05DF72]">
            {formatPrivateAmount(totalRemaining, currencySymbol)}
          </span>
          <span className="text-[10px] font-bold text-neutral-500">Ready to spend or top-up</span>
        </div>
      </div>

      {/* Recurrence Filter Tabs for Daily, Weekly, Monthly, All */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <span className="text-xs font-black uppercase text-neutral-500 flex items-center gap-1 mr-2 shrink-0">
          <Filter size={13} /> Cycle:
        </span>
        {(['all', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const).map((cycle) => (
          <button
            key={cycle}
            onClick={() => setSelectedRecurrence(cycle)}
            className={`px-3 py-1.5 text-xs font-black uppercase border-2 transition-all cursor-pointer whitespace-nowrap ${
              selectedRecurrence === cycle
                ? 'bg-[#121212] text-white border-[#121212] shadow-neo-sm'
                : 'bg-white text-neutral-700 border-neutral-300 hover:border-[#121212]'
            }`}
          >
            {cycle === 'all' ? 'All Cycles' : cycle}
          </button>
        ))}
      </div>

      {/* Budget Grid */}
      {filteredBudgets.length === 0 ? (
        <div className="bg-white border-[3px] border-[#121212] shadow-neo p-12 text-center flex flex-col items-center gap-3">
          <div className="w-14 h-14 bg-[#FFE600] border-2 border-[#121212] shadow-neo flex items-center justify-center font-black">
            <CalendarSync size={28} />
          </div>
          <h3 className="text-lg font-black uppercase text-[#121212]">
            No {selectedRecurrence !== 'all' ? `${selectedRecurrence.toUpperCase()} ` : ''}Budgets Found
          </h3>
          <p className="text-xs font-semibold text-neutral-600 max-w-md">
            Create an initial pocket/budget (Daily Coffee, Weekly Grocery, Monthly Rent) with top-up triggers and spending limits.
          </p>
          <NeoButton variant="secondary" size="md" onClick={onOpenBudgetModal} className="mt-2">
            Create Budget / Pocket
          </NeoButton>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredBudgets.map((b) => (
            <BudgetCard
              key={b._id}
              budget={b}
              onEdit={onEdit}
              onDelete={onDelete}
              onTopUp={onTopUp}
              wallets={wallets}
              currencySymbol={currencySymbol}
            />
          ))}
        </div>
      )}

    </div>
  );
};
