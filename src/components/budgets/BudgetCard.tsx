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
  };

  const badgeInfo = recurrenceBadges[budget.recurrence] || { label: budget.recurrence, color: '#FFE600' };

  const handleTopUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(topUpAmount);
    if (isNaN(val) || val <= 0 || !onTopUp) return;
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
        <div>
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
          <h4 className="text-base font-black uppercase text-[#121212] tracking-tight">
            {budget.name}
          </h4>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setIsTopUpOpen((prev) => !prev)}
            className="p-1.5 bg-[#05DF72] hover:bg-[#04C966] text-[#121212] border border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex items-center gap-1 text-[11px] font-black"
            title="Reload Funds into this Pocket"
          >
            <PlusCircle size={13} strokeWidth={2.5} />
            <span className="hidden sm:inline">Reload</span>
          </button>
          <button
            onClick={() => onEdit(budget)}
            className="p-1.5 bg-white hover:bg-[#FFE600] border border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            title="Edit Budget"
          >
            <Edit size={13} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete budget "${budget.name}"?`)) onDelete(budget._id);
            }}
            className="p-1.5 bg-white hover:bg-[#FF4343] hover:text-white border border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            title="Delete Budget"
          >
            <Trash2 size={13} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Quick Reload Input with Wallet Deduction Option */}
      {isTopUpOpen && (
        <form onSubmit={handleTopUpSubmit} className="p-3 bg-[#FFE600] border-2 border-[#121212] shadow-neo-sm flex flex-col sm:flex-row items-stretch sm:items-center gap-2 animate-in fade-in">
          <span className="text-xs font-black uppercase text-[#121212] shrink-0">Reload:</span>
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1.5 text-xs font-mono font-bold text-neutral-600">{currencySymbol}</span>
            <input
              type="number"
              step="100"
              min="1"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              className="w-full pl-6 pr-2 py-1 text-xs font-mono font-bold bg-white border border-[#121212]"
              required
            />
          </div>
          {wallets.length > 0 && (
            <select
              value={selectedTopUpWallet}
              onChange={(e) => setSelectedTopUpWallet(e.target.value)}
              className="p-1 text-xs font-black bg-white border border-[#121212]"
            >
              <option value="">-- No wallet deduction --</option>
              {wallets.map((w) => (
                <option key={w._id} value={w._id}>
                  From: {w.name} ({currencySymbol}{w.balance.toLocaleString('en-IN')})
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="submit"
              disabled={isToppingUp}
              className="px-3 py-1 bg-[#121212] text-white hover:bg-black text-xs font-black uppercase cursor-pointer"
            >
              {isToppingUp ? '...' : '+ Load'}
            </button>
            <button
              type="button"
              onClick={() => setIsTopUpOpen(false)}
              className="px-2 py-1 text-xs font-bold text-[#121212] cursor-pointer"
            >
              ✕
            </button>
          </div>
        </form>
      )}

      {/* Spend Numbers */}
      <div className="flex items-baseline justify-between pt-1">
        <div>
          <span className="text-[10px] font-black uppercase text-neutral-500 block">
            SPENT THIS CYCLE
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
      {budget.activePeriod && (
        <div className="pt-3 border-t-2 border-neutral-100 flex items-center justify-between text-[10px] font-mono font-bold text-neutral-600">
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
      )}

      {/* Warning Pill if Near/Over Limit */}
      {isOver ? (
        <div className="bg-[#FF4343] text-white p-2 border-2 border-[#121212] shadow-neo-sm text-xs font-black flex items-center gap-1.5">
          <AlertTriangle size={15} strokeWidth={3} className="shrink-0" />
          <span>BUDGET EXCEEDED BY {formatPrivateAmount(spent - total, currencySymbol)}</span>
        </div>
      ) : (budget.isLowAmount || budget.isLowPercent) ? (
        <div className="bg-[#FF8800] text-[#121212] p-2 border-2 border-[#121212] shadow-neo-sm text-xs font-black flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={15} strokeWidth={3} className="shrink-0" />
            <span>Low Balance Alert ({formatPrivateAmount(remaining, currencySymbol)} remaining)</span>
          </div>
          <button
            onClick={() => setIsTopUpOpen(true)}
            className="px-2 py-0.5 bg-[#121212] text-white text-[10px] font-mono uppercase cursor-pointer"
          >
            + Top-up
          </button>
        </div>
      ) : isWarning ? (
        <div className="bg-[#FFE600] text-[#121212] p-2 border-2 border-[#121212] shadow-neo-sm text-xs font-black flex items-center gap-1.5">
          <AlertTriangle size={15} strokeWidth={3} className="shrink-0" />
          <span>Approaching Limit ({percent}% used)</span>
        </div>
      ) : null}

    </div>
  );
};
