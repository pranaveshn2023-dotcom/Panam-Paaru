import React, { useState, useMemo } from 'react';
import { SpendingAnalytics, Transaction } from '../types';
import { usePrivacy } from '../context/PrivacyContext';
import { 
  ChevronLeft, 
  ChevronRight, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Scale, 
  Calendar as CalendarIcon, 
  Flame, 
  TrendingUp, 
  PieChart as PieChartIcon,
  Activity,
  Layers
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';

interface InsightsPageProps {
  analytics: SpendingAnalytics | null;
  transactions?: Transaction[];
  currencySymbol?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Food & Dining': '#FFE600',
  'Shopping': '#FF4D8D',
  'Housing & Rent': '#00F0FF',
  'Transportation': '#05DF72',
  'Utilities & Bills': '#9B51E0',
  'Entertainment': '#FF8A00',
  'Healthcare': '#00C2FF',
  'Investments': '#FFE600',
  'Salary': '#05DF72',
  'Freelance': '#00F0FF',
  'Gifts': '#FF4D8D',
  'Other': '#A0A0A0',
  'Transfer': '#6366F1',
};

const COLOR_PALETTE = [
  '#FFE600', '#00F0FF', '#FF4D8D', '#05DF72', '#9B51E0', 
  '#FF8A00', '#00C2FF', '#E2E8F0', '#F43F5E', '#10B981'
];

export const InsightsPage: React.FC<InsightsPageProps> = ({
  analytics,
  transactions = [],
  currencySymbol = '₹',
}) => {
  const { formatPrivateAmount } = usePrivacy();

  // Selected period state (Year and Month)
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Month navigation
  const handlePrevMonth = () => {
    setSelectedDay(null);
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    setSelectedDay(null);
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const monthLabel = new Date(selectedYear, selectedMonth, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const monthShortKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  // Filter transactions for the selected month (excluding transfers for income/expense)
  const periodTransactions = useMemo(() => {
    return transactions.filter((t) => t.date.startsWith(monthShortKey));
  }, [transactions, monthShortKey]);

  // Totals
  const { totalExpense, totalIncome, netCashFlow } = useMemo(() => {
    let exp = 0;
    let inc = 0;
    for (const t of periodTransactions) {
      if (t.type === 'expense') exp += t.amount;
      if (t.type === 'income') inc += t.amount;
    }
    return {
      totalExpense: exp,
      totalIncome: inc,
      netCashFlow: inc - exp,
    };
  }, [periodTransactions]);

  // Category breakdown
  const categoryStats = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const t of periodTransactions) {
      if (t.type === 'expense') {
        const cat = t.category || 'Other';
        const cur = map.get(cat) || { total: 0, count: 0 };
        map.set(cat, { total: cur.total + t.amount, count: cur.count + 1 });
      }
    }

    const items = Array.from(map.entries()).map(([name, data], idx) => {
      const percentage = totalExpense > 0 ? (data.total / totalExpense) * 100 : 0;
      return {
        name,
        total: data.total,
        count: data.count,
        percentage: Number(percentage.toFixed(2)),
        color: CATEGORY_COLORS[name] || COLOR_PALETTE[idx % COLOR_PALETTE.length],
      };
    });

    return items.sort((a, b) => b.total - a.total);
  }, [periodTransactions, totalExpense]);

  // Daily spending map for the month
  const dailySpendingMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const t of periodTransactions) {
      if (t.type === 'expense') {
        const day = parseInt(t.date.slice(8, 10), 10);
        if (!isNaN(day)) {
          map.set(day, (map.get(day) || 0) + t.amount);
        }
      }
    }
    return map;
  }, [periodTransactions]);

  // Days in selected month
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(selectedYear, selectedMonth, 1).getDay(); // 0 = Sun

  // Calendar matrix generator
  const calendarWeeks = useMemo(() => {
    const weeks: Array<Array<{ day: number | null; amount: number }>> = [];
    let currentWeek: Array<{ day: number | null; amount: number }> = [];

    // Fill leading blank days
    for (let i = 0; i < firstDayOfWeek; i++) {
      currentWeek.push({ day: null, amount: 0 });
    }

    // Fill days of the month
    for (let d = 1; d <= daysInMonth; d++) {
      currentWeek.push({
        day: d,
        amount: dailySpendingMap.get(d) || 0,
      });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Fill trailing blank days
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({ day: null, amount: 0 });
      }
      weeks.push(currentWeek);
    }

    return weeks;
  }, [daysInMonth, firstDayOfWeek, dailySpendingMap]);

  // Daily flow points for spending line curve
  const flowCurvePoints = useMemo(() => {
    const points: Array<{ day: number; amount: number; count: number }> = [];
    let max = 0;
    let total = 0;
    let activeDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const amt = dailySpendingMap.get(d) || 0;
      if (amt > max) max = amt;
      if (amt > 0) {
        total += amt;
        activeDays += 1;
      }
      const dayTxCount = periodTransactions.filter(
        (t) => t.type === 'expense' && parseInt(t.date.slice(8, 10), 10) === d
      ).length;
      points.push({ day: d, amount: amt, count: dayTxCount });
    }
    const avg = activeDays > 0 ? total / activeDays : 0;
    return { points, maxAmount: max, average: avg, totalSpent: total, activeDays };
  }, [daysInMonth, dailySpendingMap, periodTransactions]);

  // Formatted data for Recharts Line/Area Graph
  const flowChartData = useMemo(() => {
    return flowCurvePoints.points.map((p) => {
      const dateObj = new Date(selectedYear, selectedMonth, p.day);
      const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      const monthShort = dateObj.toLocaleDateString('en-US', { month: 'short' });
      return {
        day: p.day,
        label: `Day ${p.day}`,
        shortDate: `${p.day} ${monthShort}`,
        weekday,
        amount: p.amount,
        count: p.count,
      };
    });
  }, [flowCurvePoints.points, selectedYear, selectedMonth]);

  // SVG Donut Chart Slices
  const donutSlices = useMemo(() => {
    if (totalExpense === 0 || categoryStats.length === 0) return [];
    let cumulative = 0;
    return categoryStats.map((cat) => {
      const start = cumulative;
      const share = cat.percentage;
      cumulative += share;
      return {
        ...cat,
        startPercent: start,
        endPercent: cumulative,
      };
    });
  }, [categoryStats, totalExpense]);

  // Selected Day Transactions for inspection
  const selectedDayTransactions = useMemo(() => {
    if (!selectedDay) return [];
    const datePrefix = `${monthShortKey}-${String(selectedDay).padStart(2, '0')}`;
    return periodTransactions.filter((t) => t.date.startsWith(datePrefix));
  }, [selectedDay, monthShortKey, periodTransactions]);

  const todayDate = now.getDate();
  const isCurrentMonth = now.getFullYear() === selectedYear && now.getMonth() === selectedMonth;

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-150">
      
      {/* Top Header with Month Switcher (MyMoney Screenshot 1 Style) */}
      <div className="bg-[#121212] text-white p-4 sm:p-6 border-[3px] border-[#121212] shadow-neo">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-black uppercase tracking-widest bg-[#FFE600] text-[#121212] px-2 py-0.5 inline-block">
                FINANCIAL ANALYSIS & FLOW
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
              EXPENSE & CASHFLOW INTELLIGENCE
            </h2>
            <p className="text-xs font-bold text-neutral-300 mt-0.5">
              Interactive category distributions, day-by-day matrices, and cash flow trends.
            </p>
          </div>

          {/* Month Stepper: < 2026/02 > */}
          <div className="flex items-center justify-between bg-neutral-900 border-2 border-neutral-700 p-1 w-full sm:w-auto shadow-neo-sm">
            <button
              onClick={handlePrevMonth}
              aria-label="Previous Month"
              className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft size={18} strokeWidth={3} />
            </button>
            <span className="px-2 sm:px-4 text-xs sm:text-sm font-mono font-black tracking-wider uppercase text-white min-w-[120px] sm:min-w-[150px] text-center">
              {monthLabel}
            </span>
            <button
              onClick={handleNextMonth}
              aria-label="Next Month"
              className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronRight size={18} strokeWidth={3} />
            </button>
          </div>
        </div>
      </div>

      {/* Summary Row (MyMoney Screenshot 1: Expense, Income, Total Net) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* Expense Summary */}
        <div className="bg-white border-[3px] border-[#121212] shadow-neo p-3.5 sm:p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-neutral-500 truncate">
              EXPENSE SO FAR
            </span>
            <div className="w-6 h-6 sm:w-7 sm:h-7 bg-[#FF4343] text-white border-2 border-[#121212] flex items-center justify-center font-black shrink-0">
              <ArrowUpRight size={14} strokeWidth={3} />
            </div>
          </div>
          <span className="text-xl sm:text-3xl font-mono font-black text-[#FF4343] truncate">
            {formatPrivateAmount(totalExpense, currencySymbol)}
          </span>
          <span className="text-[10px] font-bold text-neutral-500 mt-1 truncate">
            {periodTransactions.filter((t) => t.type === 'expense').length} expense transactions
          </span>
        </div>

        {/* Income Summary */}
        <div className="bg-white border-[3px] border-[#121212] shadow-neo p-3.5 sm:p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-neutral-500 truncate">
              INCOME SO FAR
            </span>
            <div className="w-6 h-6 sm:w-7 sm:h-7 bg-[#05DF72] text-[#121212] border-2 border-[#121212] flex items-center justify-center font-black shrink-0">
              <ArrowDownLeft size={14} strokeWidth={3} />
            </div>
          </div>
          <span className="text-xl sm:text-3xl font-mono font-black text-[#05DF72] truncate">
            {formatPrivateAmount(totalIncome, currencySymbol)}
          </span>
          <span className="text-[10px] font-bold text-neutral-500 mt-1 truncate">
            {periodTransactions.filter((t) => t.type === 'income').length} income credits
          </span>
        </div>

        {/* Net Total Summary */}
        <div className="bg-white border-[3px] border-[#121212] shadow-neo p-3.5 sm:p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-neutral-500 truncate">
              NET CASH FLOW
            </span>
            <div className="w-6 h-6 sm:w-7 sm:h-7 bg-[#00F0FF] text-[#121212] border-2 border-[#121212] flex items-center justify-center font-black shrink-0">
              <Scale size={14} strokeWidth={3} />
            </div>
          </div>
          <span
            className={`text-xl sm:text-3xl font-mono font-black truncate ${
              netCashFlow >= 0 ? 'text-[#05DF72]' : 'text-[#FF4343]'
            }`}
          >
            {netCashFlow >= 0 ? '+' : ''}
            {formatPrivateAmount(netCashFlow, currencySymbol)}
          </span>
          <span className="text-[10px] font-bold text-neutral-500 mt-1 truncate">
            {netCashFlow >= 0 ? 'Positive savings rate' : 'Net deficit this period'}
          </span>
        </div>
      </div>

      {/* Main Grid: Left = Donut & Category List (Screenshot 1), Right = Daily Flow & Day Calendar Matrix (Screenshot 5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Column: Donut & Category Breakdown List (Screenshot 1) */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          <div className="bg-white border-[3px] border-[#121212] shadow-neo p-5 sm:p-6 flex flex-col gap-6">
            
            <div className="flex items-center justify-between border-b-2 border-[#121212] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-[#FFE600] border-2 border-[#121212] flex items-center justify-center font-black">
                  <PieChartIcon size={16} />
                </div>
                <h3 className="text-sm font-black uppercase text-[#121212] tracking-wider">
                  Category Spending Share
                </h3>
              </div>
              <span className="text-xs font-mono font-black text-neutral-500">
                {categoryStats.length} Categories
              </span>
            </div>

            {/* Donut Chart */}
            {totalExpense === 0 ? (
              <div className="h-48 flex items-center justify-center text-xs font-bold text-neutral-500">
                No expense transactions recorded for {monthLabel}.
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-2">
                <div className="relative w-48 h-48 sm:w-56 sm:h-56">
                  {/* SVG Donut */}
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      fill="transparent"
                      stroke="#E5E7EB"
                      strokeWidth="16"
                    />
                    {donutSlices.map((slice) => {
                      const circumference = 2 * Math.PI * 38;
                      const strokeDasharray = `${(slice.percentage / 100) * circumference} ${circumference}`;
                      const strokeDashoffset = -((slice.startPercent / 100) * circumference);

                      return (
                        <circle
                          key={slice.name}
                          cx="50"
                          cy="50"
                          r="38"
                          fill="transparent"
                          stroke={slice.color}
                          strokeWidth="16"
                          strokeDasharray={strokeDasharray}
                          strokeDashoffset={strokeDashoffset}
                          className="transition-all duration-300 hover:opacity-85 cursor-pointer"
                        />
                      );
                    })}
                  </svg>

                  {/* Donut Center Label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                    <span className="text-[10px] font-black uppercase text-neutral-400">
                      TOTAL SPENT
                    </span>
                    <span className="text-sm sm:text-base font-mono font-black text-[#121212] leading-tight px-2 truncate max-w-[120px]">
                      {formatPrivateAmount(totalExpense, currencySymbol)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Category Breakdown List with Progress Bars & Percentage Badges */}
            <div className="flex flex-col gap-3 pt-2">
              {categoryStats.map((cat) => (
                <div
                  key={cat.name}
                  className="p-3 bg-neutral-50 border-2 border-[#121212] hover:bg-neutral-100 transition-colors flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-4 h-4 border-2 border-[#121212] shrink-0 shadow-neo-sm"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-xs font-black uppercase text-[#121212] truncate">
                        {cat.name}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-neutral-500 shrink-0">
                        ({cat.count})
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-1.5 py-0.5 text-[10px] font-mono font-black bg-white border border-[#121212] text-[#121212] shadow-neo-sm">
                        {cat.percentage}%
                      </span>
                      <span className="text-xs font-mono font-black text-[#121212]">
                        {formatPrivateAmount(cat.total, currencySymbol)}
                      </span>
                    </div>
                  </div>

                  {/* Horizontal Bar matching MyMoney Screenshot 1 */}
                  <div className="w-full h-2.5 bg-white border border-[#121212] p-[1px]">
                    <div
                      className="h-full border-r border-[#121212] transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.max(2, cat.percentage))}%`,
                        backgroundColor: cat.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* Right Column: Daily Flow Curve + 7-Day Calendar Matrix (Screenshot 5) */}
        <div className="lg:col-span-6 flex flex-col gap-6">

          {/* Daily Expense Flow Line Graph */}
          <div className="bg-white border-[3px] border-[#121212] shadow-neo p-5 sm:p-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between border-b-2 border-[#121212] pb-3 gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-[#00F0FF] border-2 border-[#121212] flex items-center justify-center font-black shadow-neo-sm">
                  <Activity size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-[#121212] tracking-wider leading-none">
                    Daily Expense Flow
                  </h3>
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">
                    Day-by-day cash outflows
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] sm:text-[11px] font-mono font-bold bg-[#FFF1F1] text-[#FF4343] px-2.5 py-1 border-2 border-[#121212] shadow-neo-sm">
                  Peak: {formatPrivateAmount(flowCurvePoints.maxAmount, currencySymbol)}
                </span>
                {flowCurvePoints.average > 0 && (
                  <span className="text-[10px] sm:text-[11px] font-mono font-bold bg-[#FFE600] text-[#121212] px-2.5 py-1 border-2 border-[#121212] shadow-neo-sm hidden sm:inline-block">
                    Avg: {formatPrivateAmount(Math.round(flowCurvePoints.average), currencySymbol)}/day
                  </span>
                )}
              </div>
            </div>

            {/* Professional Recharts Line Graph with Neo-Brutalist styling */}
            <div className="h-48 sm:h-56 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={flowChartData}
                  margin={{ top: 10, right: 12, left: -16, bottom: 0 }}
                  onClick={(e: any) => {
                    if (e && e.activePayload && e.activePayload[0]) {
                      setSelectedDay(e.activePayload[0].payload.day);
                    }
                  }}
                >
                  <defs>
                    <linearGradient id="expenseFlowGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF4343" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#FF4343" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={{ stroke: '#121212', strokeWidth: 1.5 }}
                    tick={{ fontSize: 10, fill: '#737373', fontFamily: 'monospace', fontWeight: 700 }}
                    ticks={[1, 5, 10, 15, 20, 25, daysInMonth]}
                    tickFormatter={(v) => `D${v}`}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: '#737373', fontFamily: 'monospace', fontWeight: 700 }}
                    tickFormatter={(v) => {
                      if (v >= 1000) return `${currencySymbol}${(v / 1000).toFixed(0)}k`;
                      return `${currencySymbol}${v}`;
                    }}
                    width={44}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white border-2 border-[#121212] shadow-neo p-2.5 min-w-[140px] z-50">
                            <div className="text-[10px] font-black uppercase text-neutral-500 tracking-wider">
                              {data.weekday}, {data.shortDate}
                            </div>
                            <div className="text-sm font-mono font-black text-[#FF4343] mt-0.5">
                              {formatPrivateAmount(data.amount, currencySymbol)}
                            </div>
                            <div className="text-[10px] font-bold text-neutral-600 mt-0.5">
                              {data.count > 0
                                ? `${data.count} transaction${data.count > 1 ? 's' : ''}`
                                : 'Zero spending'}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#FF4343"
                    strokeWidth={2.5}
                    fill="url(#expenseFlowGrad)"
                    activeDot={{
                      r: 6,
                      stroke: '#121212',
                      strokeWidth: 2,
                      fill: '#FFE600',
                    }}
                    dot={(dotProps: any) => {
                      const { cx, cy, payload } = dotProps;
                      if (payload.amount > 0) {
                        const isSelected = selectedDay === payload.day;
                        return (
                          <circle
                            key={`dot-${payload.day}`}
                            cx={cx}
                            cy={cy}
                            r={isSelected ? 5.5 : 3.5}
                            fill={isSelected ? '#FFE600' : '#FF4343'}
                            stroke="#121212"
                            strokeWidth={isSelected ? 2.5 : 1.5}
                            className="cursor-pointer transition-all hover:scale-125"
                          />
                        );
                      }
                      return null;
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono font-bold text-neutral-500 border-t-2 border-[#121212] pt-2">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#FF4343] inline-block" />
                <span>Click any point or day to inspect specific day</span>
              </span>
              <span>
                {flowCurvePoints.activeDays} of {daysInMonth} days active
              </span>
            </div>
          </div>

          {/* 7-Day Weekday Calendar Matrix (Screenshot 5 Bottom) */}
          <div className="bg-white border-[3px] border-[#121212] shadow-neo p-5 sm:p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b-2 border-[#121212] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-[#05DF72] border-2 border-[#121212] flex items-center justify-center font-black">
                  <CalendarIcon size={16} />
                </div>
                <h3 className="text-sm font-black uppercase text-[#121212] tracking-wider">
                  Spending Calendar Matrix
                </h3>
              </div>
              <span className="text-[10px] font-bold text-neutral-500">
                Click any day to inspect
              </span>
            </div>

            {/* Responsive Calendar Matrix Wrapper */}
            <div className="overflow-x-auto no-scrollbar touch-scroll">
              <div className="min-w-[280px] flex flex-col gap-1">
                {/* Weekday headers: Sun, Mon, Tue, Wed, Thu, Fri, Sat */}
                <div className="grid grid-cols-7 gap-1 text-center">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                    <div
                      key={d}
                      className={`py-1 text-[10px] sm:text-[11px] font-black uppercase border border-[#121212] ${
                        i === 0 || i === 6 ? 'bg-neutral-100 text-neutral-600' : 'bg-[#121212] text-white'
                      }`}
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Matrix Cells */}
                <div className="flex flex-col gap-1">
                  {calendarWeeks.map((week, wIdx) => (
                    <div key={wIdx} className="grid grid-cols-7 gap-1">
                      {week.map((cell, cIdx) => {
                        if (cell.day === null) {
                          return (
                            <div
                              key={`empty-${cIdx}`}
                              className="min-h-[46px] sm:min-h-[52px] bg-neutral-50/50 border border-neutral-200"
                            />
                          );
                        }

                        const isToday = isCurrentMonth && cell.day === todayDate;
                        const isSelected = selectedDay === cell.day;
                        const hasSpend = cell.amount > 0;

                        return (
                          <button
                            key={`day-${cell.day}`}
                            onClick={() => setSelectedDay(selectedDay === cell.day ? null : cell.day)}
                            className={`min-h-[46px] sm:min-h-[52px] p-1 border text-left flex flex-col justify-between transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#FFE600] border-2 border-[#121212] shadow-neo-sm scale-[1.03] z-10'
                                : isToday
                                ? 'bg-[#00F0FF]/15 border-2 border-[#00F0FF]'
                                : hasSpend
                                ? 'bg-white border-[#121212] hover:bg-neutral-50'
                                : 'bg-white border-neutral-200 hover:border-[#121212]'
                            }`}
                          >
                            <span
                              className={`text-[9px] sm:text-[10px] font-mono font-black ${
                                isToday ? 'bg-[#121212] text-white px-1 py-0.2 rounded-none' : 'text-neutral-800'
                              }`}
                            >
                              {cell.day}
                            </span>

                            {hasSpend ? (
                              <span className="text-[8.5px] sm:text-[10px] font-mono font-black text-[#FF4343] leading-none truncate">
                                -{formatPrivateAmount(cell.amount, currencySymbol)}
                              </span>
                            ) : (
                              <span className="text-[9px] text-neutral-300 font-mono">-</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Day Inspection Drawer */}
            {selectedDay !== null && (
              <div className="p-4 bg-[#FFE600] border-[3px] border-[#121212] shadow-neo flex flex-col gap-3 animate-in fade-in duration-100">
                <div className="flex items-center justify-between border-b-2 border-[#121212] pb-2">
                  <span className="text-xs font-black uppercase text-[#121212] flex items-center gap-1.5">
                    <CalendarIcon size={14} />
                    Transactions on {monthLabel} {selectedDay}
                  </span>
                  <button
                    onClick={() => setSelectedDay(null)}
                    className="text-xs font-black px-2 py-0.5 bg-[#121212] text-white hover:bg-neutral-800 cursor-pointer"
                  >
                    Close ✕
                  </button>
                </div>

                {selectedDayTransactions.length === 0 ? (
                  <p className="text-xs font-bold text-neutral-800">
                    No transactions recorded on this day.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                    {selectedDayTransactions.map((tx) => (
                      <div
                        key={tx._id}
                        className="p-2 bg-white border-2 border-[#121212] flex items-center justify-between text-xs shadow-neo-sm"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-black text-[#121212] truncate">{tx.title}</span>
                          <span className="text-[10px] font-bold text-neutral-500 uppercase">
                            {tx.category} • {tx.type.toUpperCase()}
                          </span>
                        </div>
                        <span
                          className={`font-mono font-black shrink-0 ${
                            tx.type === 'expense'
                              ? 'text-[#FF4343]'
                              : tx.type === 'income'
                              ? 'text-[#05DF72]'
                              : 'text-[#00F0FF]'
                          }`}
                        >
                          {tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : ''}
                          {formatPrivateAmount(tx.amount, currencySymbol)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
};
