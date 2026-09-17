import React from 'react';
import { Plus, LogOut, User, Eye, EyeOff, RefreshCw, Bell } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { NeoButton } from '../ui/NeoButton';
import { useAuthActions } from '@convex-dev/auth/react';
import { usePrivacy } from '../../context/PrivacyContext';
import { UserProfile } from '../../types';

interface HeaderProps {
  user?: UserProfile | null;
  alertCount?: number;
  onOpenNotifications?: () => void;
  onOpenTransactionModal: () => void;
  onOpenPinSetup: () => void;
  onRefresh?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  alertCount = 0,
  onOpenNotifications,
  onOpenTransactionModal,
  onOpenPinSetup: _onOpenPinSetup,
  onRefresh,
}) => {
  const { signOut } = useAuthActions();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <BrandLogo size="md" showSubtitle={false} compactOnMobile={true} />
        </div>

        <div className="flex items-center gap-1 min-[400px]:gap-1.5 sm:gap-2 shrink-0">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="w-7 h-7 min-[400px]:w-8 min-[400px]:h-8 sm:w-9 sm:h-9 bg-[#00F0FF] hover:bg-[#38F4FF] text-[#121212] border-2 border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex items-center justify-center shrink-0"
              title="Refresh"
            >
              <RefreshCw size={13} strokeWidth={2.5} />
            </button>
          )}

          <button
            onClick={togglePrivacyMode}
            title={isPrivacyMode ? 'Show Balances' : 'Hide Balances'}
            className={`w-7 h-7 min-[400px]:w-8 min-[400px]:h-8 sm:w-9 sm:h-9 border-2 border-[#121212] transition-all cursor-pointer flex items-center justify-center shrink-0 ${
              isPrivacyMode
                ? 'bg-[#121212] text-[#FFE600] shadow-neo-sm'
                : 'bg-[#FFE600] text-[#121212] shadow-neo-sm hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-neo'
            }`}
          >
            {isPrivacyMode ? <EyeOff size={13} strokeWidth={2.5} /> : <Eye size={13} strokeWidth={2.5} />}
          </button>

          {onOpenNotifications && (
            <button
              onClick={onOpenNotifications}
              title={alertCount > 0 ? `${alertCount} budget alert(s) reached! Tap to add money.` : 'Notifications & Alerts'}
              className={`relative w-7 h-7 min-[400px]:w-8 min-[400px]:h-8 sm:w-9 sm:h-9 border-2 border-[#121212] transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                alertCount > 0
                  ? 'bg-[#FF8800] text-[#121212] shadow-neo-sm hover:bg-[#FFA333]'
                  : 'bg-white hover:bg-neutral-100 text-[#121212] shadow-neo-sm'
              }`}
            >
              <Bell size={13} strokeWidth={2.5} className={alertCount > 0 ? 'animate-bounce' : ''} />
              {alertCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-[#FF4343] text-white text-[9px] font-mono font-black rounded-full min-w-3.5 h-3.5 px-0.5 flex items-center justify-center border border-[#121212] shadow-neo-sm">
                  {alertCount}
                </span>
              )}
            </button>
          )}

          <NeoButton
            variant="secondary"
            size="sm"
            onClick={onOpenTransactionModal}
            className="flex items-center gap-1 px-1.5 min-[400px]:px-2.5 sm:px-3 py-1 sm:py-1.5 shrink-0 h-7 min-[400px]:h-8 sm:h-9"
          >
            <Plus size={15} strokeWidth={3} />
            <span className="hidden md:inline text-xs">Add Transaction</span>
          </NeoButton>

          <div className="flex items-center gap-1 sm:gap-1.5 pl-1 sm:pl-1.5 border-l-2 border-neutral-300 shrink-0">
            {user?.image ? (
              <img src={user.image} alt={user.name || 'User'} className="w-7 h-7 min-[400px]:w-8 min-[400px]:h-8 sm:w-9 sm:h-9 rounded-none border-2 border-[#121212] shadow-neo-sm object-cover" />
            ) : (
              <div className="w-7 h-7 min-[400px]:w-8 min-[400px]:h-8 sm:w-9 sm:h-9 bg-[#00F0FF] border-2 border-[#121212] shadow-neo-sm flex items-center justify-center font-black text-xs">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : <User size={13} />}
              </div>
            )}
            <button
              onClick={() => {
                void signOut();
              }}
              title="Sign Out"
              className="w-7 h-7 min-[400px]:w-8 min-[400px]:h-8 sm:w-9 sm:h-9 hover:bg-[#FF4343] hover:text-white border-2 border-transparent hover:border-[#121212] transition-colors cursor-pointer flex items-center justify-center shrink-0"
            >
              <LogOut size={13} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
