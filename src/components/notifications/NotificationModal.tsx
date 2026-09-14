import React, { useState } from 'react';
import { NeoModal } from '../ui/NeoModal';
import { NeoButton } from '../ui/NeoButton';
import { Budget, Wallet } from '../../types';
import { usePrivacy } from '../../context/PrivacyContext';
import {
  Bell,
  AlertTriangle,
  Coins,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Wallet as WalletIcon,
} from 'lucide-react';
import { toast } from 'sonner';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  budgets: Budget[];
  wallets?: Wallet[];
  currencySymbol?: string;
  onTopUpBudget?: (id: string, amount: number, walletId?: string) => Promise<void>;
  onNavigateToBudgets?: () => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  budgets = [],
  wallets = [],
  currencySymbol = '₹',
  onTopUpBudget,
  onNavigateToBudgets,
}) => {
  const { formatPrivateAmount } = usePrivacy();

  // Active top-up state per budget card: { [budgetId]: { amount: string, walletId: string, isToppingUp: boolean } }
  const [activeTopUps, setActiveTopUps] = useState<Record<string, { amount: string; walletId: string; isToppingUp: boolean }>>({});

  // Filter budgets that have breached limits
  const alertBudgets = (budgets || []).filter(
    (b) => b.isOverBudget || b.isLowAmount || b.isLowPercent || b.isWarning
  );

  const getTopUpState = (budgetId: string, defaultWalletId?: string) => {
    return (
      activeTopUps[budgetId] || {
        amount: '1000',
        walletId: defaultWalletId || wallets[0]?._id || '',
        isToppingUp: false,
      }
    );
  };

  const handleAmountChange = (budgetId: string, val: string, defaultWalletId?: string) => {
    const current = getTopUpState(budgetId, defaultWalletId);
    setActiveTopUps((prev) => ({
      ...prev,
      [budgetId]: { ...current, amount: val },
    }));
  };

  const handleWalletChange = (budgetId: string, walletId: string) => {
    const current = getTopUpState(budgetId);
    setActiveTopUps((prev) => ({
      ...prev,
      [budgetId]: { ...current, walletId },
    }));
  };

  const handleExecuteTopUp = async (budget: Budget) => {
    if (!onTopUpBudget) return;
    const state = getTopUpState(budget._id, budget.sourceWalletId);
    const amountVal = parseFloat(state.amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error('Please enter a valid top-up amount');
      return;
    }

    try {
      setActiveTopUps((prev) => ({
        ...prev,
        [budget._id]: { ...state, isToppingUp: true },
      }));

      await onTopUpBudget(budget._id, amountVal, state.walletId || undefined);

      setActiveTopUps((prev) => ({
        ...prev,
        [budget._id]: { ...state, isToppingUp: false },
      }));

      toast.success(`Successfully added ${currencySymbol}${amountVal} to ${budget.name}!`);
    } catch (err: any) {
      setActiveTopUps((prev) => ({
        ...prev,
        [budget._id]: { ...state, isToppingUp: false },
      }));
      toast.error(err?.message || 'Failed to add money. Please try again.');
    }
  };

  const handleRequestBrowserNotification = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Browser push notifications are not supported on this browser.');
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        toast.success('Device push notifications enabled!');
        new Notification('🔔 Paanam Alert Enabled', {
          body: 'You will receive notifications whenever a budget alert limit is reached!',
          icon: '/favicon.ico',
        });
      } else {
        toast.warning('Notifications permission was not granted.');
      }
    } catch (e) {
      toast.error('Could not request notification permission.');
    }
  };

  return (
    <NeoModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#FFE600] border-2 border-[#121212] shadow-neo-sm flex items-center justify-center">
            <Bell size={18} className="text-[#121212]" />
          </div>
          <div>
            <span className="font-black text-base sm:text-lg uppercase">
              Notifications & Alerts
            </span>
            <span className="text-[10px] font-mono font-black uppercase text-neutral-500 block">
              {alertBudgets.length > 0
                ? `${alertBudgets.length} Budget Alert${alertBudgets.length === 1 ? '' : 's'} Reached`
                : 'All Budgets Healthy'}
            </span>
          </div>
        </div>
      }
      maxWidth="lg"
    >
      <div className="flex flex-col gap-4">
        {/* Device Push Notifications Banner */}
        {typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted' && (
          <div className="p-3 bg-[#00F0FF]/15 border-2 border-[#00F0FF] shadow-neo-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-[#121212] shrink-0" />
              <p className="text-xs font-bold text-[#121212]">
                Want notifications even when the app is minimized?
              </p>
            </div>
            <button
              onClick={handleRequestBrowserNotification}
              className="px-2.5 py-1 text-[11px] font-black uppercase bg-[#121212] text-white hover:bg-neutral-800 transition-all cursor-pointer shadow-neo-sm shrink-0"
            >
              Enable Push
            </button>
          </div>
        )}

        {/* List of Alerts */}
        {alertBudgets.length === 0 ? (
          <div className="p-6 bg-[#E8F8F0] border-2 border-[#05DF72] shadow-neo text-center flex flex-col items-center gap-2">
            <div className="w-12 h-12 bg-[#05DF72] border-2 border-[#121212] shadow-neo-sm flex items-center justify-center">
              <CheckCircle2 size={24} className="text-[#121212]" strokeWidth={2.5} />
            </div>
            <h3 className="text-sm sm:text-base font-black uppercase text-[#121212]">
              All Budgets Are Healthy
            </h3>
            <p className="text-xs font-bold text-neutral-600 max-w-sm">
              None of your spending pools have reached their alert limits. Your expenses are on track!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="p-2.5 bg-[#FF8800] text-[#121212] border-2 border-[#121212] shadow-neo-sm flex items-center justify-between gap-2 text-xs font-black uppercase">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} strokeWidth={3} className="shrink-0" />
                <span>Budget alert reached — Add money</span>
              </div>
              <span className="text-[10px] font-mono bg-[#121212] text-white px-2 py-0.5 border border-[#121212]">
                {alertBudgets.length} {alertBudgets.length === 1 ? 'ALERT' : 'ALERTS'}
              </span>
            </div>

            {alertBudgets.map((budget) => {
              const spent = budget.spentAmount ?? 0;
              const total = (budget.currentLoadedAmount ?? budget.initialLoadedAmount) ?? budget.amount;
              const remaining = budget.remainingAmount ?? Math.max(0, total - spent);
              const topUpState = getTopUpState(budget._id, budget.sourceWalletId);

              // Simple, clear notification message conveying alert reached & add money
              const isOver = budget.isOverBudget;
              const alertMsg = isOver
                ? `Budget exceeded by ${formatPrivateAmount(spent - total, currencySymbol)}. Add money to continue spending.`
                : budget.isLowAmount
                ? `Alert reached — balance dropped below ${formatPrivateAmount(budget.lowBalanceThresholdAmount ?? 0, currencySymbol)}. Add money to top up.`
                : budget.isLowPercent
                ? `Alert reached — only ${budget.lowBalanceThresholdPercent}% remaining. Add money to top up.`
                : `Alert reached — spending reached limit. Add money to top up.`;

              return (
                <div
                  key={budget._id}
                  className={`p-3.5 border-[3px] border-[#121212] shadow-neo flex flex-col gap-2.5 ${
                    isOver ? 'bg-[#FFF0F0]' : 'bg-[#FFF9EE]'
                  }`}
                >
                  {/* Header Row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-black uppercase text-[#121212]">
                          {budget.name}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-white border border-[#121212] text-neutral-700">
                          {budget.category}
                        </span>
                        {isOver ? (
                          <span className="text-[10px] font-black uppercase px-1.5 py-0.5 bg-[#FF4343] text-white border border-[#121212]">
                            EXCEEDED
                          </span>
                        ) : (
                          <span className="text-[10px] font-black uppercase px-1.5 py-0.5 bg-[#FF8800] text-[#121212] border border-[#121212]">
                            ALERT REACHED
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-black text-[#121212] mt-1.5 flex items-center gap-1.5">
                        <span className="text-sm">⚠️</span>
                        <span>{alertMsg}</span>
                      </p>
                    </div>

                    {/* Remaining Badge */}
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-mono font-bold text-neutral-500 block uppercase">
                        Remaining
                      </span>
                      <span className={`text-sm font-mono font-black ${isOver ? 'text-[#FF4343]' : 'text-[#FF8800]'}`}>
                        {formatPrivateAmount(remaining, currencySymbol)}
                      </span>
                    </div>
                  </div>

                  {/* Inline Add Money / Top-up Action Row */}
                  {onTopUpBudget && (
                    <div className="pt-2 border-t-2 border-neutral-200/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-white/60 p-2 border border-neutral-300">
                      <div className="flex items-center gap-2 flex-1">
                        {/* Amount Input */}
                        <div className="relative flex items-center w-28 sm:w-32">
                          <span className="absolute left-2 text-xs font-mono font-black text-neutral-500 pointer-events-none">
                            {currencySymbol}
                          </span>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            value={topUpState.amount}
                            onChange={(e) => handleAmountChange(budget._id, e.target.value, budget.sourceWalletId)}
                            placeholder="1000"
                            className="neo-input pl-6 pr-2 py-1 text-xs font-mono font-black text-[#121212] w-full"
                          />
                        </div>

                        {/* Source Wallet Dropdown */}
                        {wallets.length > 0 && (
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <WalletIcon size={12} className="text-neutral-500 shrink-0" />
                            <select
                              value={topUpState.walletId}
                              onChange={(e) => handleWalletChange(budget._id, e.target.value)}
                              className="p-1 text-xs font-bold bg-white border border-[#121212] truncate w-full cursor-pointer"
                            >
                              <option value="">No Wallet</option>
                              {wallets.map((w) => (
                                <option key={w._id} value={w._id}>
                                  {w.name} ({currencySymbol}{w.balance.toLocaleString('en-IN')})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {/* Add Money Button */}
                      <button
                        type="button"
                        onClick={() => handleExecuteTopUp(budget)}
                        disabled={topUpState.isToppingUp}
                        className="px-3 py-1.5 bg-[#05DF72] hover:bg-[#04C966] text-[#121212] border-2 border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none text-xs font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-60"
                      >
                        {topUpState.isToppingUp ? (
                          <RefreshCw size={12} className="animate-spin" />
                        ) : (
                          <Coins size={13} strokeWidth={2.5} />
                        )}
                        <span>{topUpState.isToppingUp ? 'Adding...' : '+ Add Money'}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t-2 border-neutral-200">
          {onNavigateToBudgets && alertBudgets.length > 0 && (
            <button
              onClick={() => {
                onClose();
                onNavigateToBudgets();
              }}
              className="text-xs font-black uppercase text-[#121212] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Manage Budgets</span>
              <ArrowRight size={13} />
            </button>
          )}
          <div className="ml-auto">
            <NeoButton variant="outline" size="sm" onClick={onClose}>
              Close
            </NeoButton>
          </div>
        </div>
      </div>
    </NeoModal>
  );
};
