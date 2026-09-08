import React from 'react';
import { Plus, LogOut, User, Eye, EyeOff, RefreshCw, Settings } from 'lucide-react';
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
    <header className="app-header">
      <div className="app-header-inner">
        <BrandLogo size="md" showSubtitle={false} />

        <div className="flex items-center gap-2 sm:gap-3">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="w-11 h-11 bg-[#00F0FF] hover:bg-[#38F4FF] text-[#121212] border-2 border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer rounded-xl flex items-center justify-center"
              title="Refresh"
            >
              <RefreshCw size={18} strokeWidth={2.5} />
            </button>
          )}

          <button
            onClick={togglePrivacyMode}
            title={isPrivacyMode ? 'Show Balances' : 'Hide Balances'}
            className={`w-11 h-11 border-2 border-[#121212] transition-all cursor-pointer rounded-xl flex items-center justify-center ${
              isPrivacyMode
                ? 'bg-[#121212] text-[#FFE600] shadow-neo-sm'
                : 'bg-[#FFE600] text-[#121212] shadow-neo-sm hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-neo'
            }`}
          >
            {isPrivacyMode ? <EyeOff size={18} strokeWidth={2.5} /> : <Eye size={18} strokeWidth={2.5} />}
          </button>

          <NeoButton variant="secondary" size="sm" onClick={onOpenTransactionModal} className="flex items-center gap-2">
            <Plus size={18} strokeWidth={3} />
            <span className="hidden sm:inline">Add Transaction</span>
          </NeoButton>

          <div className="flex items-center gap-2 pl-2 border-l-2 border-neutral-300">
            {user?.image ? (
              <img src={user.image} alt={user.name || 'User'} className="w-9 h-9 rounded-none border-2 border-[#121212] shadow-neo-sm object-cover" />
            ) : (
              <div className="w-9 h-9 bg-[#00F0FF] border-2 border-[#121212] shadow-neo-sm flex items-center justify-center font-black text-xs rounded-xl">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : <User size={16} />}
              </div>
            )}
            <button
              onClick={() => { sessionStorage.removeItem('panam_welcome_celebrated'); void signOut(); }}
              title="Sign Out"
              className="w-9 h-9 hover:bg-[#FF4343] hover:text-white border-2 border-transparent hover:border-[#121212] transition-colors cursor-pointer rounded-xl flex items-center justify-center"
            >
              <LogOut size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
