import React, { useState } from 'react';
import { Wallet, WalletType, Transaction, WalletSummary } from '../types';
import { WalletCard } from '../components/wallets/WalletCard';
import { WalletModal } from '../components/wallets/WalletModal';
import { TransferModal } from '../components/wallets/TransferModal';
import { NeoButton } from '../components/ui/NeoButton';
import { usePrivacy } from '../context/PrivacyContext';
import {
  Wallet as WalletIcon,
  Plus,
  ArrowRightLeft,
  TrendingDown,
  TrendingUp,
  Building2,
  Banknote,
  CreditCard,
  PiggyBank,
  Check,
} from 'lucide-react';

interface WalletsPageProps {
  wallets: Wallet[];
  walletSummary?: WalletSummary | null;
  totalBalance?: number;
  expenseSoFar?: number;
  incomeSoFar?: number;
  recentTransactions?: Transaction[];
  onAddWallet?: (data: {
    name: string;
    type: WalletType;
    balance: number;
    color: string;
    icon: string;
    accountNumberLast4?: string;
    isDefault: boolean;
    notes?: string;
  }) => Promise<void>;
  onUpdateWallet?: (
    id: string,
    data: {
      name: string;
      type: WalletType;
      balance: number;
      color: string;
      icon: string;
      accountNumberLast4?: string;
      isDefault: boolean;
      notes?: string;
    }
  ) => Promise<void>;
  onDeleteWallet: (id: string) => Promise<void>;
  onTransferFunds?: (data: {
    fromWalletId: string;
    toWalletId: string;
    amount: number;
    date: string;
    notes?: string;
  }) => Promise<void>;
  onOpenWalletModal?: () => void;
  onOpenTransferModal?: (sourceWalletId?: string) => void;
  onEditWallet?: (w: Wallet) => void;
  onOpenAddExpense?: () => void;
  onOpenAddIncome?: () => void;
  currencySymbol?: string;
}

