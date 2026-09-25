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
  Plus,
  Zap,
} from 'lucide-react';
import { usePrivacy } from '../../context/PrivacyContext';

interface InvestmentCardProps {
  inv: Investment;
  currencySymbol: string;
  onEdit: (inv: Investment) => void;
  onDelete: (id: string) => void;
  onQuickUpdateValue: (id: string, currentValue: number, currentPrice?: number) => Promise<void>;
  onTopUp?: (inv: Investment) => void;
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
  onTopUp,
}) => {
  const { formatPrivateAmount, isPrivacyMode } = usePrivacy();
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMode, setUpdateMode] = useState<'nav' | 'value'>('nav');
  const [updateValue, setUpdateValue] = useState(String(inv.currentValue));
  const [updateNav, setUpdateNav] = useState(
    inv.currentPrice ? String(inv.currentPrice) : inv.units && inv.units > 0 ? String(Math.round((inv.currentValue / inv.units) * 10000) / 10000) : ''
  );

  const badgeInfo = ASSET_COLORS[inv.assetType] || { label: inv.assetType, color: '#FFE600' };
  const invested = typeof inv.investedAmount === 'number' && !isNaN(inv.investedAmount) ? inv.investedAmount : 0;
  const currentVal = typeof inv.currentValue === 'number' && !isNaN(inv.currentValue) ? inv.currentValue : 0;
  const gain = currentVal - invested;
  const gainPercent = invested > 0 ? Number(((gain / invested) * 100).toFixed(2)) : 0;
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
      const navVal = parseFloat(updateNav);
      if (!isNaN(val) && val >= 0) {
        await onQuickUpdateValue(inv._id, val, !isNaN(navVal) && navVal > 0 ? navVal : undefined);
      }
      setIsUpdating(false);
    } else {
      setUpdateValue(String(inv.currentValue));
      if (effectivePrice) setUpdateNav(String(effectivePrice));
      setUpdateMode('nav');
      setIsUpdating(true);
    }
  };

  const handleNavInputChange = (newNavStr: string) => {
    setUpdateNav(newNavStr);
    const n = parseFloat(newNavStr);
    if (!isNaN(n) && n > 0 && inv.units && inv.units > 0) {
      const computedVal = Math.round(inv.units * n * 100) / 100;
      setUpdateValue(String(computedVal));
    }
  };

  const handleValueInputChange = (newValStr: string) => {
    setUpdateValue(newValStr);
    const v = parseFloat(newValStr);
    if (!isNaN(v) && v > 0 && inv.units && inv.units > 0) {
      const computedNav = Math.round((v / inv.units) * 10000) / 10000;
      setUpdateNav(String(computedNav));
    }
  };

  return (
    <div className="bg-white border-[3px] border-[#121212] shadow-neo p-4 sm:p-5 flex flex-col justify-between gap-3 hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-neo-lg transition-all cursor-default">
      {/* Header: Type & Broker Badges on Left, Actions on Right */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <NeoBadge variant="yellow" className="text-[10px] uppercase font-black" style={{ backgroundColor: badgeInfo.color }}>
            {inv.subType || badgeInfo.label}
          </NeoBadge>
          {inv.broker && (
            <span className="text-[9px] font-black uppercase bg-[#FFE600] text-[#121212] px-1.5 py-0.5 border border-[#121212]">
              {inv.broker}
            </span>
          )}
          {inv.sector && (
            <span className="text-[9px] font-black uppercase bg-neutral-100 text-neutral-800 px-1.5 py-0.5 border border-neutral-300">
              {inv.sector}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onTopUp && (
            <button
              onClick={() => onTopUp(inv)}
              className="p-1.5 bg-[#05DF72] hover:bg-[#04c463] text-[#121212] border border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer font-black"
              title="Add More / Top Up this Holding"
            >
              <Plus size={13} strokeWidth={3} />
            </button>
          )}
          <button
            onClick={handleUpdate}
            className="p-1.5 bg-[#FFE600] hover:bg-[#FFD700] text-[#121212] border border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            title="Edit NAV / Live Price & Value"
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

      {/* Asset Name & Details */}
      <div className="flex flex-col gap-1.5">
        <h4 className="text-base font-black uppercase text-[#121212] tracking-tight leading-snug line-clamp-2" title={inv.name}>
          {inv.name}
        </h4>
        {inv.notes && (
          <p className="text-[11px] font-medium text-neutral-500 truncate">{inv.notes}</p>
        )}

        {/* Metrics Row: Units, CP / NAV, SIP */}
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {inv.schemeCode ? (
            <span className="text-[10px] font-mono font-bold bg-[#00F0FF]/15 text-[#006070] px-1.5 py-0.5 border border-[#00F0FF] shadow-neo-sm flex items-center gap-1" title={`AMFI Scheme Code: ${inv.schemeCode}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#00A0B0] inline-block" />
              AMFI: {inv.schemeCode}
            </span>
          ) : inv.ticker ? (
            <span className="text-[10px] font-mono font-bold bg-[#FFE600]/20 text-[#604B00] px-1.5 py-0.5 border border-[#FFE600] shadow-neo-sm flex items-center gap-1" title={`Ticker: ${inv.ticker}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#E5C100] inline-block" />
              {inv.ticker}
            </span>
          ) : inv.isin ? (
            <span className="text-[10px] font-mono font-bold bg-neutral-100 text-neutral-600 px-1.5 py-0.5 border border-neutral-300 shadow-neo-sm" title={`ISIN: ${inv.isin}`}>
              ISIN: {inv.isin}
            </span>
          ) : null}
          {inv.units && (
            <span className="text-[10px] font-mono font-bold bg-white text-neutral-800 px-1.5 py-0.5 border border-[#121212] shadow-neo-sm">
              {inv.units} units
            </span>
          )}
          {effectivePrice ? (
            <button
              type="button"
              onClick={() => {
                setUpdateNav(String(effectivePrice));
                setUpdateValue(String(inv.currentValue));
                setUpdateMode('nav');
                setIsUpdating(true);
              }}
              className="text-[10px] font-mono font-bold bg-[#E8F8F0] hover:bg-[#d0fae2] text-[#0B6B38] px-1.5 py-0.5 border border-[#05DF72] flex items-center gap-1 shadow-neo-sm cursor-pointer transition-all"
              title="Click to edit NAV / Market Price directly"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#05DF72] inline-block animate-pulse" />
              <span>
                {inv.assetType === 'mutual_fund' ? 'NAV' : 'CP'}: {isPrivacyMode ? '••••' : `${currencySymbol}${effectivePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: inv.assetType === 'mutual_fund' ? 4 : 2 })}`}
              </span>
              <Edit size={10} className="ml-0.5 opacity-60 hover:opacity-100" />
            </button>
          ) : (inv.assetType === 'mutual_fund' || inv.assetType === 'stocks' || inv.assetType === 'crypto' || inv.assetType === 'gold') ? (
            <button
              type="button"
              onClick={() => {
                setUpdateNav('');
                setUpdateValue(String(inv.currentValue));
                setUpdateMode('nav');
                setIsUpdating(true);
              }}
              className="text-[10px] font-mono font-bold bg-neutral-100 hover:bg-[#FFE600] text-neutral-700 hover:text-[#121212] px-1.5 py-0.5 border border-[#121212] flex items-center gap-1 shadow-neo-sm cursor-pointer transition-all"
              title={`Set ${inv.assetType === 'mutual_fund' ? 'NAV' : 'Market Price'}`}
            >
              <Plus size={10} strokeWidth={3} />
              <span>Set {inv.assetType === 'mutual_fund' ? 'NAV' : 'CP'}</span>
            </button>
          ) : null}
          {inv.sipAmount && (
            <span className="text-[10px] font-mono font-bold bg-[#121212] text-[#00F0FF] px-1.5 py-0.5 border border-[#121212]">
              SIP: {formatPrivateAmount(inv.sipAmount, currencySymbol)}/mo
            </span>
          )}
        </div>
      </div>

      {/* Quick Update NAV & Valuation Bar */}
      {isUpdating && (
        <div className="p-2.5 bg-[#FFE600] border-2 border-[#121212] shadow-neo-sm flex flex-col gap-2 animate-in fade-in">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setUpdateMode('nav')}
                className={`px-2 py-0.5 text-[10px] font-black uppercase border border-[#121212] ${
                  updateMode === 'nav' ? 'bg-[#121212] text-white' : 'bg-white text-neutral-800'
                }`}
              >
                Edit NAV / Price
              </button>
              <button
                type="button"
                onClick={() => setUpdateMode('value')}
                className={`px-2 py-0.5 text-[10px] font-black uppercase border border-[#121212] ${
                  updateMode === 'value' ? 'bg-[#121212] text-white' : 'bg-white text-neutral-800'
                }`}
              >
                Edit Current Value
              </button>
            </div>
            <button
              onClick={() => setIsUpdating(false)}
              className="p-0.5 text-xs font-black text-[#121212] hover:bg-neutral-200 cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="flex items-center gap-2">
            {updateMode === 'nav' ? (
              <div className="relative flex-1">
                <span className="absolute left-2 top-1.5 text-xs font-mono font-bold text-neutral-600">NAV {currencySymbol}</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={updateNav}
                  onChange={(e) => handleNavInputChange(e.target.value)}
                  placeholder="Enter new NAV..."
                  className="w-full pl-16 pr-2 py-1 text-xs font-mono font-bold bg-white border border-[#121212]"
                  autoFocus
                />
              </div>
            ) : (
              <div className="relative flex-1">
                <span className="absolute left-2 top-1.5 text-xs font-mono font-bold text-neutral-600">{currencySymbol}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={updateValue}
                  onChange={(e) => handleValueInputChange(e.target.value)}
                  placeholder="Enter current value..."
                  className="w-full pl-6 pr-2 py-1 text-xs font-mono font-bold bg-white border border-[#121212]"
                  autoFocus
                />
              </div>
            )}

            <button
              onClick={handleUpdate}
              className="px-3 py-1 bg-[#121212] text-white hover:bg-black text-xs font-black uppercase cursor-pointer"
            >
              Save
            </button>
          </div>

          {inv.units && inv.units > 0 && (
            <span className="text-[10px] font-mono text-neutral-800 font-bold">
              {updateMode === 'nav'
                ? `Calculated Value: ${currencySymbol}${updateValue} (${inv.units} units × ${currencySymbol}${updateNav})`
                : `Calculated NAV: ${currencySymbol}${updateNav}`}
            </span>
          )}
        </div>
      )}

      {/* Valuation Grid */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-neutral-200">
        <div>
          <span className="text-[10px] font-black uppercase text-neutral-500 block">INVESTED BASIS</span>
          <span className="text-base font-mono font-bold text-[#121212]">
            {formatPrivateAmount(invested, currencySymbol)}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-black uppercase text-neutral-500 block">CURRENT VALUE</span>
          <span className="text-lg font-mono font-bold text-[#121212]">
            {formatPrivateAmount(currentVal, currencySymbol)}
          </span>
        </div>
      </div>

      {/* Returns Banner */}
      <div
        className={`p-2 sm:p-2.5 border-2 border-[#121212] shadow-neo-sm flex flex-wrap items-center justify-between gap-1.5 text-xs font-mono font-black ${
          isGain ? 'bg-[#05DF72] text-[#121212]' : 'bg-[#FF4343] text-white'
        }`}
      >
        <div className="flex items-center gap-1 min-w-0">
          {isGain ? <ArrowUpRight size={15} strokeWidth={3} className="shrink-0" /> : <ArrowDownLeft size={15} strokeWidth={3} className="shrink-0" />}
          <span className="truncate">{isGain ? '+' : ''}{formatPrivateAmount(gain, currencySymbol)} ({isGain ? '+' : ''}{gainPercent}%)</span>
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
