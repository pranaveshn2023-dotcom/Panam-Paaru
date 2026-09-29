import React, { Suspense, useState, useEffect } from 'react';
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
import { usePrivacy } from '../../context/PrivacyContext';

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
  currencySymbol?: string;
  totalHoldingsCount?: number;
  totalCurrentValue?: number;
}

export const AllocationChart: React.FC<AllocationChartProps> = ({
  assetBreakdown,
  currencySymbol = '₹',
  totalHoldingsCount,
  totalCurrentValue,
}) => {
  const { isPrivacyMode } = usePrivacy();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Filter out any 0% asset classes so the donut dynamically shows only real holdings
  const activeBreakdown = (assetBreakdown || []).filter(
    (item) => item.allocationPercent > 0 || (item.currentValue && item.currentValue > 0)
  );
  if (activeBreakdown.length === 0) return null;

  const totalValue =
    totalCurrentValue ?? activeBreakdown.reduce((sum, item) => sum + (item.currentValue || 0), 0);
  const computedHoldings =
    totalHoldingsCount ?? activeBreakdown.reduce((sum, item) => sum + (item.itemCount || 0), 0);

  const data = activeBreakdown.map((item) => ({
    name: item.assetType.replace(/_/g, ' ').toUpperCase(),
    rawType: item.assetType,
    value: item.allocationPercent,
    currentValue: item.currentValue,
    itemCount: item.itemCount || 0,
  }));

  // Dynamic formatting for any portfolio valuation scale (from hundreds to Crores)
  const formatSmartAmount = (val: number): string => {
    if (isPrivacyMode) return '••••••';
    const abs = Math.abs(val);
    if (abs >= 10000000) {
      return `${currencySymbol}${(val / 10000000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}Cr`;
    }
    if (abs >= 100000) {
      return `${currencySymbol}${(val / 100000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}L`;
    }
    return `${currencySymbol}${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  // Dynamically calibrate ring thickness and padding based on number of assets
  const assetCount = data.length;
  const paddingAngle = assetCount <= 2 ? 4 : assetCount <= 5 ? 3 : 1.5;
  const innerRadius = assetCount <= 3 ? 36 : 38;
  const outerRadius = 58;

  const renderCustomLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius: r, value, index } = props;
    if (!value || value <= 0) return null;

    const RADIAN = Math.PI / 180;
    const cos = Math.cos(-midAngle * RADIAN);
    const sin = Math.sin(-midAngle * RADIAN);

    const isHovered = activeIndex === index;

    // Start point on the outer edge of slice
    const sx = cx + (r + 2) * cos;
    const sy = cy + (r + 2) * sin;

    // Stagger leader lines for small slices so adjacent labels never collide regardless of how many assets exist
    const staggerOffset = data.length > 4 && Number(value) < 6 ? (index % 2 === 1 ? 6 : 0) : 0;
    const radialOffset = (isHovered ? 13 : 10) + staggerOffset;
    const mx = cx + (r + radialOffset) * cos;
    const my = cy + (r + radialOffset) * sin;

    // Horizontal tail and text alignment
    let ex = mx;
    let ey = my;
    let textAnchor: 'start' | 'middle' | 'end' = 'middle';
    let textX = mx;
    let textY = my;

    if (cos > 0.25) {
      // Right hemisphere
      ex = mx + 8;
      ey = my;
      textX = ex + 4;
      textY = ey;
      textAnchor = 'start';
    } else if (cos < -0.25) {
      // Left hemisphere
      ex = mx - 8;
      ey = my;
      textX = ex - 4;
      textY = ey;
      textAnchor = 'end';
    } else {
      // Top or Bottom (near vertical alignment)
      const isTop = sin < 0;
      ex = mx;
      ey = my + (isTop ? -4 : 4);
      textX = ex;
      textY = ey + (isTop ? -6 : 6);
      textAnchor = 'middle';
    }

    const formattedVal = `${Number.isInteger(Number(value)) ? Number(value) : Number(value).toFixed(1)}%`;

    return (
      <g className="transition-all duration-150 pointer-events-none">
        {/* Neo-brutalist leader line */}
        <path
          d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`}
          stroke="#121212"
          strokeWidth={isHovered ? 2.5 : 1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Joint dot on outer slice */}
        <circle cx={sx} cy={sy} r={isHovered ? 3 : 2} fill="#121212" />

        {/* Clear percentage numbering with crisp white halo outline */}
        <text
          x={textX}
          y={textY}
          textAnchor={textAnchor}
          dominantBaseline="central"
          fill="#121212"
          stroke="#FFFFFF"
          strokeWidth={3.5}
          paintOrder="stroke fill"
          strokeLinejoin="round"
          className="font-mono select-none"
          style={{
            fontSize: isHovered ? '12px' : '11px',
            fontWeight: 900,
          }}
        >
          {formattedVal}
        </text>
      </g>
    );
  };

  return (
    <div className="bg-white border-[3px] border-[#121212] shadow-neo p-4 sm:p-6 flex flex-col justify-between gap-3">
      <div className="flex items-center justify-between border-b-2 border-[#121212] pb-3">
        <h3 className="text-xs font-black uppercase text-[#121212] tracking-wider">
          Asset Allocation
        </h3>
        <span className="text-[10px] font-mono font-bold text-neutral-500 uppercase">
          {data.length} {data.length === 1 ? 'Class' : 'Classes'}
        </span>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-6 my-auto">
        {/* Dynamic Pie Chart with Center Stats */}
        <div className="w-full sm:w-[50%] h-56 relative flex items-center justify-center overflow-visible">
          <ResponsiveContainer width="100%" height="100%" className="overflow-visible">
            <RePieChart style={{ overflow: 'visible' }}>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={innerRadius}
                outerRadius={outerRadius}
                paddingAngle={paddingAngle}
                dataKey="value"
                label={renderCustomLabel}
                labelLine={false}
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                {data.map((entry, index) => {
                  const isHovered = activeIndex === index;
                  const isOtherHovered = activeIndex !== null && !isHovered;
                  const colorKey = entry.rawType || entry.name?.toLowerCase().replace(/\s+/g, '_');
                  const fillColor = ASSET_COLORS[colorKey] || '#FFE600';
                  return (
                    <Cell
                      key={index}
                      fill={fillColor}
                      stroke="#121212"
                      strokeWidth={isHovered ? 3.5 : 2}
                      opacity={isOtherHovered ? 0.35 : 1}
                      className="transition-all duration-200 cursor-pointer"
                    />
                  );
                })}
              </Pie>
            </RePieChart>
          </ResponsiveContainer>

          {/* Donut Hole Center Information (Dynamically Adapts to Any Portfolio) */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none text-center px-1">
            {activeIndex !== null && data[activeIndex] ? (
              <div className="flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-150">
                <span className="text-[9px] font-black uppercase tracking-wider text-neutral-500 truncate max-w-[76px]">
                  {data[activeIndex].name}
                </span>
                <span className="text-base sm:text-lg font-mono font-black text-[#121212] leading-tight">
                  {data[activeIndex].value}%
                </span>
                <span className="text-[10px] font-mono font-bold text-neutral-600 truncate max-w-[85px]">
                  {formatSmartAmount(data[activeIndex].currentValue)}
                </span>
                {data[activeIndex].itemCount > 0 && (
                  <span className="text-[8px] font-mono font-bold text-neutral-400">
                    {data[activeIndex].itemCount} {data[activeIndex].itemCount === 1 ? 'item' : 'items'}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center animate-in fade-in duration-200">
                <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                  PORTFOLIO
                </span>
                <span className="text-sm sm:text-base font-mono font-black text-[#121212] leading-tight">
                  {formatSmartAmount(totalValue)}
                </span>
                <span className="text-[9px] font-mono font-bold text-neutral-500 mt-0.5">
                  {data.length} {data.length === 1 ? 'Asset' : 'Assets'}
                  {computedHoldings > 0 && ` • ${computedHoldings}H`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Allocation Legend List */}
        <div className="w-full sm:w-[50%] flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
          {data.map((item, index) => {
            const isHovered = activeIndex === index;
            const isOtherHovered = activeIndex !== null && !isHovered;
            const colorKey = item.rawType || item.name?.toLowerCase().replace(/\s+/g, '_');
            const color = ASSET_COLORS[colorKey] || '#FFE600';

            return (
              <div
                key={item.name}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
                className={`flex items-center justify-between text-xs font-black p-1.5 rounded transition-all cursor-pointer ${
                  isHovered
                    ? 'bg-neutral-100 shadow-neo-sm translate-x-1 border-l-2 border-[#121212]'
                    : isOtherHovered
                    ? 'opacity-40'
                    : 'hover:bg-neutral-50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-3 h-3 border border-[#121212] shrink-0 shadow-neo-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span className="uppercase truncate max-w-[110px] sm:max-w-none" title={item.name}>
                    {item.name}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono font-black text-[#121212]">{item.value}%</span>
                  <span className="text-neutral-500 font-mono text-[11px]">
                    {isPrivacyMode
                      ? '••••••'
                      : `₹${item.currentValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface ReturnsChartProps {
  investments: Investment[];
}

export const ReturnsChart: React.FC<ReturnsChartProps> = ({ investments }) => {
  const { isPrivacyMode } = usePrivacy();
  const [displayLimit, setDisplayLimit] = useState<number | 'all'>('all');
  const [sortOption, setSortOption] = useState<'value' | 'gain' | 'invested' | 'name'>('value');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 640 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!investments || investments.length === 0) return null;

  const sorted = [...investments].sort((a, b) => {
    if (sortOption === 'value') return b.currentValue - a.currentValue;
    if (sortOption === 'gain') {
      const aGain = a.currentValue - a.investedAmount;
      const bGain = b.currentValue - b.investedAmount;
      return bGain - aGain;
    }
    if (sortOption === 'invested') return b.investedAmount - a.investedAmount;
    return a.name.localeCompare(b.name);
  });

  const displayHoldings = displayLimit === 'all' ? sorted : sorted.slice(0, displayLimit);

  const data = displayHoldings.map((inv) => {
    const gain = inv.currentValue - inv.investedAmount;
    const gainPercent = inv.investedAmount > 0 ? Number(((gain / inv.investedAmount) * 100).toFixed(2)) : 0;
    const maxLen = isMobile ? 12 : 20;
    return {
      fullName: inv.name,
      name: inv.name.length > maxLen ? inv.name.substring(0, maxLen - 2) + '...' : inv.name,
      invested: inv.investedAmount,
      current: inv.currentValue,
      gain,
      gainPercent,
    };
  });

  const barHeight = 36;
  const chartHeight = Math.max(260, data.length * barHeight);

  return (
    <div className="bg-white border-[3px] border-[#121212] shadow-neo p-4 sm:p-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between border-b-2 border-[#121212] pb-3 gap-2">
        <div>
          <h3 className="text-xs font-black uppercase text-[#121212] tracking-wider">
            Returns by Holding ({displayHoldings.length} of {investments.length})
          </h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={String(displayLimit)}
            onChange={(e) => setDisplayLimit(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="px-2 py-1 text-[11px] font-black uppercase bg-white border border-[#121212] cursor-pointer"
          >
            <option value="all">All Holdings ({investments.length})</option>
            <option value="10">Top 10</option>
            <option value="20">Top 20</option>
            <option value="30">Top 30</option>
          </select>

          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as any)}
            className="px-2 py-1 text-[11px] font-black uppercase bg-[#FFE600] border border-[#121212] cursor-pointer text-[#121212]"
          >
            <option value="value">Highest Value</option>
            <option value="gain">Highest Returns</option>
            <option value="invested">Highest Invested</option>
            <option value="name">A – Z</option>
          </select>
        </div>
      </div>

      <div className="overflow-y-auto max-h-[480px] border border-neutral-200 bg-neutral-50/50 p-2 overscroll-y-contain">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={data} layout="vertical" margin={{ left: isMobile ? 0 : 10, right: isMobile ? 10 : 20, top: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#121212" opacity={0.15} />
            <XAxis
              type="number"
              tick={isPrivacyMode ? false : { fontSize: isMobile ? 10 : 11, fill: '#121212', fontWeight: 700 }}
              tickLine={isPrivacyMode ? false : { stroke: '#121212' }}
              tickFormatter={(v) =>
                `₹${v >= 100000 ? (v / 100000).toFixed(1) + 'L' : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`
              }
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: isMobile ? 9 : 10, fill: '#121212', fontWeight: 700 }}
              width={isMobile ? 80 : 140}
            />
            <Tooltip
              contentStyle={{
                background: '#121212',
                border: '2px solid #FFE600',
                color: '#FFF',
                fontWeight: 700,
                fontSize: '12px',
              }}
              formatter={(value: any, name: any) => [
                isPrivacyMode
                  ? '••••••'
                  : `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                name,
              ]}
              labelFormatter={(_label, payload) => {
                const item = payload?.[0]?.payload;
                return item?.fullName || _label;
              }}
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
  const { isPrivacyMode } = usePrivacy();
  const [viewMode, setViewMode] = useState<'trend' | 'asset'>('trend');
  const [timeframe, setTimeframe] = useState<'3M' | '6M' | '1Y'>('6M');

  const totalInvested = portfolioSummary?.totalInvested ?? investments.reduce((s, i) => s + i.investedAmount, 0);
  const totalCurrentValue = portfolioSummary?.totalCurrentValue ?? investments.reduce((s, i) => s + i.currentValue, 0);
  const totalReturns = totalCurrentValue - totalInvested;
  const returnsPercent = totalInvested > 0 ? (totalReturns / totalInvested) * 100 : 0;
  const isPositive = totalReturns >= 0;
  const totalSip = portfolioSummary?.totalMonthlySip ?? investments.reduce((s, i) => s + (i.sipAmount || 0), 0);

  // Generate timeline data strictly anchored to real portfolio acquisition dates
  const now = new Date();
  const pointCount = timeframe === '3M' ? 3 : timeframe === '6M' ? 6 : 12;

  const trendData = Array.from({ length: pointCount }).map((_, idx) => {
    const monthsAgo = pointCount - 1 - idx;
    const monthDate = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0, 23, 59, 59, 999);
    const monthTimestamp = monthDate.getTime();
    const monthName = monthDate.toLocaleDateString('en-IN', { month: 'short' });
    const fullDate = monthDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    const isCurrentMonth = monthsAgo === 0;

    // Filter real holdings that were acquired/created on or before this month
    const activeAtMonth = investments.filter(
      (inv) => (inv.createdAt || 0) <= monthTimestamp
    );

    const invPoint = isCurrentMonth
      ? Math.round(totalInvested)
      : Math.round(activeAtMonth.reduce((sum, h) => sum + h.investedAmount, 0));

    const curPoint = isCurrentMonth
      ? Math.round(totalCurrentValue)
      : Math.round(activeAtMonth.reduce((sum, h) => sum + h.currentValue, 0));

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
          <span className="font-bold text-[#05DF72]">
            {isPrivacyMode ? '••••••' : `${currencySymbol}${current.toLocaleString('en-IN')}`}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-neutral-300 font-sans font-bold text-[11px]">
            <span className="w-2.5 h-2.5 bg-[#FFE600] border border-black inline-block" /> Invested Capital:
          </span>
          <span className="font-bold text-[#FFE600]">
            {isPrivacyMode ? '••••••' : `${currencySymbol}${invested.toLocaleString('en-IN')}`}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1.5 mt-1 border-t border-neutral-700">
          <span className="text-neutral-400 font-sans font-bold text-[11px]">Unrealized P&L:</span>
          <span className={`font-bold ${isGain ? 'text-[#05DF72]' : 'text-[#FF4343]'}`}>
            {isPrivacyMode ? '••••' : `${isGain ? '+' : ''}${currencySymbol}${diff.toLocaleString('en-IN')}`} ({isGain ? '+' : ''}{diffPercent}%)
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
          <span className="font-bold text-[#05DF72]">
            {isPrivacyMode ? '••••••' : `${currencySymbol}${current.toLocaleString('en-IN')}`}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-neutral-300 font-sans font-bold text-[11px]">
            <span className="w-2.5 h-2.5 bg-[#FFE600] border border-black inline-block" /> Invested Capital:
          </span>
          <span className="font-bold text-[#FFE600]">
            {isPrivacyMode ? '••••••' : `${currencySymbol}${invested.toLocaleString('en-IN')}`}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1.5 mt-1 border-t border-neutral-700">
          <span className="text-neutral-400 font-sans font-bold text-[11px]">Net Gain / Loss:</span>
          <span className={`font-bold ${isGain ? 'text-[#05DF72]' : 'text-[#FF4343]'}`}>
            {isPrivacyMode ? '••••' : `${isGain ? '+' : ''}${currencySymbol}${diff.toLocaleString('en-IN')}`} ({isGain ? '+' : ''}{diffPct}%)
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
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 text-[11px] font-mono font-bold text-neutral-600">
            <span>Valuation: <strong className="text-[#121212]">{isPrivacyMode ? '••••••' : `${currencySymbol}${totalCurrentValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</strong></span>
            <span className="hidden sm:inline">•</span>
            <span>Basis: <strong className="text-[#121212]">{isPrivacyMode ? '••••••' : `${currencySymbol}${totalInvested.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</strong></span>
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
                tick={isPrivacyMode ? false : { fontSize: 10, fill: '#121212', fontWeight: 700 }}
                tickFormatter={(v) => isPrivacyMode ? '' : `${currencySymbol}${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`}
                axisLine={{ stroke: '#121212', strokeWidth: 1.5 }}
                tickLine={isPrivacyMode ? false : { stroke: '#121212' }}
                width={isPrivacyMode ? 14 : 52}
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
                tick={isPrivacyMode ? false : { fontSize: 10, fill: '#121212', fontWeight: 700 }}
                tickFormatter={(v) => isPrivacyMode ? '' : `${currencySymbol}${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`}
                axisLine={{ stroke: '#121212', strokeWidth: 1.5 }}
                tickLine={isPrivacyMode ? false : { stroke: '#121212' }}
                width={isPrivacyMode ? 14 : 52}
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
            <span className="font-sans uppercase text-[#121212] font-black">
              Current Value ({isPrivacyMode ? '••••••' : `${currencySymbol}${totalCurrentValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`})
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#FFE600] border border-[#121212]" />
            <span className="font-sans uppercase text-[#121212] font-black">
              Invested Basis ({isPrivacyMode ? '••••••' : `${currencySymbol}${totalInvested.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`})
            </span>
          </span>
        </div>
        <span className={`font-sans font-black ${isPositive ? 'text-[#05DF72]' : 'text-[#FF4343]'}`}>
          {isPositive ? '▲ NET GAIN' : '▼ NET LOSS'}: {isPrivacyMode ? '••••' : `${currencySymbol}${Math.abs(totalReturns).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        </span>
      </div>
    </div>
  );
};
