import React, { useState, useEffect } from 'react';
import { Investment, PortfolioSummary, AssetType } from '../../types';
import { usePrivacy } from '../../context/PrivacyContext';
import { NeoButton } from '../ui/NeoButton';
import { toast } from 'sonner';
import { AllocationChart } from './InvestmentChart';
import { ReturnsChart } from './InvestmentChart';
import { PortfolioTrendChart } from './InvestmentChart';
import { InvestmentCard } from './InvestmentCard';
import { useMutation, useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { fetchAmfiNav, fetchLiveStockPrice } from '../../utils/liveMarketService';
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Layers,
  Edit,
  Trash2,
  Calendar,
  Sparkles,
  PieChart,
  DollarSign,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  RefreshCw,
  UploadCloud,
  FileSpreadsheet,
  Target,
  Zap,
  BarChart3,
  Activity,
  Award,
  Shield,
  Clock,
  PiggyBank,
  Eye,
  EyeOff,
  Bell,
  Settings,
  Download,
  Filter,
  Search,
  Building2,
} from 'lucide-react';

interface InvestmentDashboardProps {
  investments: Investment[];
  portfolioSummary: PortfolioSummary | null;
  onOpenAddModal: (defaultType?: AssetType) => void;
  onOpenImportModal: () => void;
  onEdit: (inv: Investment) => void;
  onDelete: (id: string) => void;
  onQuickUpdateValue: (id: string, currentValue: number) => Promise<void>;
  currencySymbol?: string;
}

