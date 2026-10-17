import React, { useState } from 'react';
import { Budget, Wallet } from '../../types';
import { NeoProgress } from '../ui/NeoProgress';
import { usePrivacy } from '../../context/PrivacyContext';
import { AlertTriangle, Clock, Trash2, Edit, PlusCircle, ShieldAlert, Coins } from 'lucide-react';

interface BudgetCardProps {
  budget: Budget;
  onEdit: (b: Budget) => void;
  onDelete: (id: string) => void;
  onTopUp?: (id: string, amount: number, walletId?: string) => Promise<void>;
  wallets?: Wallet[];
  currencySymbol?: string;
}

export const BudgetCard: React.FC<BudgetCardProps> = ({
  budget,
  onEdit,
  onDelete,
  onTopUp,
  wallets = [],
  currencySymbol = '₹',
}) => {
  const { isPrivacyMode, formatPrivateAmount } = usePrivacy();
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('1000');
  const [selectedTopUpWallet, setSelectedTopUpWallet] = useState(budget.sourceWalletId || '');
  const [isToppingUp, setIsToppingUp] = useState(false);

  const spent = budget.spentAmount ?? 0;
  const total = (budget.currentLoadedAmount ?? budget.initialLoadedAmount) ?? budget.amount;
  const remaining = budget.remainingAmount ?? Math.max(0, total - spent);
  const percent = budget.progressPercent ?? Math.round((spent / total) * 100);
  const isOver = budget.isOverBudget ?? spent > total;
  const isWarning = budget.isWarning ?? (percent >= (budget.alertThreshold ?? 80) && !isOver);

  const recurrenceBadges: Record<string, { label: string; color: string }> = {
    daily: { label: 'DAILY', color: '#FFE600' },
    weekly: { label: 'WEEKLY', color: '#00F0FF' },
    monthly: { label: 'MONTHLY', color: '#05DF72' },
    quarterly: { label: 'QUARTERLY', color: '#FF4D8D' },
    yearly: { label: 'YEARLY', color: '#9B51E0' },
    one_time: { label: 'ONE-TIME', color: '#FFE600' },
  };

  const badgeInfo = recurrenceBadges[budget.recurrence] || { label: budget.recurrence, color: '#FFE600' };

  const handleTopUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(topUpAmount);
    if (isNaN(val) || val < 1 || !onTopUp) return;
    try {
      setIsToppingUp(true);
      await onTopUp(budget._id, val, selectedTopUpWallet || undefined);
      setIsToppingUp(false);
      setIsTopUpOpen(false);
    } catch {
      setIsToppingUp(false);
    }
  };

  return (
    <div className="bg-white border-[3px] border-[#121212] shadow-neo p-4 sm:p-5 flex flex-col justify-between gap-4 transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-neo-lg">
      
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span
              className="neo-badge text-[10px]"
              style={{ backgroundColor: badgeInfo.color }}
            >
              {badgeInfo.label}
            </span>
            <span className="text-[11px] font-bold text-neutral-600 bg-neutral-100 px-2 py-0.5 border border-neutral-300">
              {budget.category}
            </span>
            {budget.sourceWalletName && (
              <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-[#E8F8F0] text-[#0B6B38] border border-[#05DF72] flex items-center gap-1">
                <Coins size={11} /> {budget.sourceWalletName}
              </span>
            )}
            {(budget.isLowAmount || budget.isLowPercent) && (
              <span className="text-[10px] font-black bg-[#FF4343] text-white px-1.5 py-0.5 border border-[#121212] flex items-center gap-1 shadow-neo-sm animate-pulse">
                <ShieldAlert size={11} /> LOW FUNDS
              </span>
            )}
          </div>
          <h4 className="text-base font-black uppercase text-[#121212] tracking-tight truncate">
            {budget.name}
          </h4>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setIsTopUpOpen((prev) => !prev)}
            className={`py-1 px-2 border-2 border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex items-center gap-1 text-[11px] font-black ${
              isTopUpOpen ? 'bg-[#FFE600] text-[#121212]' : 'bg-[#05DF72] hover:bg-[#04C966] text-[#121212]'
            }`}
            title="Reload Funds into this Wallet"
          >
            <PlusCircle size={13} strokeWidth={2.5} />
            <span>Reload</span>
          </button>
          <button
            onClick={() => onEdit(budget)}
            className="p-1.5 bg-white hover:bg-[#FFE600] border-2 border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            title="Edit Budget"
          >
            <Edit size={13} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete budget "${budget.name}"?`)) onDelete(budget._id);
            }}
            className="p-1.5 bg-white hover:bg-[#FF4343] hover:text-white border-2 border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            title="Delete Budget"
          >
            <Trash2 size={13} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Quick Reload Input with Wallet Deduction Option */}
      {isTopUpOpen && (
        <form onSubmit={handleTopUpSubmit} className="p-3.5 bg-[#FFFDF5] border-[3px] border-[#121212] shadow-neo flex flex-col gap-2.5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-1 border-b border-neutral-200">
            <span className="text-xs font-black uppercase text-[#121212] flex items-center gap-1">
              <PlusCircle size={13} className="text-[#05DF72]" strokeWidth={3} />
              Reload / Top-up Funds
            </span>
            <button
              type="button"
              onClick={() => setIsTopUpOpen(false)}
              className="text-xs font-black hover:bg-neutral-200 px-1.5 py-0.5 border border-transparent hover:border-[#121212] cursor-pointer"
              title="Close reload panel"
            >
              ✕
            </button>
          </div>

          {/* Amount Input */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase text-neutral-600">
              Amount to Load ({currencySymbol}) *
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-sm font-mono font-black text-neutral-500 pointer-events-none">
                {currencySymbol}
              </span>
              <input
                type="number"
                step="any"
                min="1"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                placeholder="Enter amount (e.g. 500)"
                className="w-full pl-8 pr-3 py-1.5 text-sm font-mono font-black bg-white border-2 border-[#121212] focus:outline-none focus:ring-1 focus:ring-[#121212]"
                required
              />
            </div>
          </div>

          {/* Quick Preset Amount Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black uppercase text-neutral-500">Quick:</span>
            {[100, 500, 1000, 2000, 5000].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setTopUpAmount(String(preset))}
                className="px-2 py-0.5 text-[10px] font-mono font-bold bg-white hover:bg-[#FFE600] text-[#121212] border border-[#121212] shadow-neo-sm active:translate-y-[1px] transition-colors cursor-pointer"
              >
                +{currencySymbol}{preset}
              </button>
            ))}
          </div>

          {/* Wallet Deduction Dropdown */}
          {wallets.length > 0 && (
            <div className="flex flex-col gap-1 pt-1">
              <label className="text-[10px] font-black uppercase text-neutral-600 flex items-center gap-1">
                <Coins size={11} /> Deduct From Account (Optional):
              </label>
              <select
                value={selectedTopUpWallet}
                onChange={(e) => setSelectedTopUpWallet(e.target.value)}
                className="p-1.5 text-xs font-bold bg-white border-2 border-[#121212] cursor-pointer"
              >
                <option value="">-- No wallet deduction (Direct reload) --</option>
                {wallets.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name} (Bal: {formatPrivateAmount(w.balance, currencySymbol)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={isToppingUp || !topUpAmount || parseFloat(topUpAmount) < 1}
              className="flex-1 py-1.5 px-3 bg-[#121212] text-white hover:bg-black disabled:opacity-50 text-xs font-black uppercase border-2 border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <PlusCircle size={13} strokeWidth={2.5} className="text-[#05DF72]" />
              <span>{isToppingUp ? 'Loading...' : `+ Load ${currencySymbol}${topUpAmount || '0'}`}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsTopUpOpen(false)}
              className="py-1.5 px-3 bg-white hover:bg-neutral-100 text-[#121212] text-xs font-black uppercase border-2 border-[#121212] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Spend Numbers */}
      <div className="flex items-baseline justify-between pt-1">
        <div>
          <span className="text-[10px] font-black uppercase text-neutral-500 block">
            {budget.recurrence === 'one_time' ? 'SPENT THIS MONTH' : 'SPENT THIS CYCLE'}
          </span>
          <span
            className={`text-xl font-mono font-black ${
              isOver ? 'text-[#FF4343]' : 'text-[#121212]'
            }`}
          >
            {formatPrivateAmount(spent, currencySymbol)}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-black uppercase text-neutral-500 block">
            LOADED POOL
          </span>
          <span className="text-base font-mono font-bold text-neutral-700">
            {formatPrivateAmount(total, currencySymbol)}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="flex flex-col gap-1.5">
        <NeoProgress value={spent} max={total} />
        <div className="flex items-center justify-between text-[11px] font-bold">
          <span className={isOver ? 'text-[#FF4343] font-black' : isWarning ? 'text-[#FF8800] font-black' : 'text-neutral-600'}>
            {isPrivacyMode ? '••' : `${percent}% used`}
          </span>
          <span className="font-mono text-neutral-600">
            {isOver ? (
              <span className="text-[#FF4343] font-black">
                Over by {formatPrivateAmount(spent - total, currencySymbol)}
              </span>
            ) : (
              <span>{formatPrivateAmount(remaining, currencySymbol)} remaining</span>
            )}
          </span>
        </div>
      </div>

      {/* Cycle Boundaries & Engine Info */}
      {budget.recurrence === 'one_time' ? (
        <div className="pt-3 border-t-2 border-neutral-100 flex items-center justify-between gap-1.5 flex-wrap text-[10px] font-mono font-bold text-neutral-600">
          <div className="flex items-center gap-1">
            <Clock size={12} className="text-neutral-500" />
            <span>
              {budget.activePeriod?.startDate} → {budget.activePeriod?.endDate}
            </span>
          </div>
          <div className="bg-[#FFE600] text-[#121212] px-2 py-0.5 border border-[#121212] font-black uppercase shadow-neo-sm">
            Auto-resets: {budget.activePeriod?.nextOccurrenceDate}
          </div>
        </div>
      ) : budget.activePeriod ? (
        <div className="pt-3 border-t-2 border-neutral-100 flex items-center justify-between gap-1.5 flex-wrap text-[10px] font-mono font-bold text-neutral-600">
          <div className="flex items-center gap-1">
            <Clock size={12} className="text-neutral-500" />
            <span>
              {budget.activePeriod.startDate} → {budget.activePeriod.endDate}
            </span>
          </div>
          <div className="bg-neutral-100 px-1.5 py-0.5 border border-neutral-300">
            Next: {budget.activePeriod.nextOccurrenceDate}
          </div>
        </div>
      ) : null}

      {isOver ? (
        <div className="bg-[#FF4343] text-white p-2.5 border-2 border-[#121212] shadow-neo-sm text-xs font-black flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle size={15} strokeWidth={3} className="shrink-0" />
            <span>Budget Exceeded by {formatPrivateAmount(spent - total, currencySymbol)}</span>
          </div>
          <button
            onClick={() => setIsTopUpOpen(true)}
            className="px-2.5 py-1 bg-[#121212] text-white text-[11px] font-black uppercase cursor-pointer hover:bg-neutral-900 border border-white/30 shrink-0"
          >
            + Add Money
          </button>
        </div>
      ) : budget.isLowAmount ? (
        <div className="bg-[#FF8800] text-[#121212] p-2.5 border-2 border-[#121212] shadow-neo-sm text-xs font-black flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle size={15} strokeWidth={3} className="shrink-0" />
            <span>
              {budget.alertTarget === 'wallet'
                ? `Alert: ${budget.sourceWalletName || 'Account'} balance below ${formatPrivateAmount(budget.lowBalanceThresholdAmount ?? 0, currencySymbol)}`
                : `Alert: Below ${formatPrivateAmount(budget.lowBalanceThresholdAmount ?? 0, currencySymbol)} (${formatPrivateAmount(remaining, currencySymbol)} left)`}
            </span>
          </div>
          <button
            onClick={() => setIsTopUpOpen(true)}
            className="px-2.5 py-1 bg-[#121212] text-white text-[11px] font-black uppercase cursor-pointer hover:bg-neutral-900 shrink-0"
          >
            + Add Money
          </button>
        </div>
      ) : budget.isLowPercent ? (
        <div className="bg-[#FF8800] text-[#121212] p-2.5 border-2 border-[#121212] shadow-neo-sm text-xs font-black flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle size={15} strokeWidth={3} className="shrink-0" />
            <span>Alert: Under {budget.lowBalanceThresholdPercent}% remaining ({formatPrivateAmount(remaining, currencySymbol)} left)</span>
          </div>
          <button
            onClick={() => setIsTopUpOpen(true)}
            className="px-2.5 py-1 bg-[#121212] text-white text-[11px] font-black uppercase cursor-pointer hover:bg-neutral-900 shrink-0"
          >
            + Add Money
          </button>
        </div>
      ) : isWarning ? (
        <div className="bg-[#FFE600] text-[#121212] p-2.5 border-2 border-[#121212] shadow-neo-sm text-xs font-black flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle size={15} strokeWidth={3} className="shrink-0" />
            <span>Alert Reached ({percent}% used)</span>
          </div>
          <button
            onClick={() => setIsTopUpOpen(true)}
            className="px-2.5 py-1 bg-[#121212] text-white text-[11px] font-black uppercase cursor-pointer hover:bg-neutral-900 shrink-0"
          >
            + Add Money
          </button>
        </div>
      ) : null}

    </div>
  );
};
