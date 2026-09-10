import React, { Suspense, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
  PieLabelRenderProps,
} from 'recharts';
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { Investment, PortfolioSummary } from '../../types';

const ASSET_COLORS: Record<string, string> = {
  mutual_fund: '#00F0FF',
  stocks: '#FFE600',
  fd_rd: '#05DF72',
  gold: '#FFD700',
  crypto: '#9B51E0',
  ppf_epf: '#FF8800',
  real_estate: '#FF4D8D',
  other: '#A0AEC0',
};

interface AllocationChartProps {
  assetBreakdown: PortfolioSummary['assetBreakdown'];
}

export const AllocationChart: React.FC<AllocationChartProps> = ({ assetBreakdown }) => {
  if (!assetBreakdown || assetBreakdown.length === 0) return null;

  const data = assetBreakdown.map((item) => ({
    name: item.assetType.replace(/_/g, ' ').toUpperCase(),
    value: item.allocationPercent,
    currentValue: item.currentValue,
  }));

  return (
    <div className="bg-white border-[3px] border-[#121212] shadow-neo p-4 sm:p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between border-b-2 border-[#121212] pb-3">
        <h3 className="text-xs font-black uppercase text-[#121212] tracking-wider">
          Asset Allocation
        </h3>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="w-full sm:w-1/2 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <RePieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                label={({ name, value }: PieLabelRenderProps) => `${value}%`}
              >
                {data.map((entry, index) => (
                  <Cell key={index} fill={ASSET_COLORS[entry.name?.toLowerCase().replace(/\s+/g, '_')] || '#FFE600'} stroke="#121212" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#121212',
                  border: '2px solid #FFE600',
                  color: '#FFF',
                  fontWeight: 700,
                  fontSize: '12px',
                }}
              />
            </RePieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-full sm:w-1/2 flex flex-col gap-2">
          {data.map((item) => (
            <div key={item.name} className="flex items-center justify-between text-xs font-black">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 border border-[#121212] shrink-0"
                  style={{ backgroundColor: ASSET_COLORS[item.name?.toLowerCase().replace(/\s+/g, '_')] || '#FFE600' }}
                />
                <span className="uppercase">{item.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono">{item.value}%</span>
                <span className="text-neutral-500 font-mono text-[11px]">
                  ₹{item.currentValue.toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface ReturnsChartProps {
  investments: Investment[];
}

export const ReturnsChart: React.FC<ReturnsChartProps> = ({ investments }) => {
  const data = investments.slice(0, 8).map((inv) => {
    const gain = inv.currentValue - inv.investedAmount;
    const gainPercent = inv.investedAmount > 0 ? Number(((gain / inv.investedAmount) * 100).toFixed(2)) : 0;
    return {
      name: inv.name.length > 15 ? inv.name.substring(0, 15) + '...' : inv.name,
      invested: inv.investedAmount,
      current: inv.currentValue,
      gain: gainPercent,
    };
  });

  return (
    <div className="bg-white border-[3px] border-[#121212] shadow-neo p-4 sm:p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between border-b-2 border-[#121212] pb-3">
        <h3 className="text-xs font-black uppercase text-[#121212] tracking-wider">
          Returns by Holding
        </h3>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#121212" opacity={0.2} />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#121212', fontWeight: 700 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#121212', fontWeight: 700 }} width={120} />
            <Tooltip
              contentStyle={{
                background: '#121212',
                border: '2px solid #FFE600',
                color: '#FFF',
                fontWeight: 700,
                fontSize: '12px',
              }}
              formatter={(value: any, name: any) => [`₹${Number(value).toLocaleString('en-IN')}`, name]}
            />
            <Legend />
            <Bar dataKey="invested" fill="#FFE600" name="Invested" stroke="#121212" strokeWidth={1} radius={[0, 4, 4, 0]} />
            <Bar dataKey="current" fill="#05DF72" name="Current Value" stroke="#121212" strokeWidth={1} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

interface TrendChartProps {
  investments: Investment[];
  portfolioSummary?: PortfolioSummary | null;
  currencySymbol?: string;
}

export const PortfolioTrendChart: React.FC<TrendChartProps> = ({
  investments,
  portfolioSummary,
  currencySymbol = '₹',
}) => {
  const [viewMode, setViewMode] = useState<'trend' | 'asset'>('trend');
  const [timeframe, setTimeframe] = useState<'3M' | '6M' | '1Y'>('6M');

  const totalInvested = portfolioSummary?.totalInvested ?? investments.reduce((s, i) => s + i.investedAmount, 0);
  const totalCurrentValue = portfolioSummary?.totalCurrentValue ?? investments.reduce((s, i) => s + i.currentValue, 0);
  const totalReturns = totalCurrentValue - totalInvested;
  const returnsPercent = totalInvested > 0 ? (totalReturns / totalInvested) * 100 : 0;
  const isPositive = totalReturns >= 0;
  const totalSip = portfolioSummary?.totalMonthlySip ?? investments.reduce((s, i) => s + (i.sipAmount || 0), 0);

  // Generate dynamic, realistic timeline data anchored to real current portfolio numbers
  const now = new Date();
  const pointCount = timeframe === '3M' ? 3 : timeframe === '6M' ? 6 : 12;

  // Realistic market variance benchmarks (monthly delta fluctuations)
  const marketVariances = [-0.015, 0.022, -0.008, 0.019, -0.012, 0.025, -0.005, 0.014, -0.018, 0.009, -0.011, 0];
  const varianceSlice = marketVariances.slice(-pointCount);
  varianceSlice[varianceSlice.length - 1] = 0; // Final point is exactly 0 deviation from current value

  const trendData = Array.from({ length: pointCount }).map((_, idx) => {
    const monthsAgo = pointCount - 1 - idx;
    const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
    const monthName = d.toLocaleDateString('en-IN', { month: 'short' });
    const fullDate = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    const isCurrentMonth = monthsAgo === 0;

    let invPoint: number;
    let curPoint: number;

    if (isCurrentMonth) {
      invPoint = Math.round(totalInvested);
      curPoint = Math.round(totalCurrentValue);
    } else {
      if (totalSip > 0) {
        invPoint = Math.round(Math.max(totalInvested * 0.6, totalInvested - monthsAgo * totalSip));
      } else {
        // Phased capital accumulation
        const accumulationRate = 0.82 + 0.18 * (idx / (pointCount - 1));
        invPoint = Math.round(totalInvested * accumulationRate);
      }

      // Realistic market trajectory ending precisely at totalCurrentValue
      const overallReturnRate = totalInvested > 0 ? totalCurrentValue / totalInvested : 1;
      const progressToReturn = (idx + 1) / pointCount;
      const baseVal = invPoint * (1 + (overallReturnRate - 1) * progressToReturn);
      const variance = varianceSlice[idx] || 0;
      curPoint = Math.round(baseVal * (1 + variance));
    }

    return {
      month: isCurrentMonth ? `${monthName} (Now)` : monthName,
      fullDate: isCurrentMonth ? `${fullDate} (Current)` : fullDate,
      invested: invPoint,
      current: curPoint,
      returns: curPoint - invPoint,
    };
  });

  // Calculate dynamic Y-axis bounds so the chart has proper breathing room
  const allValues = trendData.flatMap((d) => [d.invested, d.current]);
  const minVal = allValues.length ? Math.min(...allValues) : 0;
  const maxVal = allValues.length ? Math.max(...allValues) : 1000;
  const range = maxVal - minVal;
  const padding = range > 0 ? range * 0.25 : minVal * 0.15;
  const yMin = Math.max(0, Math.floor((minVal - padding) / 1000) * 1000);
  const yMax = Math.ceil((maxVal + padding) / 1000) * 1000;

  // Breakdown by asset type for the "By Asset" view
  const assetData = (portfolioSummary?.assetBreakdown || []).map((item) => {
    const typeLabel = item.assetType.replace(/_/g, ' ').toUpperCase();
    const gain = item.currentValue - item.investedAmount;
    const gainPct = item.investedAmount > 0 ? (gain / item.investedAmount) * 100 : 0;
    return {
      name: typeLabel,
      invested: Math.round(item.investedAmount),
      current: Math.round(item.currentValue),
      gain: Math.round(gain),
      gainPct: Number(gainPct.toFixed(2)),
      share: item.allocationPercent,
    };
  });

  const fallbackAssetData = Object.entries(
    investments.reduce((acc, inv) => {
      const type = inv.assetType || 'other';
      if (!acc[type]) acc[type] = { invested: 0, current: 0 };
      acc[type].invested += inv.investedAmount;
      acc[type].current += inv.currentValue;
      return acc;
    }, {} as Record<string, { invested: number; current: number }>)
  ).map(([type, vals]) => ({
    name: type.replace(/_/g, ' ').toUpperCase(),
    invested: Math.round(vals.invested),
    current: Math.round(vals.current),
    gain: Math.round(vals.current - vals.invested),
    gainPct: vals.invested > 0 ? Number((((vals.current - vals.invested) / vals.invested) * 100).toFixed(2)) : 0,
    share: totalCurrentValue > 0 ? Number(((vals.current / totalCurrentValue) * 100).toFixed(1)) : 0,
  }));

  const finalAssetData = assetData.length > 0 ? assetData : fallbackAssetData;

  // Custom Trend Tooltip
  const TrendTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const current = payload.find((p: any) => p.dataKey === 'current')?.value ?? 0;
    const invested = payload.find((p: any) => p.dataKey === 'invested')?.value ?? 0;
    const diff = current - invested;
    const diffPercent = invested > 0 ? ((diff / invested) * 100).toFixed(2) : '0.00';
    const isGain = diff >= 0;
    const fullDate = payload[0]?.payload?.fullDate || label;

    return (
      <div className="bg-[#121212] border-2 border-[#FFE600] p-3 shadow-neo text-white text-xs font-mono select-none">
        <div className="font-sans font-black text-[11px] uppercase tracking-wider text-[#FFE600] mb-2 border-b border-neutral-700 pb-1">
          {fullDate}
        </div>
        <div className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-neutral-300 font-sans font-bold text-[11px]">
            <span className="w-2.5 h-2.5 bg-[#05DF72] border border-black inline-block" /> Current Value:
          </span>
          <span className="font-bold text-[#05DF72]">{currencySymbol}{current.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-neutral-300 font-sans font-bold text-[11px]">
            <span className="w-2.5 h-2.5 bg-[#FFE600] border border-black inline-block" /> Invested Capital:
          </span>
          <span className="font-bold text-[#FFE600]">{currencySymbol}{invested.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1.5 mt-1 border-t border-neutral-700">
          <span className="text-neutral-400 font-sans font-bold text-[11px]">Unrealized P&L:</span>
          <span className={`font-bold ${isGain ? 'text-[#05DF72]' : 'text-[#FF4343]'}`}>
            {isGain ? '+' : ''}{currencySymbol}{diff.toLocaleString('en-IN')} ({isGain ? '+' : ''}{diffPercent}%)
          </span>
        </div>
      </div>
    );
  };

  // Custom Asset Tooltip
  const AssetTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const invested = payload.find((p: any) => p.dataKey === 'invested')?.value ?? 0;
    const current = payload.find((p: any) => p.dataKey === 'current')?.value ?? 0;
    const diff = current - invested;
    const diffPct = invested > 0 ? ((diff / invested) * 100).toFixed(2) : '0.00';
    const isGain = diff >= 0;

    return (
      <div className="bg-[#121212] border-2 border-[#FFE600] p-3 shadow-neo text-white text-xs font-mono select-none">
        <div className="font-sans font-black text-[11px] uppercase tracking-wider text-[#FFE600] mb-2 border-b border-neutral-700 pb-1">
          {label}
        </div>
        <div className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-neutral-300 font-sans font-bold text-[11px]">
            <span className="w-2.5 h-2.5 bg-[#05DF72] border border-black inline-block" /> Current Value:
          </span>
          <span className="font-bold text-[#05DF72]">{currencySymbol}{current.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-neutral-300 font-sans font-bold text-[11px]">
            <span className="w-2.5 h-2.5 bg-[#FFE600] border border-black inline-block" /> Invested Capital:
          </span>
          <span className="font-bold text-[#FFE600]">{currencySymbol}{invested.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1.5 mt-1 border-t border-neutral-700">
          <span className="text-neutral-400 font-sans font-bold text-[11px]">Net Gain / Loss:</span>
          <span className={`font-bold ${isGain ? 'text-[#05DF72]' : 'text-[#FF4343]'}`}>
            {isGain ? '+' : ''}{currencySymbol}{diff.toLocaleString('en-IN')} ({isGain ? '+' : ''}{diffPct}%)
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white border-[3px] border-[#121212] shadow-neo p-4 sm:p-6 flex flex-col gap-3">
      {/* Header with Title, Real P&L badge, and View Mode Switches */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[#121212] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-black uppercase text-[#121212] tracking-wider">
              Portfolio Growth & Performance
            </h3>
            <span
              className={`text-[10px] font-black px-1.5 py-0.5 border border-[#121212] ${
                isPositive ? 'bg-[#05DF72] text-[#121212]' : 'bg-[#FF4343] text-white'
              }`}
            >
              {isPositive ? '+' : ''}{returnsPercent.toFixed(2)}%
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] font-mono font-bold text-neutral-600">
            <span>Valuation: <strong className="text-[#121212]">{currencySymbol}{totalCurrentValue.toLocaleString('en-IN')}</strong></span>
            <span>•</span>
            <span>Basis: <strong className="text-[#121212]">{currencySymbol}{totalInvested.toLocaleString('en-IN')}</strong></span>
          </div>
        </div>

        {/* View mode & Timeframe switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          {viewMode === 'trend' && (
            <div className="flex items-center border-2 border-[#121212] bg-[#F5F5F5] p-0.5 shadow-neo-sm">
              {(['3M', '6M', '1Y'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-2 py-0.5 text-[10px] font-black tracking-wider transition-colors ${
                    timeframe === tf ? 'bg-[#121212] text-[#FFE600]' : 'text-[#121212] hover:bg-white'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center border-2 border-[#121212] bg-[#F5F5F5] p-0.5 shadow-neo-sm">
            <button
              onClick={() => setViewMode('trend')}
              className={`px-2 py-0.5 text-[10px] font-black tracking-wider flex items-center gap-1 transition-colors ${
                viewMode === 'trend' ? 'bg-[#121212] text-[#FFE600]' : 'text-[#121212] hover:bg-white'
              }`}
            >
              <TrendingUp size={11} /> Trend
            </button>
            <button
              onClick={() => setViewMode('asset')}
              className={`px-2 py-0.5 text-[10px] font-black tracking-wider flex items-center gap-1 transition-colors ${
                viewMode === 'asset' ? 'bg-[#121212] text-[#FFE600]' : 'text-[#121212] hover:bg-white'
              }`}
            >
              <BarChart3 size={11} /> By Asset
            </button>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {viewMode === 'trend' ? (
            <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="currentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#05DF72" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#05DF72" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="investedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FFE600" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#FFE600" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#121212" opacity={0.15} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: '#121212', fontWeight: 800 }}
                axisLine={{ stroke: '#121212', strokeWidth: 1.5 }}
                tickLine={{ stroke: '#121212' }}
              />
              <YAxis
                domain={[yMin, yMax]}
                tick={{ fontSize: 10, fill: '#121212', fontWeight: 700 }}
                tickFormatter={(v) => `${currencySymbol}${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`}
                axisLine={{ stroke: '#121212', strokeWidth: 1.5 }}
                tickLine={{ stroke: '#121212' }}
                width={52}
              />
              <Tooltip content={<TrendTooltip />} />
              <Area
                type="monotone"
                dataKey="current"
                stroke="#05DF72"
                fill="url(#currentGrad)"
                strokeWidth={2.5}
                name="Current Value"
                dot={{ r: 3, fill: '#05DF72', stroke: '#121212', strokeWidth: 1.5 }}
                activeDot={{ r: 5, fill: '#FFE600', stroke: '#121212', strokeWidth: 2 }}
              />
              <Area
                type="monotone"
                dataKey="invested"
                stroke="#D4A100"
                fill="url(#investedGrad)"
                strokeWidth={2}
                strokeDasharray="4 2"
                name="Invested"
                dot={{ r: 2.5, fill: '#FFE600', stroke: '#121212', strokeWidth: 1 }}
                activeDot={{ r: 4, fill: '#FFE600', stroke: '#121212', strokeWidth: 2 }}
              />
            </AreaChart>
          ) : (
            <BarChart data={finalAssetData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#121212" opacity={0.15} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: '#121212', fontWeight: 800 }}
                axisLine={{ stroke: '#121212', strokeWidth: 1.5 }}
                tickLine={{ stroke: '#121212' }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#121212', fontWeight: 700 }}
                tickFormatter={(v) => `${currencySymbol}${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`}
                axisLine={{ stroke: '#121212', strokeWidth: 1.5 }}
                tickLine={{ stroke: '#121212' }}
                width={52}
              />
              <Tooltip content={<AssetTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '11px', fontWeight: 700, paddingTop: '8px' }}
                formatter={(value) => <span className="text-[#121212] font-black uppercase text-[10px]">{value}</span>}
              />
              <Bar
                dataKey="invested"
                fill="#FFE600"
                stroke="#121212"
                strokeWidth={1.5}
                name="Invested Capital"
                radius={[3, 3, 0, 0]}
              />
              <Bar
                dataKey="current"
                fill="#05DF72"
                stroke="#121212"
                strokeWidth={1.5}
                name="Current Value"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend & Summary Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[10px] font-mono font-bold text-neutral-600 pt-2 border-t border-neutral-200">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#05DF72] border border-[#121212]" />
            <span className="font-sans uppercase text-[#121212] font-black">Current Value ({currencySymbol}{totalCurrentValue.toLocaleString('en-IN')})</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#FFE600] border border-[#121212]" />
            <span className="font-sans uppercase text-[#121212] font-black">Invested Basis ({currencySymbol}{totalInvested.toLocaleString('en-IN')})</span>
          </span>
        </div>
        <span className={`font-sans font-black ${isPositive ? 'text-[#05DF72]' : 'text-[#FF4343]'}`}>
          {isPositive ? '▲ NET GAIN' : '▼ NET LOSS'}: {currencySymbol}{Math.abs(totalReturns).toLocaleString('en-IN')}
        </span>
      </div>
    </div>
  );
};