export const InvestmentDashboard: React.FC<InvestmentDashboardProps> = ({
  investments,
  portfolioSummary,
  onOpenAddModal,
  onOpenImportModal,
  onEdit,
  onDelete,
  onQuickUpdateValue,
  currencySymbol = '₹',
}) => {
  const { formatPrivateAmount, isPrivacyMode, togglePrivacyMode } = usePrivacy();
  
  const [selectedFilter, setSelectedFilter] = useState<'all' | AssetType>('all');
  const [selectedBrokerFilter, setSelectedBrokerFilter] = useState<string>('all');
  const [quickUpdateId, setQuickUpdateId] = useState<string | null>(null);
  const [quickValueInput, setQuickValueInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'value' | 'returns' | 'gainPercent'>('value');
  const [isSyncingNav, setIsSyncingNav] = useState(false);
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [marketIndices, setMarketIndices] = useState<
    { name: string; symbol: string; price: number; change: number; changePercent: number; isPositive: boolean }[]
  >([]);

  const batchUpdateLivePricesMutation = useMutation(api.investments.batchUpdateLivePrices);
  const autoClassifyCommoditiesMutation = useMutation(api.investments.autoClassifyCommodities);
  const autoDeduplicateHoldingsMutation = useMutation(api.investments.autoDeduplicateExistingHoldings);
  const syncLiveMarketPricesAction = useAction(api.investments.syncLiveMarketPrices);
  const getMarketIndicesAction = useAction(api.investments.getMarketIndices);

  const totalInvested = portfolioSummary?.totalInvested ?? 0;
  const totalCurrentValue = portfolioSummary?.totalCurrentValue ?? 0;
  const totalReturns = portfolioSummary?.totalReturnsAmount ?? 0;
  const totalReturnsPercent = portfolioSummary?.totalReturnsPercent ?? 0;
  const totalSip = portfolioSummary?.totalMonthlySip ?? 0;
  const totalHoldings = portfolioSummary?.totalHoldingsCount ?? investments.length;
  const isPositiveReturns = totalReturns >= 0;
  const portfolioGainPercent = totalCurrentValue > 0 ? Number(((totalReturns / totalInvested) * 100).toFixed(2)) : 0;

  // Distinct brokers present in portfolio
  const availableBrokers = Array.from(
    new Set(investments.map((i) => i.broker).filter(Boolean))
  ) as string[];

  const filteredInvestments = investments
    .filter((inv) => {
      const matchesFilter = selectedFilter === 'all' || inv.assetType === selectedFilter;
      const matchesBroker = selectedBrokerFilter === 'all' || inv.broker === selectedBrokerFilter;
      const matchesSearch =
        inv.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (inv.sector?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        (inv.subType?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        (inv.broker?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        (inv.notes?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
      return matchesFilter && matchesBroker && matchesSearch;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.name.localeCompare(b.name);
        case 'value': return b.currentValue - a.currentValue;
        case 'returns': return (b.currentValue - b.investedAmount) - (a.currentValue - a.investedAmount);
        case 'gainPercent': {
          const aPct = a.investedAmount > 0 ? ((a.currentValue - a.investedAmount) / a.investedAmount) * 100 : 0;
          const bPct = b.investedAmount > 0 ? ((b.currentValue - b.investedAmount) / b.investedAmount) * 100 : 0;
          return bPct - aPct;
        }
        default: return 0;
      }
    });

  const handleStartQuickUpdate = (inv: Investment) => {
    setQuickUpdateId(inv._id);
    setQuickValueInput(String(inv.currentValue));
  };

  const handleSaveQuickUpdate = async (id: string) => {
    const val = parseFloat(quickValueInput);
    if (isNaN(val) || val < 0) {
      toast.error('Invalid value');
      return;
    }
    await onQuickUpdateValue(id, val);
    setQuickUpdateId(null);
    toast.success('Value updated!');
  };

  // Real-time market valuation sync for both Mutual Funds & Stocks
  const handleSyncLiveMarket = async (silent = false) => {
    try {
      setIsSyncingNav(true);
      if (!silent) toast.info('Connecting to live market... Fetching real-time market prices');

      // 1. Fetch benchmark indices (NIFTY 50 & SENSEX)
      try {
        const indices = await getMarketIndicesAction({});
        if (indices && indices.length > 0) {
          setMarketIndices(indices);
        }
      } catch {}

      // 2. Call Convex backend action to sync holdings with live market
      let updatedCount = 0;
      try {
        const res = await syncLiveMarketPricesAction({});
        updatedCount = res.count || 0;
      } catch (actionErr) {
        console.warn('Backend sync action failed, falling back to client-side sync:', actionErr);
        // Client-side fallback sync
        const updates: { id: any; currentValue: number; currentPrice?: number }[] = [];
        for (const inv of investments) {
          let livePrice: number | null = null;
          if (inv.assetType === 'mutual_fund') {
            const live = await fetchAmfiNav(inv.name);
            if (live && live.nav > 0) {
              livePrice = live.nav;
            } else {
              const liveStock = await fetchLiveStockPrice(inv.name);
              if (liveStock && liveStock.price > 0) livePrice = liveStock.price;
            }
          } else {
            const live = await fetchLiveStockPrice(inv.name);
            if (live && live.price > 0) livePrice = live.price;
          }

          if (livePrice !== null && livePrice > 0) {
            let updatedVal = inv.currentValue;
            if (inv.units && inv.units > 0) {
              updatedVal = Math.round(inv.units * livePrice * 100) / 100;
            } else if (inv.investedAmount > 0 && inv.buyPrice && inv.buyPrice > 0) {
              const derived = inv.investedAmount / inv.buyPrice;
              updatedVal = Math.round(derived * livePrice * 100) / 100;
            } else if (inv.currentPrice && inv.currentPrice > 0 && inv.currentValue > 0) {
              const ratio = livePrice / inv.currentPrice;
              updatedVal = Math.round(inv.currentValue * ratio * 100) / 100;
            }
            updates.push({ id: inv._id as any, currentValue: updatedVal, currentPrice: livePrice });
          }
        }
        if (updates.length > 0) {
          await batchUpdateLivePricesMutation({ updates });
          updatedCount = updates.length;
        }
      }

      setLastSyncedAt(new Date());
      setIsSyncingNav(false);

      if (!silent) {
        if (updatedCount > 0) {
          toast.success(`Updated ${updatedCount} holdings in real time with market valuation!`);
        } else {
          toast.info('All holdings are up to date with live market value.');
        }
      }
    } catch (err: any) {
      setIsSyncingNav(false);
      if (!silent) toast.error('Sync failed: ' + (err?.message || 'Network error'));
    }
  };

  // Auto-sync real-time market movement on mount and every 45 seconds
  useEffect(() => {
    getMarketIndicesAction({})
      .then((res) => {
        if (res && res.length > 0) setMarketIndices(res);
      })
      .catch(() => {});

    // Automatically ensure commodity assets in database are properly categorized
    autoClassifyCommoditiesMutation().catch(() => {});
    autoDeduplicateHoldingsMutation().catch(() => {});

    if (investments.length > 0) {
      handleSyncLiveMarket(true);
    }

    if (!isAutoSyncEnabled) return;

    const timer = setInterval(() => {
      if (investments.length > 0) {
        handleSyncLiveMarket(true);
      }
    }, 45000);

    return () => clearInterval(timer);
  }, [isAutoSyncEnabled, investments.length, autoClassifyCommoditiesMutation, autoDeduplicateHoldingsMutation]);

  const ASSET_TABS: { label: string; value: 'all' | AssetType }[] = [
    { label: 'All', value: 'all' },
    { label: 'Mutual Funds', value: 'mutual_fund' },
    { label: 'Stocks', value: 'stocks' },
    { label: 'FD & RD', value: 'fd_rd' },
    { label: 'Gold & Silver', value: 'gold' },
    { label: 'Crypto', value: 'crypto' },
    { label: 'PPF & EPF', value: 'ppf_epf' },
    { label: 'Real Estate', value: 'real_estate' },
    { label: 'Other', value: 'other' },
  ];

  return (
    <div className="flex flex-col gap-5 w-full animate-in fade-in duration-150">
      {/* Hero Header */}
      <div className="bg-[#FFE600] p-4 sm:p-6 border-[3px] border-[#121212] shadow-neo relative overflow-hidden">
        <div className="absolute right-4 top-4 opacity-10 font-black text-9xl font-mono select-none hidden md:block">
          பணம்
        </div>

        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-[10px] font-mono font-black uppercase tracking-widest bg-[#121212] text-[#FFE600] px-2 py-0.5">
                  WEALTH & PORTFOLIO ENGINE
                </span>
                <span className="text-[10px] font-black bg-[#00F0FF] text-[#121212] px-2 py-0.5 border border-[#121212] flex items-center gap-1">
                  <Activity size={11} className="text-[#121212]" /> REAL-TIME VALUATION
                </span>
                {totalReturnsPercent >= 12 && (
                  <span className="text-[10px] font-black bg-[#05DF72] text-[#121212] px-2 py-0.5 border border-[#121212] flex items-center gap-1">
                    <Sparkles size={11} /> HIGH ALPHA
                  </span>
                )}
                <button
                  onClick={togglePrivacyMode}
                  className="p-1 bg-[#121212] text-[#FFE600] hover:bg-[#FFE600] hover:text-[#121212] border border-[#121212] transition-all cursor-pointer"
                  title={isPrivacyMode ? 'Show Balances' : 'Hide Balances'}
                >
                  {isPrivacyMode ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black uppercase text-[#121212] tracking-tight">
                INVESTMENT TRACKER
              </h2>
              <p className="text-xs font-bold text-neutral-800 mt-0.5">
                {totalHoldings} holdings · {currencySymbol}{isPrivacyMode ? '••••' : totalCurrentValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })} real market valuation
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <NeoButton
                variant="outline"
                size="md"
                onClick={() => handleSyncLiveMarket(false)}
                disabled={isSyncingNav}
                className="flex items-center justify-center gap-1.5 bg-[#00F0FF] hover:bg-[#38F4FF] text-[#121212] flex-1 sm:flex-initial"
              >
                <RefreshCw size={15} strokeWidth={2.5} className={isSyncingNav ? 'animate-spin' : ''} />
                <span>{isSyncingNav ? 'Syncing...' : 'Sync Market'}</span>
              </NeoButton>
              <NeoButton
                variant="outline"
                size="md"
                onClick={onOpenImportModal}
                title="Import Holdings (Ctrl+U)"
                className="flex items-center justify-center gap-1.5 bg-white flex-1 sm:flex-initial"
              >
                <UploadCloud size={16} strokeWidth={2.5} />
                <span>Import</span>
                <span className="hidden xl:inline text-[9px] font-mono px-1 py-0.2 bg-neutral-100 border border-neutral-300 text-neutral-600 rounded-none font-bold">
                  Ctrl+U
                </span>
              </NeoButton>
              <NeoButton variant="dark" size="md" onClick={() => onOpenAddModal()} className="flex items-center justify-center gap-1.5 flex-1 sm:flex-initial">
                <Plus size={16} strokeWidth={3} className="text-[#05DF72]" />
                <span>+ Add</span>
              </NeoButton>
            </div>
          </div>
        </div>
      </div>

      {/* Live Market Real-Time Movement Bar */}
      <div className="bg-[#121212] text-white p-3 border-[3px] border-[#121212] shadow-neo flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#05DF72]/20 border border-[#05DF72] text-[#05DF72] text-[11px] font-mono font-black uppercase shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#05DF72] animate-ping inline-block" />
            <span>LIVE MARKET</span>
          </div>

          {/* Real-time indices: NIFTY 50 & SENSEX */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full sm:w-auto py-0.5">
            {marketIndices.map((idx) => (
              <div key={idx.symbol} className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-700 px-2.5 py-1 text-xs font-mono shrink-0">
                <span className="font-bold text-neutral-400">{idx.name}:</span>
                <span className="font-black text-white">₹{idx.price.toLocaleString('en-IN')}</span>
                <span className={`text-[10px] font-black flex items-center ${idx.isPositive ? 'text-[#05DF72]' : 'text-[#FF4343]'}`}>
                  {idx.isPositive ? '+' : ''}{idx.change} ({idx.isPositive ? '+' : ''}{idx.changePercent}%)
                </span>
              </div>
            ))}
          </div>

          {marketIndices.length === 0 && (
            <div className="text-neutral-400 text-xs font-mono">
              Connecting to live market indices...
            </div>
          )}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2.5 text-xs font-mono w-full md:w-auto">
          {lastSyncedAt && (
            <span className="text-[10px] text-neutral-400">
              Synced: {lastSyncedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => setIsAutoSyncEnabled(!isAutoSyncEnabled)}
            className={`px-2 py-0.5 text-[10px] font-black uppercase border transition-all cursor-pointer ${
              isAutoSyncEnabled
                ? 'bg-[#05DF72] text-[#121212] border-[#05DF72]'
                : 'bg-neutral-800 text-neutral-400 border-neutral-700'
            }`}
            title="Toggle real-time auto sync every 45 seconds"
          >
            Auto: {isAutoSyncEnabled ? 'ON (45s)' : 'OFF'}
          </button>
          <button
            onClick={() => handleSyncLiveMarket(false)}
            disabled={isSyncingNav}
            className="px-2.5 py-1 bg-[#FFE600] hover:bg-[#FFD700] text-[#121212] font-black text-[11px] uppercase border border-[#121212] flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
            title="Fetch real-time quotes for all stocks and mutual funds"
          >
            <RefreshCw size={12} strokeWidth={3} className={isSyncingNav ? 'animate-spin' : ''} />
            <span>{isSyncingNav ? 'Syncing...' : 'Live Sync'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 bg-white border-[3px] border-[#121212] shadow-neo flex flex-col gap-1 hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-neo-lg transition-all">
          <span className="text-[10px] font-black uppercase text-neutral-500 flex items-center gap-1">
            <DollarSign size={12} /> PORTFOLIO VALUE
          </span>
          <span className="text-2xl font-mono font-black text-[#121212]">
            {isPrivacyMode ? '••••••' : formatPrivateAmount(totalCurrentValue, currencySymbol)}
          </span>
          <span className="text-[10px] font-bold text-neutral-500">{totalHoldings} holdings</span>
        </div>

        <div className="p-4 bg-white border-[3px] border-[#121212] shadow-neo flex flex-col gap-1 hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-neo-lg transition-all">
          <span className="text-[10px] font-black uppercase text-neutral-500 flex items-center gap-1">
            <Target size={12} /> TOTAL INVESTED
          </span>
          <span className="text-2xl font-mono font-black text-[#121212]">
            {isPrivacyMode ? '••••••' : formatPrivateAmount(totalInvested, currencySymbol)}
          </span>
          <span className="text-[10px] font-bold text-neutral-500">Principal basis</span>
        </div>

        <div className="p-4 bg-white border-[3px] border-[#121212] shadow-neo flex flex-col gap-1 hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-neo-lg transition-all">
          <span className="text-[10px] font-black uppercase text-neutral-500 flex items-center gap-1">
            <Sparkles size={12} /> TOTAL RETURNS
          </span>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-mono font-black ${isPositiveReturns ? 'text-[#05DF72]' : 'text-[#FF4343]'}`}>
              {isPositiveReturns ? '+' : ''}
              {isPrivacyMode ? '••••' : formatPrivateAmount(totalReturns, currencySymbol)}
            </span>
            <span className={`text-xs font-mono font-black px-1.5 py-0.5 border border-[#121212] ${
              isPositiveReturns ? 'bg-[#05DF72] text-[#121212]' : 'bg-[#FF4343] text-white'
            }`}>
              {isPositiveReturns ? '+' : ''}{portfolioGainPercent}%
            </span>
          </div>
          <span className="text-[10px] font-bold text-neutral-500">Unrealized growth</span>
        </div>

        <div className="p-4 bg-white border-[3px] border-[#121212] shadow-neo flex flex-col gap-1 hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-neo-lg transition-all">
          <span className="text-[10px] font-black uppercase text-neutral-500 flex items-center gap-1">
            <Clock size={12} /> MONTHLY SIPs
          </span>
          <span className="text-2xl font-mono font-black text-[#00F0FF]">
            {isPrivacyMode ? '••••' : formatPrivateAmount(totalSip, currencySymbol)}
            <span className="text-xs font-bold text-neutral-600">/mo</span>
          </span>
          <span className="text-[10px] font-bold text-neutral-500">Automated wealth</span>
        </div>
      </div>

      {/* Charts Row */}
      {portfolioSummary && portfolioSummary.assetBreakdown && portfolioSummary.assetBreakdown.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AllocationChart assetBreakdown={portfolioSummary.assetBreakdown} />
          {investments.length > 0 && (
            <PortfolioTrendChart
              investments={investments}
              portfolioSummary={portfolioSummary}
              currencySymbol={currencySymbol}
            />
          )}
        </div>
      )}

      {investments.length > 2 && (
        <ReturnsChart investments={investments} />
      )}

      {/* Controls Bar */}
      <div className="bg-white border-[3px] border-[#121212] shadow-neo p-3 sm:p-4 flex flex-col gap-3">
        {/* Top Tier: Search, Sort, Broker on Left; Holdings Count & Sync on Right */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            {/* Search */}
            <div className="relative w-full sm:w-60">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Search holdings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs font-bold bg-white border border-[#121212] w-full focus:outline-none focus:ring-1 focus:ring-[#121212]"
              />
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-2.5 py-1.5 text-xs font-black bg-white border border-[#121212] cursor-pointer"
            >
              <option value="value">Sort by Value</option>
              <option value="returns">Sort by Returns</option>
              <option value="gainPercent">Sort by Gain %</option>
              <option value="name">Sort by Name</option>
            </select>

            {/* Broker Filter */}
            {availableBrokers.length > 0 && (
              <div className="flex items-center gap-1">
                <Building2 size={13} className="text-neutral-500 hidden sm:inline" />
                <select
                  value={selectedBrokerFilter}
                  onChange={(e) => setSelectedBrokerFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-black bg-[#FFE600] border border-[#121212] cursor-pointer text-[#121212]"
                >
                  <option value="all">All Brokers ({availableBrokers.length})</option>
                  {availableBrokers.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Right side: Holdings Count and Live Sync */}
          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-100">
            <span className="text-[11px] font-mono font-black px-2 py-1 bg-neutral-100 border border-neutral-300 text-neutral-800 whitespace-nowrap shadow-neo-sm">
              {filteredInvestments.length} {filteredInvestments.length === 1 ? 'holding' : 'holdings'}
            </span>
            <button
              onClick={() => handleSyncLiveMarket(false)}
              disabled={isSyncingNav}
              className="p-1.5 bg-[#00F0FF] hover:bg-[#38F4FF] text-[#121212] border border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
              title="Sync Real Market NAVs & Prices"
            >
              <RefreshCw size={14} strokeWidth={2.5} className={isSyncingNav ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Bottom Tier: Filter Tabs cleanly spanning full width */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2 border-t border-neutral-200 w-full">
          {ASSET_TABS.map((tab) => {
            const count = tab.value === 'all'
              ? investments.length
              : investments.filter((i) => i.assetType === tab.value).length;
            return (
              <button
                key={tab.value}
                onClick={() => setSelectedFilter(tab.value)}
                className={`px-3 py-1.5 text-[11px] font-black uppercase border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
                  selectedFilter === tab.value
                    ? 'bg-[#121212] text-white border-[#121212] shadow-neo-sm'
                    : 'bg-white text-neutral-700 border-neutral-300 hover:border-[#121212]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    selectedFilter === tab.value
                      ? 'bg-[#FFE600] text-[#121212]'
                      : 'bg-neutral-100 text-neutral-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Holdings List */}
      {filteredInvestments.length === 0 ? (
        <div className="bg-white border-[3px] border-[#121212] shadow-neo p-12 text-center flex flex-col items-center gap-4">
          <div className="w-20 h-20 bg-[#FFE600] border-[3px] border-[#121212] shadow-neo flex items-center justify-center font-black">
            <Target size={36} />
          </div>
          <div>
            <h3 className="text-xl font-black uppercase text-[#121212]">
              {searchQuery ? 'No Matches Found' : 'No Investments Yet'}
            </h3>
            <p className="text-xs font-semibold text-neutral-600 mt-1 max-w-md">
              {searchQuery
                ? 'Try a different search term.'
                : 'Import your CAMS/KFintech CAS (PDF), Zerodha/Groww statement (Excel), or add assets manually!'}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2.5 mt-2">
            <NeoButton variant="outline" size="md" onClick={onOpenImportModal} className="flex items-center gap-1.5 bg-white">
              <UploadCloud size={16} strokeWidth={2.5} />
              <span>Import Statement</span>
            </NeoButton>
            <NeoButton variant="dark" size="md" onClick={() => onOpenAddModal()}>
              <Plus size={16} strokeWidth={3} className="text-[#05DF72]" />
              <span>Add Asset</span>
            </NeoButton>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredInvestments.map((inv) => (
            <InvestmentCard
              key={inv._id}
              inv={inv}
              currencySymbol={currencySymbol}
              onEdit={onEdit}
              onDelete={onDelete}
              onQuickUpdateValue={onQuickUpdateValue}
            />
          ))}
        </div>
      )}
    </div>
  );
};
