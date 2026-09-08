import React from 'react';
import { Plus, LogOut, User, Eye, EyeOff, RefreshCw, Bell, Settings } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { NeoButton } from '../ui/NeoButton';
import { useAuthActions } from '@convex-dev/auth/react';
import { usePrivacy } from '../../context/PrivacyContext';
import { UserProfile } from '../../types';

interface HeaderProps {
  user?: UserProfile | null;
  onOpenTransactionModal: () => void;
  onOpenPinSetup: () => void;
  onRefresh?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  onOpenTransactionModal,
  onOpenPinSetup,
  onRefresh,
}) => {
  const { signOut } = useAuthActions();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();

  return (
    <header className="w-full bg-white border-b-[3px] border-[#121212] px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30 shadow-neo-sm">
      
      {/* Brand Logo */}
      <div className="flex items-center gap-4">
        <BrandLogo size="md" showSubtitle={false} />
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        
        {/* Refresh Button */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="p-2 bg-[#00F0FF] hover:bg-[#38F4FF] text-[#121212] border-2 border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw size={16} strokeWidth={2.5} />
          </button>
        )}

        {/* Notifications Bell */}
        <button
          className="p-2 bg-white hover:bg-[#FFE600] border-2 border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer relative"
          title="Notifications"
        >
          <Bell size={16} strokeWidth={2.5} />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#FF4343] border-2 border-[#121212]" />
        </button>

        {/* Global Privacy Eye Toggle Button (Icon-Only) */}
        <button
          onClick={togglePrivacyMode}
          title={isPrivacyMode ? 'Show Balances' : 'Hide Balances'}
          className={`p-2 border-2 border-[#121212] transition-all cursor-pointer flex items-center justify-center ${
            isPrivacyMode
              ? 'bg-[#121212] text-[#FFE600] shadow-none'
              : 'bg-[#FFE600] text-[#121212] shadow-neo-sm hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-neo'
          }`}
        >
          {isPrivacyMode ? <EyeOff size={16} strokeWidth={2.5} /> : <Eye size={16} strokeWidth={2.5} />}
        </button>

        {/* Add Transaction Button */}
        <NeoButton
          variant="secondary"
          size="sm"
          onClick={onOpenTransactionModal}
          className="flex items-center gap-1.5"
        >
          <Plus size={16} strokeWidth={3} />
          <span className="hidden sm:inline">Add Transaction</span>
          <span className="sm:hidden">Add</span>
        </NeoButton>

        {/* User Badge / Avatar & Sign Out */}
        <div className="flex items-center gap-2 pl-2 border-l-2 border-neutral-300">
          {user?.image ? (
            <img
              src={user.image}
              alt={user.name || 'User'}
              className="w-8 h-8 rounded-none border-2 border-[#121212] shadow-neo-sm object-cover"
            />
          ) : (
            <div className="w-8 h-8 bg-[#00F0FF] border-2 border-[#121212] shadow-neo-sm flex items-center justify-center font-black text-xs">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : <User size={14} />}
            </div>
          )}

          <button
            onClick={() => {
              sessionStorage.removeItem('panam_welcome_celebrated');
              void signOut();
            }}
            title="Sign Out"
            className="p-1.5 hover:bg-[#FF4343] hover:text-white border-2 border-transparent hover:border-[#121212] transition-colors cursor-pointer"
          >
            <LogOut size={16} strokeWidth={2.5} />
          </button>
        </div>

      </div>
    </header>
  );
};
