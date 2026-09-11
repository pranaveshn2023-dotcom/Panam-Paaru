import React, { useState, useEffect } from 'react';
import { NeoModal } from '../ui/NeoModal';
import { NeoButton } from '../ui/NeoButton';
import { NeoInput } from '../ui/NeoInput';
import { Wallet, WalletType } from '../../types';
import { getWalletIcon, getWalletTypeLabel } from './WalletCard';
import { DollarSign, Tag, Palette, Star, FileText } from 'lucide-react';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    type: WalletType;
    balance: number;
    color: string;
    icon: string;
    accountNumberLast4?: string;
    isDefault: boolean;
    notes?: string;
  }) => Promise<void>;
  initialData?: Wallet | null;
  currencySymbol?: string;
}

const WALLET_TYPES: { type: WalletType; label: string; icon: string; defaultColor: string }[] = [
  { type: 'bank', label: 'Bank Account', icon: 'Building2', defaultColor: '#00F0FF' },
  { type: 'cash', label: 'Cash in Hand', icon: 'Banknote', defaultColor: '#05DF72' },
  { type: 'card', label: 'Credit/Debit Card', icon: 'CreditCard', defaultColor: '#FF4343' },
  { type: 'wallet', label: 'Digital Wallet / UPI', icon: 'Wallet', defaultColor: '#FFE600' },
  { type: 'savings', label: 'Savings Pocket', icon: 'PiggyBank', defaultColor: '#9B51E0' },
  { type: 'investment', label: 'Investment Demat', icon: 'TrendingUp', defaultColor: '#FFD700' },
];

const COLOR_PALETTE = [
  '#00F0FF', // Cyan
  '#05DF72', // Green
  '#FFE600', // Yellow
  '#FF4343', // Red
  '#9B51E0', // Purple
  '#FF4D8D', // Pink
  '#FF8800', // Orange
  '#121212', // Black
];

export const WalletModal: React.FC<WalletModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  currencySymbol = '₹',
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<WalletType>('bank');
  const [balance, setBalance] = useState('');
  const [color, setColor] = useState('#00F0FF');
  const [accountNumberLast4, setAccountNumberLast4] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setType(initialData.type);
      setBalance(String(initialData.balance));
      setColor(initialData.color || '#00F0FF');
      setAccountNumberLast4(initialData.accountNumberLast4 || '');
      setIsDefault(initialData.isDefault || false);
      setNotes(initialData.notes || '');
    } else {
      setName('');
      setType('bank');
      setBalance('0');
      setColor('#00F0FF');
      setAccountNumberLast4('');
      setIsDefault(false);
      setNotes('');
    }
    setError('');
  }, [initialData, isOpen]);

  const handleTypeSelect = (selectedType: WalletType) => {
    setType(selectedType);
    const found = WALLET_TYPES.find((w) => w.type === selectedType);
    if (found && !initialData) {
      setColor(found.defaultColor);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numBalance = parseFloat(balance);

    if (!name.trim()) {
      setError('Please provide a wallet / account name');
      return;
    }
    if (isNaN(numBalance)) {
      setError('Please enter a valid balance amount');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      const found = WALLET_TYPES.find((w) => w.type === type);

      await onSubmit({
        name: name.trim(),
        type,
        balance: numBalance,
        color,
        icon: found?.icon || 'Wallet',
        accountNumberLast4: accountNumberLast4.trim() || undefined,
        isDefault,
        notes: notes.trim() || undefined,
      });

      setIsSubmitting(false);
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err?.message || 'Failed to save wallet');
    }
  };

  return (
    <NeoModal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'EDIT WALLET / ACCOUNT' : 'ADD NEW WALLET / ACCOUNT'}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="p-3 bg-[#FF4343] text-white text-xs font-black border-2 border-[#121212] shadow-neo-sm">
            {error}
          </div>
        )}

        {/* Account Name */}
        <NeoInput
          label="Account / Wallet Name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. HDFC Salary Account, Pocket Cash, ICICI Amazon Pay"
          required
        />

        {/* Wallet Type Selection Grid */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-black uppercase text-[#121212]">
            Account Type *
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {WALLET_TYPES.map((wt) => {
              const isSelected = type === wt.type;
              return (
                <button
                  key={wt.type}
                  type="button"
                  onClick={() => handleTypeSelect(wt.type)}
                  className={`p-2.5 border-2 border-[#121212] flex items-center gap-2.5 transition-all cursor-pointer text-left ${
                    isSelected
                      ? 'bg-[#121212] text-white shadow-neo-sm'
                      : 'bg-white text-[#121212] hover:bg-[#FFFDF5]'
                  }`}
                >
                  <div
                    className="w-6 h-6 border border-[#121212] flex items-center justify-center shrink-0"
                    style={{ backgroundColor: isSelected ? wt.defaultColor : '#FFFDF5' }}
                  >
                    {getWalletIcon(wt.type, 13, isSelected ? 'text-[#121212]' : 'text-neutral-700')}
                  </div>
                  <span className="text-[11px] font-black uppercase truncate">{wt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Balance & Account Number */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-black uppercase text-[#121212]">
              {initialData ? 'Current Balance' : 'Initial Starting Balance'} ({currencySymbol}) *
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-sm font-mono font-black text-neutral-500 pointer-events-none">
                {currencySymbol}
              </span>
              <input
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="25000.00"
                className="neo-input pl-8 pr-3 py-2 text-base font-mono font-black"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-black uppercase text-[#121212]">
              Last 4 Digits (Optional)
            </label>
            <input
              type="text"
              maxLength={4}
              value={accountNumberLast4}
              onChange={(e) => setAccountNumberLast4(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 4821"
              className="neo-input px-3 py-2 text-sm font-mono font-black"
            />
          </div>
        </div>

        {/* Color Palette Selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-black uppercase text-[#121212] flex items-center gap-1">
            <Palette size={13} /> Account Color Theme
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 border-2 border-[#121212] transition-all cursor-pointer ${
                  color === c ? 'scale-110 ring-2 ring-[#121212] shadow-neo-sm' : 'opacity-80 hover:opacity-100'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Primary / Default Checkbox */}
        <label className="flex items-center gap-2 p-2.5 bg-neutral-50 border border-[#121212] cursor-pointer">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="w-4 h-4 accent-[#FFE600] cursor-pointer"
          />
          <span className="text-xs font-black uppercase text-[#121212]">
            Set as Primary Wallet (Default for new expenses)
          </span>
        </label>

        {/* Notes */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-black uppercase text-[#121212]">Notes / Purpose (Optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Salary deposits, online orders, emergency cash"
            className="neo-input px-3 py-2 text-xs font-bold"
          />
        </div>

        {/* Submit Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t-2 border-[#121212]">
          <NeoButton type="button" variant="outline" size="md" onClick={onClose}>
            Cancel
          </NeoButton>
          <NeoButton type="submit" variant="primary" size="md" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : initialData ? 'Save Changes' : 'Create Account'}
          </NeoButton>
        </div>
      </form>
    </NeoModal>
  );
};
