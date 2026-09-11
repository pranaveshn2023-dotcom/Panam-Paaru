import React from 'react';
import { LayoutDashboard, ArrowLeftRight, Wallet, CalendarSync, PieChart, Settings, Eye, EyeOff, TrendingUp } from 'lucide-react';
import { clsx } from 'clsx';
import { FinancialStats } from '../../types';
import { usePrivacy } from '../../context/PrivacyContext';

export type NavTab = 'overview' | 'expenses' | 'investments' | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  stats?: FinancialStats | null;
  currencySymbol?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  stats,
  currencySymbol = '₹',
}) => {
  const { isPrivacyMode, togglePrivacyMode, formatPrivateAmount } = usePrivacy();

  const navItems: { id: NavTab; label: string; icon: React.FC<{ size?: number; className?: string }>; color: string }[] = [
    { id: 'overview', label: 'Home', icon: LayoutDashboard, color: '#FFE600' },
    { id: 'expenses', label: 'Expenses & Flow', icon: ArrowLeftRight, color: '#00F0FF' },
    { id: 'investments', label: 'Investments', icon: TrendingUp, color: '#05DF72' },
    { id: 'settings', label: 'Settings & Security', icon: Settings, color: '#9B51E0' },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 bg-white border-r-[3px] border-[#121212] p-4 shrink-0 min-h-[calc(100vh-65px)] justify-between select-none">
      {/* Navigation Items */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-mono font-bold tracking-widest text-neutral-500 uppercase px-2 mb-1">
          NAVIGATION
        </span>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={clsx(
                'flex items-center gap-3 px-3.5 py-3 text-xs font-black uppercase tracking-wider border-2 border-[#121212] transition-all cursor-pointer text-left',
                isActive
                  ? 'bg-[#121212] text-white shadow-neo translate-x-1'
                  : 'bg-white text-[#121212] hover:bg-[#FFFDF5] hover:translate-x-0.5 shadow-none'
              )}
            >
              <div
                className="w-6 h-6 border border-[#121212] flex items-center justify-center shrink-0"
                style={{ backgroundColor: isActive ? item.color : '#FFFDF5' }}
              >
                <Icon size={14} className={isActive ? 'text-[#121212]' : 'text-neutral-700'} />
              </div>
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Live Net Balance Widget with Eye Toggle */}
      <div className="flex flex-col gap-3 pt-4 border-t-2 border-neutral-200">
        <div className="p-3 bg-[#05DF72] border-2 border-[#121212] shadow-neo-sm flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-[#121212]">
              NET BALANCE
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={togglePrivacyMode}
                title={isPrivacyMode ? 'Show Balances' : 'Hide Balances'}
                className="p-0.5 hover:bg-black/10 transition-colors cursor-pointer"
              >
                {isPrivacyMode ? <EyeOff size={12} className="text-[#121212]" /> : <Eye size={12} className="text-[#121212]" />}
              </button>
              <span className="text-[9px] font-mono font-bold bg-[#121212] text-[#05DF72] px-1">
                LIVE
              </span>
            </div>
          </div>
          <div className="text-xl font-mono font-black text-[#121212]">
            {formatPrivateAmount(stats?.totalBalance ?? 0, currencySymbol)}
          </div>
          <div className="flex items-center justify-between text-[10px] font-bold text-neutral-800 pt-1 border-t border-[#121212]/30">
            <span>SAVINGS RATE</span>
            <span className="font-mono font-black">{isPrivacyMode ? '••' : `${stats?.savingsRate ?? 0}%`}</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
