import React from 'react';
import { Plus, LogOut, User, Eye, EyeOff, RefreshCw, Settings, WifiOff, CloudUpload } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { NeoButton } from '../ui/NeoButton';
import { useAuthActions } from '@convex-dev/auth/react';
import { usePrivacy } from '../../context/PrivacyContext';
import { useOffline } from '../../context/OfflineContext';
import { offlineStorage } from '../../utils/offlineStorage';
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
  const { isOnline, isSyncing, pendingCount } = useOffline();

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="flex items-center gap-2 min-w-0">
          <BrandLogo size="md" showSubtitle={false} />

          {/* Offline / Sync Status Badge */}
          {!isOnline && (
            <div
              className="flex items-center gap-1 px-2 py-1 bg-[#FFE600] text-[#121212] border-2 border-[#121212] shadow-neo-sm text-[10px] font-black uppercase shrink-0 animate-pulse"
              title="You are offline. All transactions and budgets are saved locally and will auto-sync when online."
            >
              <WifiOff size={12} strokeWidth={3} />
              <span className="hidden xs:inline">Offline</span>
            </div>
          )}

          {isOnline && isSyncing && (
            <div
              className="flex items-center gap-1 px-2 py-1 bg-[#00F0FF] text-[#121212] border-2 border-[#121212] shadow-neo-sm text-[10px] font-black uppercase shrink-0"
              title="Syncing local changes to cloud database..."
            >
              <RefreshCw size={12} strokeWidth={3} className="animate-spin" />
              <span className="hidden xs:inline">Syncing...</span>
            </div>
          )}

          {isOnline && !isSyncing && pendingCount > 0 && (
            <div
              className="flex items-center gap-1 px-2 py-1 bg-[#2EE59D] text-[#121212] border-2 border-[#121212] shadow-neo-sm text-[10px] font-black uppercase shrink-0"
              title={`${pendingCount} change(s) ready to sync`}
            >
              <CloudUpload size={12} strokeWidth={3} />
              <span>{pendingCount} queued</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="w-8 h-8 sm:w-10 sm:h-10 bg-[#00F0FF] hover:bg-[#38F4FF] text-[#121212] border-2 border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer rounded-xl flex items-center justify-center shrink-0"
              title="Refresh"
            >
              <RefreshCw size={15} strokeWidth={2.5} />
            </button>
          )}

          <button
            onClick={togglePrivacyMode}
            title={isPrivacyMode ? 'Show Balances' : 'Hide Balances'}
            className={`w-8 h-8 sm:w-10 sm:h-10 border-2 border-[#121212] transition-all cursor-pointer rounded-xl flex items-center justify-center shrink-0 ${
              isPrivacyMode
                ? 'bg-[#121212] text-[#FFE600] shadow-neo-sm'
                : 'bg-[#FFE600] text-[#121212] shadow-neo-sm hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-neo'
            }`}
          >
            {isPrivacyMode ? <EyeOff size={15} strokeWidth={2.5} /> : <Eye size={15} strokeWidth={2.5} />}
          </button>

          <NeoButton variant="secondary" size="sm" onClick={onOpenTransactionModal} className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 shrink-0">
            <Plus size={16} strokeWidth={3} />
            <span className="hidden sm:inline text-xs">Add Transaction</span>
          </NeoButton>

          <div className="flex items-center gap-1.5 sm:gap-2 pl-1.5 sm:pl-2 border-l-2 border-neutral-300 shrink-0">
            {user?.image ? (
              <img src={user.image} alt={user.name || 'User'} className="w-8 h-8 sm:w-9 sm:h-9 rounded-none border-2 border-[#121212] shadow-neo-sm object-cover" />
            ) : (
              <div className="w-8 h-8 sm:w-9 sm:h-9 bg-[#00F0FF] border-2 border-[#121212] shadow-neo-sm flex items-center justify-center font-black text-xs rounded-xl">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : <User size={14} />}
              </div>
            )}
            <button
              onClick={() => {
                sessionStorage.removeItem('panam_welcome_celebrated');
                offlineStorage.clearActiveSession();
                void signOut();
              }}
              title="Sign Out"
              className="w-8 h-8 sm:w-9 sm:h-9 hover:bg-[#FF4343] hover:text-white border-2 border-transparent hover:border-[#121212] transition-colors cursor-pointer rounded-xl flex items-center justify-center shrink-0"
            >
              <LogOut size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
