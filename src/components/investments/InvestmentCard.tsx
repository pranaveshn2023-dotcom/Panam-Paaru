import React, { useState } from 'react';
import { Investment, AssetType } from '../../types';
import { NeoButton } from '../ui/NeoButton';
import { NeoBadge } from '../ui/NeoBadge';
import {
  TrendingUp,
  TrendingDown,
  Edit,
  Trash2,
  RefreshCw,
  Calendar,
  Layers,
  Eye,
  EyeOff,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { usePrivacy } from '../../context/PrivacyContext';

interface InvestmentCardProps {
  inv: Investment;
  currencySymbol: string;
  onEdit: (inv: Investment) => void;
  onDelete: (id: string) => void;
  onQuickUpdateValue: (id: string, currentValue: number) => Promise<void>;
}

const ASSET_COLORS: Record<string, { label: string; color: string }> = {
  mutual_fund: { label: 'MUTUAL FUNDS', color: '#00F0FF' },
  stocks: { label: 'STOCKS', color: '#FFE600' },
  fd_rd: { label: 'FD & RD', color: '#05DF72' },
  gold: { label: 'GOLD & SILVER', color: '#FFD700' },
  crypto: { label: 'CRYPTO', color: '#9B51E0' },
  ppf_epf: { label: 'PPF & EPF', color: '#FF8800' },
  real_estate: { label: 'REAL ESTATE', color: '#FF4D8D' },
  other: { label: 'OTHER', color: '#A0AEC0' },
};

export const InvestmentCard: React.FC<InvestmentCardProps> = ({
  inv,
  currencySymbol,
  onEdit,
  onDelete,
  onQuickUpdateValue,
}) => {
  const { formatPrivateAmount, isPrivacyMode } = usePrivacy();
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateValue, setUpdateValue] = useState(String(inv.currentValue));

  const badgeInfo = ASSET_COLORS[inv.assetType] || { label: inv.assetType, color: '#FFE600' };
  const gain = inv.currentValue - inv.investedAmount;
  const gainPercent = inv.investedAmount > 0 ? Number(((gain / inv.investedAmount) * 100).toFixed(2)) : 0;
  const isGain = gain >= 0;

  const effectivePrice =
    inv.currentPrice && inv.currentPrice > 0
      ? inv.currentPrice
      : inv.units && inv.units > 0 && inv.currentValue > 0
      ? inv.currentValue / inv.units
      : undefined;

  const handleUpdate = async () => {
    if (isUpdating) {
      const val = parseFloat(updateValue);
      if (!isNaN(val) && val >= 0) {
        await onQuickUpdateValue(inv._id, val);
      }
      setIsUpdating(false);
    } else {
      setUpdateValue(String(inv.currentValue));
      setIsUpdating(true);
    }
  };

  return (
    <div className="bg-white border-[3px] border-[#121212] shadow-neo p-4 sm:p-5 flex flex-col justify-between gap-3 hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-neo-lg transition-all cursor-default">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <NeoBadge variant="yellow" className="text-[10px] uppercase font-black" style={{ backgroundColor: badgeInfo.color }}>
              {inv.subType || badgeInfo.label}
            </NeoBadge>
            {inv.sector && (
              <span className="text-[9px] font-black uppercase bg-neutral-100 text-neutral-800 px-1.5 py-0.5 border border-neutral-300">
                {inv.sector}
              </span>
            )}
            {inv.broker && (
              <span className="text-[9px] font-black uppercase bg-[#FFE600] text-[#121212] px-1.5 py-0.5 border border-[#121212]">
                {inv.broker}
              </span>
            )}
            {inv.sipAmount && (
              <span className="text-[9px] font-mono font-bold bg-[#121212] text-[#00F0FF] px-1.5 py-0.5">
                SIP: {formatPrivateAmount(inv.sipAmount, currencySymbol)}/mo
              </span>
            )}
            {inv.units && (
              <span className="text-[9px] font-mono font-bold bg-white text-neutral-700 px-1.5 py-0.5 border border-[#121212]">
                {inv.units} units
              </span>
            )}
            {effectivePrice && (
              <span className="text-[9px] font-mono font-bold bg-[#E8F8F0] text-[#0B6B38] px-1.5 py-0.5 border border-[#05DF72] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#05DF72] inline-block animate-pulse" />
                <span>
                  {inv.assetType === 'stocks' ? 'LTP' : inv.assetType === 'mutual_fund' ? 'NAV' : 'PRICE'}: {isPrivacyMode ? '••••' : `${currencySymbol}${effectivePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </span>
              </span>
            )}
            {inv.xirr && (
              <span className="text-[9px] font-mono font-bold bg-[#FFFDF5] text-[#121212] px-1.5 py-0.5 border border-[#121212]">
                XIRR: {inv.xirr}
              </span>
            )}
          </div>
          <h4 className="text-base font-black uppercase text-[#121212] tracking-tight truncate">
            {inv.name}
          </h4>
          {inv.notes && (
            <p className="text-[11px] font-medium text-neutral-500 mt-0.5 truncate">{inv.notes}</p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleUpdate}
            className="p-1.5 bg-[#FFE600] hover:bg-[#FFD700] text-[#121212] border border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            title="Quick Update Value"
          >
            {isUpdating ? <RefreshCw size={13} strokeWidth={2.5} className="animate-spin" /> : <TrendingUp size={13} strokeWidth={2.5} />}
          </button>
          <button
            onClick={() => onEdit(inv)}
            className="p-1.5 bg-white hover:bg-[#FFE600] border border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            title="Edit Asset"
          >
            <Edit size={13} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete "${inv.name}"?`)) onDelete(inv._id);
            }}
            className="p-1.5 bg-white hover:bg-[#FF4343] hover:text-white border border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            title="Delete Asset"
          >
            <Trash2 size={13} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Quick Update Input */}
      {isUpdating && (
        <div className="p-2.5 bg-[#FFE600] border-2 border-[#121212] shadow-neo-sm flex items-center gap-2 animate-in fade-in">
          <span className="text-xs font-black uppercase text-[#121212] shrink-0">New Value:</span>
          <div className="relative flex-1">
            <span className="absolute left-2 top-1.5 text-xs font-mono font-bold text-neutral-600">{currencySymbol}</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={updateValue}
              onChange={(e) => setUpdateValue(e.target.value)}
              className="w-full pl-6 pr-2 py-1 text-xs font-mono font-bold bg-white border border-[#121212]"
              autoFocus
            />
          </div>
          <button
            onClick={handleUpdate}
            className="px-2.5 py-1 bg-[#121212] text-white hover:bg-black text-xs font-black uppercase cursor-pointer"
          >
            Save
          </button>
          <button
            onClick={() => setIsUpdating(false)}
            className="px-1.5 py-1 text-xs font-bold text-[#121212] cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Valuation Grid */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-neutral-200">
        <div>
          <span className="text-[10px] font-black uppercase text-neutral-500 block">INVESTED BASIS</span>
          <span className="text-base font-mono font-bold text-[#121212]">
            {formatPrivateAmount(inv.investedAmount, currencySymbol)}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-black uppercase text-neutral-500 block">CURRENT VALUE</span>
          <span className="text-lg font-mono font-bold text-[#121212]">
            {formatPrivateAmount(inv.currentValue, currencySymbol)}
          </span>
        </div>
      </div>

      {/* Returns Banner */}
      <div
        className={`p-2.5 border-2 border-[#121212] shadow-neo-sm flex items-center justify-between text-xs font-mono font-black ${
          isGain ? 'bg-[#05DF72] text-[#121212]' : 'bg-[#FF4343] text-white'
        }`}
      >
        <div className="flex items-center gap-1">
          {isGain ? <ArrowUpRight size={15} strokeWidth={3} /> : <ArrowDownLeft size={15} strokeWidth={3} />}
          <span>{isGain ? '+' : ''}{formatPrivateAmount(gain, currencySymbol)} ({isGain ? '+' : ''}{gainPercent}%)</span>
        </div>
        {inv.xirr ? (
          <span className="bg-[#121212] text-[#05DF72] px-1.5 py-0.5 text-[10px] font-black tracking-wide border border-[#121212] shrink-0">
            XIRR: {inv.xirr}
          </span>
        ) : (
          <span className="text-[10px] uppercase font-black opacity-80">P&L</span>
        )}
      </div>
    </div>
  );
};
