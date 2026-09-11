import React, { useState } from 'react';
import { Wallet, WalletType } from '../../types';
import { usePrivacy } from '../../context/PrivacyContext';
import {
  Building2,
  Banknote,
  CreditCard,
  Wallet as WalletIcon,
  PiggyBank,
  TrendingUp,
  MoreVertical,
  ArrowRightLeft,
  Edit,
  Trash2,
  Check,
  Star,
} from 'lucide-react';

interface WalletCardProps {
  wallet: Wallet;
  onEdit: (wallet: Wallet) => void;
  onDelete: (id: string) => void;
  onTransfer: (wallet: Wallet) => void;
  currencySymbol?: string;
}

export const getWalletIcon = (type: WalletType, size = 20, className = '') => {
  switch (type) {
    case 'bank':
      return <Building2 size={size} className={className} />;
    case 'cash':
      return <Banknote size={size} className={className} />;
    case 'card':
      return <CreditCard size={size} className={className} />;
    case 'savings':
      return <PiggyBank size={size} className={className} />;
    case 'investment':
      return <TrendingUp size={size} className={className} />;
    case 'wallet':
    default:
      return <WalletIcon size={size} className={className} />;
  }
};

export const getWalletTypeLabel = (type: WalletType): string => {
  switch (type) {
    case 'bank':
      return 'Bank Account';
    case 'cash':
      return 'Cash in Hand';
    case 'card':
      return 'Card / Credit';
    case 'savings':
      return 'Savings Pocket';
    case 'investment':
      return 'Investment Demat';
    case 'wallet':
    default:
      return 'Digital Wallet / UPI';
  }
};

export const WalletCard: React.FC<WalletCardProps> = ({
  wallet,
  onEdit,
  onDelete,
  onTransfer,
  currencySymbol = '₹',
}) => {
  const { isPrivacyMode, formatPrivateAmount } = usePrivacy();
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="bg-white border-[3px] border-[#121212] shadow-neo p-4 sm:p-5 flex flex-col justify-between gap-4 hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-neo-lg transition-all relative select-none">
      
      {/* Card Header: Icon, Name, Type, and Quick Menu */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-12 h-12 border-2 border-[#121212] shadow-neo-sm flex items-center justify-center shrink-0"
            style={{ backgroundColor: wallet.color || '#FFE600' }}
          >
            {getWalletIcon(wallet.type, 22, 'text-[#121212]')}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-neutral-100 border border-neutral-300 text-neutral-700">
                {getWalletTypeLabel(wallet.type)}
              </span>
              {wallet.isDefault && (
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-[#FFE600] border border-[#121212] text-[#121212] flex items-center gap-1">
                  <Star size={10} fill="#121212" /> Primary
                </span>
              )}
            </div>
            <h3 className="text-base font-black uppercase text-[#121212] tracking-tight truncate mt-0.5">
              {wallet.name}
            </h3>
            {wallet.accountNumberLast4 && (
              <span className="text-[11px] font-mono font-bold text-neutral-500">
                •••• {wallet.accountNumberLast4}
              </span>
            )}
          </div>
        </div>

        {/* Action Menu Toggle */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 bg-neutral-100 hover:bg-[#FFE600] border border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            title="Wallet Options"
          >
            <MoreVertical size={16} strokeWidth={2.5} />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-9 w-40 bg-white border-2 border-[#121212] shadow-neo z-30 flex flex-col py-1 text-xs font-bold divide-y divide-neutral-100">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onTransfer(wallet);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-left hover:bg-[#FFFDF5] text-[#121212] cursor-pointer"
                >
                  <ArrowRightLeft size={14} className="text-[#00F0FF]" />
                  <span>Transfer Funds</span>
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onEdit(wallet);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-left hover:bg-[#FFFDF5] text-[#121212] cursor-pointer"
                >
                  <Edit size={14} />
                  <span>Edit Account</span>
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false);
                    if (confirm(`Delete wallet "${wallet.name}"?`)) onDelete(wallet._id);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-left hover:bg-[#FFF0F0] text-[#FF4343] cursor-pointer"
                >
                  <Trash2 size={14} />
                  <span>Delete Wallet</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Balance Display */}
      <div className="pt-2 border-t border-neutral-200">
        <span className="text-[10px] font-black uppercase text-neutral-500 block">
          CURRENT LIQUID BALANCE
        </span>
        <span
          className={`text-2xl font-mono font-black ${
            wallet.balance < 0 ? 'text-[#FF4343]' : 'text-[#121212]'
          }`}
        >
          {isPrivacyMode ? '••••••' : formatPrivateAmount(wallet.balance, currencySymbol)}
        </span>
        {wallet.notes && (
          <p className="text-[11px] font-medium text-neutral-500 mt-0.5 truncate">
            {wallet.notes}
          </p>
        )}
      </div>

      {/* Quick Action Bar on Card */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onTransfer(wallet)}
          className="flex-1 py-1.5 px-3 bg-[#00F0FF] hover:bg-[#38F4FF] text-[#121212] text-xs font-black uppercase border border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex items-center justify-center gap-1.5"
        >
          <ArrowRightLeft size={13} strokeWidth={2.5} />
          <span>Transfer</span>
        </button>
        <button
          onClick={() => onEdit(wallet)}
          className="py-1.5 px-3 bg-white hover:bg-neutral-100 text-[#121212] text-xs font-black uppercase border border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
        >
          Edit
        </button>
      </div>

    </div>
  );
};
