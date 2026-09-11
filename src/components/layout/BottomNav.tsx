import React from 'react';
import { LayoutDashboard, ArrowLeftRight, Wallet, CalendarSync, PieChart, Settings, Plus, TrendingUp } from 'lucide-react';
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
  const items = [
    { id: 'overview' as NavTab, label: 'Home', icon: LayoutDashboard },
    { id: 'expenses' as NavTab, label: 'Expenses', icon: ArrowLeftRight },
    { id: 'investments' as NavTab, label: 'Invest', icon: TrendingUp },
    { id: 'settings' as NavTab, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="app-bottom-nav md:hidden" aria-label="Mobile Navigation">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            className={clsx(
              'app-bottom-nav-item',
              isActive && 'active'
            )}
            title={item.label}
          >
            <span className="nav-icon">
              <Icon size={20} strokeWidth={isActive ? 3 : 2} />
            </span>
            <span className="nav-label">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};
