import React, { Suspense } from 'react';
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
}

export const PortfolioTrendChart: React.FC<TrendChartProps> = ({ investments }) => {
  // Simulate monthly trend based on current holdings
  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const data = months.map((month, i) => {
    const factor = 1 + i * 0.05;
    return {
      month,
      invested: Math.round(investments.reduce((s, inv) => s + inv.investedAmount, 0) * factor * 0.8),
      current: Math.round(investments.reduce((s, inv) => s + inv.currentValue, 0) * factor),
    };
  });

  return (
    <div className="bg-white border-[3px] border-[#121212] shadow-neo p-4 sm:p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between border-b-2 border-[#121212] pb-3">
        <h3 className="text-xs font-black uppercase text-[#121212] tracking-wider">
          Portfolio Growth Trend
        </h3>
        <div className="flex items-center gap-4 text-[11px] font-bold">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-[#05DF72] border border-[#121212]" />
            <span>Current Value</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-[#FFE600] border border-[#121212]" />
            <span>Invested</span>
          </div>
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#121212" opacity={0.2} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#121212', fontWeight: 700 }} />
            <YAxis tick={{ fontSize: 11, fill: '#121212', fontWeight: 700 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
            <Tooltip
              contentStyle={{
                background: '#121212',
                border: '2px solid #FFE600',
                color: '#FFF',
                fontWeight: 700,
                fontSize: '12px',
              }}
              formatter={(value: number) => [`₹${value.toLocaleString()}`, '']}
            />
            <Area type="monotone" dataKey="current" stroke="#05DF72" fill="#05DF72" fillOpacity={0.2} strokeWidth={2} name="Current Value" />
            <Area type="monotone" dataKey="invested" stroke="#FFE600" fill="#FFE600" fillOpacity={0.1} strokeWidth={2} name="Invested" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
