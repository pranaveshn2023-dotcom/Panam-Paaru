import React from 'react';
import { LayoutDashboard, ArrowLeftRight, CalendarSync, PieChart, Settings, Plus, TrendingUp, Target, Briefcase } from 'lucide-react';
import { clsx } from 'clsx';
import { NavTab } from './Sidebar';

interface BottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenAddModal: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  onOpenAddModal,
}) => {
  const leftNavItems = [
    { id: 'overview' as NavTab, label: 'Home', icon: LayoutDashboard },
    { id: 'transactions' as NavTab, label: 'Trans.', icon: ArrowLeftRight },
    { id: 'budgets' as NavTab, label: 'Budgets', icon: CalendarSync },
  ];

  const rightNavItems = [
    { id: 'investments' as NavTab, label: 'Invest', icon: TrendingUp },
    { id: 'insights' as NavTab, label: 'Trends', icon: PieChart },
    { id: 'settings' as NavTab, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t-[3px] border-[#121212] px-1 py-1.5 flex items-center justify-around shadow-neo-lg select-none">
      {leftNavItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            className={clsx(
              'flex flex-col items-center justify-center p-1 min-w-[44px] transition-all cursor-pointer',
              isActive
                ? 'bg-[#FFE600] border-2 border-[#121212] shadow-neo-sm font-black'
                : 'text-neutral-700 font-bold border-2 border-transparent'
            )}
          >
            <Icon size={16} strokeWidth={isActive ? 3 : 2} />
            <span className="text-[9px] uppercase tracking-tighter mt-0.5">
              {item.label}
            </span>
          </button>
        );
      })}

      {/* Center Floating Action Button (+) */}
      <button
        onClick={onOpenAddModal}
        className="w-11 h-11 -mt-4 bg-[#05DF72] hover:bg-[#2EE59D] text-[#121212] border-[3px] border-[#121212] shadow-neo flex items-center justify-center active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer shrink-0"
        title="Quick Add"
      >
        <Plus size={22} strokeWidth={3.5} />
      </button>

      {rightNavItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            className={clsx(
              'flex flex-col items-center justify-center p-1 min-w-[44px] transition-all cursor-pointer',
              isActive
                ? 'bg-[#FFE600] border-2 border-[#121212] shadow-neo-sm font-black'
                : 'text-neutral-700 font-bold border-2 border-transparent'
            )}
          >
            <Icon size={16} strokeWidth={isActive ? 3 : 2} />
            <span className="text-[9px] uppercase tracking-tighter mt-0.5">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