export const WalletsPage: React.FC<WalletsPageProps> = ({
  wallets,
  walletSummary,
  totalBalance: propTotalBalance,
  expenseSoFar: propExpenseSoFar,
  incomeSoFar: propIncomeSoFar,
  recentTransactions = [],
  onAddWallet,
  onUpdateWallet,
  onDeleteWallet,
  onTransferFunds,
  onOpenWalletModal,
  onOpenTransferModal,
  onEditWallet,
  onOpenAddExpense,
  onOpenAddIncome,
  currencySymbol = '₹',
}) => {
  const { isPrivacyMode, formatPrivateAmount } = usePrivacy();
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferSourceWallet, setTransferSourceWallet] = useState<Wallet | null>(null);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'all' | WalletType>('all');

  const totalBalance = walletSummary?.totalBalance ?? propTotalBalance ?? wallets.reduce((acc, w) => acc + w.balance, 0);
  const expenseSoFar = walletSummary?.expenseSoFar ?? propExpenseSoFar ?? 0;
  const incomeSoFar = walletSummary?.incomeSoFar ?? propIncomeSoFar ?? 0;

  const filteredWallets = selectedTypeFilter === 'all'
    ? wallets
    : wallets.filter((w) => w.type === selectedTypeFilter);

  const handleStartTransfer = (wallet?: Wallet) => {
    if (onOpenTransferModal) {
      onOpenTransferModal(wallet?._id);
    } else {
      setTransferSourceWallet(wallet || null);
      setIsTransferModalOpen(true);
    }
  };

  const handleStartEdit = (wallet: Wallet) => {
    if (onEditWallet) {
      onEditWallet(wallet);
    } else {
      setEditingWallet(wallet);
      setIsWalletModalOpen(true);
    }
  };

  const handleOpenCreate = () => {
    if (onOpenWalletModal) {
      onOpenWalletModal();
    } else {
      setEditingWallet(null);
      setIsWalletModalOpen(true);
    }
  };

  const handleSaveWallet = async (data: any) => {
    if (editingWallet && onUpdateWallet) {
      await onUpdateWallet(editingWallet._id, data);
    } else if (onAddWallet) {
      await onAddWallet(data);
    }
    setEditingWallet(null);
  };

  const TYPE_FILTERS: { label: string; value: 'all' | WalletType }[] = [
    { label: 'All Accounts', value: 'all' },
    { label: 'Banks', value: 'bank' },
    { label: 'Cash', value: 'cash' },
    { label: 'Cards', value: 'card' },
    { label: 'Digital Wallets', value: 'wallet' },
    { label: 'Savings', value: 'savings' },
    { label: 'Investments', value: 'investment' },
  ];

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-150">
      
      {/* Hero Header matching MyMoney Screenshot 4 */}
      <div className="bg-[#FFE600] p-4 sm:p-6 border-[3px] border-[#121212] shadow-neo relative overflow-hidden">
        <div className="absolute right-4 top-4 opacity-10 font-black text-9xl font-mono select-none hidden md:block">
          பை
        </div>

        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-mono font-black uppercase tracking-widest bg-[#121212] text-[#FFE600] px-2 py-0.5 inline-block mb-1">
                ACCOUNTS & WALLETS
              </span>
              <h2 className="text-2xl sm:text-3xl font-black uppercase text-[#121212] tracking-tight">
                {isPrivacyMode ? '[ All Accounts: •••••• ]' : `[ All Accounts: ${currencySymbol}${totalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ]`}
              </h2>
              <p className="text-xs font-bold text-neutral-800 mt-0.5">
                Manage your wallets, cards, and bank balances all in one place
              </p>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <NeoButton
                variant="outline"
                size="md"
                onClick={() => handleStartTransfer()}
                disabled={wallets.length < 2}
                className="flex items-center gap-1.5 bg-[#00F0FF] hover:bg-[#38F4FF] text-[#121212]"
                title="Transfer between wallets"
              >
                <ArrowRightLeft size={15} strokeWidth={2.5} />
                <span>Transfer</span>
              </NeoButton>
              <NeoButton
                variant="dark"
                size="md"
                onClick={handleOpenCreate}
                className="flex items-center gap-1.5"
              >
                <Plus size={16} strokeWidth={3} className="text-[#05DF72]" />
                <span>+ Add Account</span>
              </NeoButton>
            </div>
          </div>

          {/* Sub-Stats Bar matching MyMoney Screenshot 4 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t-2 border-[#121212]">
            <div className="p-3 bg-white border-2 border-[#121212] shadow-neo-sm">
              <span className="text-[10px] font-black uppercase text-neutral-500 block">
                TOTAL LIQUID BALANCES
              </span>
              <span className="text-xl font-mono font-black text-[#121212]">
                {isPrivacyMode ? '••••••' : formatPrivateAmount(totalBalance, currencySymbol)}
              </span>
              <span className="text-[10px] font-bold text-neutral-500 block mt-0.5">
                Across {wallets.length} active account{wallets.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="p-3 bg-white border-2 border-[#121212] shadow-neo-sm">
              <span className="text-[10px] font-black uppercase text-[#FF4343] flex items-center gap-1">
                <TrendingDown size={12} /> EXPENSE SO FAR
              </span>
              <span className="text-xl font-mono font-black text-[#FF4343]">
                {isPrivacyMode ? '••••••' : formatPrivateAmount(expenseSoFar, currencySymbol)}
              </span>
              <span className="text-[10px] font-bold text-neutral-500 block mt-0.5">
                Total spent from all accounts
              </span>
            </div>

            <div className="p-3 bg-white border-2 border-[#121212] shadow-neo-sm">
              <span className="text-[10px] font-black uppercase text-[#0B6B38] flex items-center gap-1">
                <TrendingUp size={12} /> INCOME SO FAR
              </span>
              <span className="text-xl font-mono font-black text-[#0B6B38]">
                {isPrivacyMode ? '••••••' : formatPrivateAmount(incomeSoFar, currencySymbol)}
              </span>
              <span className="text-[10px] font-bold text-neutral-500 block mt-0.5">
                Total received into accounts
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Account Type Filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {TYPE_FILTERS.map((tf) => {
          const count = tf.value === 'all'
            ? wallets.length
            : wallets.filter((w) => w.type === tf.value).length;
          return (
            <button
              key={tf.value}
              onClick={() => setSelectedTypeFilter(tf.value)}
              className={`px-3 py-1.5 text-xs font-black uppercase border-2 transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                selectedTypeFilter === tf.value
                  ? 'bg-[#121212] text-white border-[#121212] shadow-neo-sm'
                  : 'bg-white text-neutral-700 border-neutral-300 hover:border-[#121212]'
              }`}
            >
              <span>{tf.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  selectedTypeFilter === tf.value
                    ? 'bg-[#FFE600] text-[#121212]'
                    : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Wallets Grid */}
      {filteredWallets.length === 0 ? (
        <div className="bg-white border-[3px] border-[#121212] shadow-neo p-12 text-center flex flex-col items-center gap-3">
          <div className="w-16 h-16 bg-[#FFE600] border-[3px] border-[#121212] shadow-neo flex items-center justify-center font-black">
            <WalletIcon size={32} />
          </div>
          <h3 className="text-xl font-black uppercase text-[#121212]">
            No Accounts Found
          </h3>
          <p className="text-xs font-semibold text-neutral-600 max-w-sm">
            Add a bank account, cash wallet, or card to track where your money is kept and spent.
          </p>
          <NeoButton
            variant="primary"
            size="md"
            onClick={handleOpenCreate}
            className="mt-2"
          >
            Create Your First Account
          </NeoButton>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWallets.map((wallet) => (
            <WalletCard
              key={wallet._id}
              wallet={wallet}
              onEdit={handleStartEdit}
              onDelete={onDeleteWallet}
              onTransfer={handleStartTransfer}
              currencySymbol={currencySymbol}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => {
          setIsWalletModalOpen(false);
          setEditingWallet(null);
        }}
        onSubmit={handleSaveWallet}
        initialData={editingWallet}
        currencySymbol={currencySymbol}
      />

      <TransferModal
        isOpen={isTransferModalOpen}
        onClose={() => {
          setIsTransferModalOpen(false);
          setTransferSourceWallet(null);
        }}
        wallets={wallets}
        defaultFromWallet={transferSourceWallet}
        onTransfer={onTransferFunds}
        currencySymbol={currencySymbol}
      />

    </div>
  );
};
