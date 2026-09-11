import React, { useState, useEffect } from 'react';
import { NeoModal } from '../ui/NeoModal';
import { NeoButton } from '../ui/NeoButton';
import { Wallet } from '../../types';
import { ArrowRightLeft, ArrowDown, Wallet as WalletIcon, Calendar } from 'lucide-react';
import { getWalletIcon } from './WalletCard';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallets: Wallet[];
  defaultFromWallet?: Wallet | null;
  defaultSourceWalletId?: string;
  onTransfer: (data: {
    fromWalletId: string;
    toWalletId: string;
    amount: number;
    date: string;
    notes?: string;
  }) => Promise<void>;
  currencySymbol?: string;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  wallets,
  defaultFromWallet,
  defaultSourceWalletId,
  onTransfer,
  currencySymbol = '₹',
}) => {
  const [fromWalletId, setFromWalletId] = useState<string>('');
  const [toWalletId, setToWalletId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (wallets.length >= 2) {
      const from = defaultSourceWalletId || (defaultFromWallet ? defaultFromWallet._id : wallets[0]._id);
      setFromWalletId(from);
      const to = wallets.find((w) => w._id !== from)?._id || wallets[1]._id;
      setToWalletId(to);
    } else if (wallets.length === 1) {
      setFromWalletId(wallets[0]._id);
      setToWalletId('');
    }
    setAmount('');
    setDate(new Date().toISOString().slice(0, 10));
    setNotes('');
    setError('');
  }, [isOpen, wallets, defaultFromWallet]);

  const fromWallet = wallets.find((w) => w._id === fromWalletId);
  const toWallet = wallets.find((w) => w._id === toWalletId);
  const numAmount = parseFloat(amount) || 0;

  const handleSwap = () => {
    if (fromWalletId && toWalletId) {
      const temp = fromWalletId;
      setFromWalletId(toWalletId);
      setToWalletId(temp);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromWalletId || !toWalletId) {
      setError('Please select both source and destination accounts');
      return;
    }
    if (fromWalletId === toWalletId) {
      setError('Source and destination accounts must be different');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid transfer amount greater than 0');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      await onTransfer({
        fromWalletId,
        toWalletId,
        amount: numAmount,
        date,
        notes: notes.trim() || undefined,
      });
      setIsSubmitting(false);
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err?.message || 'Failed to complete transfer');
    }
  };

  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title="TRANSFER BETWEEN ACCOUNTS" maxWidth="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="p-3 bg-[#FF4343] text-white text-xs font-black border-2 border-[#121212] shadow-neo-sm">
            {error}
          </div>
        )}

        {/* Transfer Visual Direction Flow */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-[#FFFDF5] border-2 border-[#121212] shadow-neo-sm">
          {/* Source Account */}
          <div className="flex-1 w-full">
            <label className="text-[10px] font-black uppercase text-neutral-500 block mb-1">
              FROM (SOURCE)
            </label>
            <select
              value={fromWalletId}
              onChange={(e) => {
                setFromWalletId(e.target.value);
                if (e.target.value === toWalletId) {
                  const alt = wallets.find((w) => w._id !== e.target.value);
                  if (alt) setToWalletId(alt._id);
                }
              }}
              className="w-full p-2 text-xs font-black bg-white border-2 border-[#121212] cursor-pointer"
            >
              {wallets.map((w) => (
                <option key={w._id} value={w._id}>
                  {w.name} ({currencySymbol}{w.balance.toLocaleString('en-IN')})
                </option>
              ))}
            </select>
            {fromWallet && (
              <span className="text-[10px] font-mono font-bold text-neutral-600 mt-1 block">
                Available: {currencySymbol}{fromWallet.balance.toLocaleString('en-IN')}
              </span>
            )}
          </div>

          {/* Swap Button */}
          <button
            type="button"
            onClick={handleSwap}
            className="p-2 bg-[#FFE600] hover:bg-[#FFD700] border-2 border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] cursor-pointer shrink-0 mt-2 sm:mt-4"
            title="Swap Accounts"
          >
            <ArrowRightLeft size={16} strokeWidth={2.5} />
          </button>

          {/* Destination Account */}
          <div className="flex-1 w-full">
            <label className="text-[10px] font-black uppercase text-neutral-500 block mb-1">
              TO (DESTINATION)
            </label>
            <select
              value={toWalletId}
              onChange={(e) => setToWalletId(e.target.value)}
              className="w-full p-2 text-xs font-black bg-white border-2 border-[#121212] cursor-pointer"
            >
              {wallets.map((w) => (
                <option key={w._id} value={w._id} disabled={w._id === fromWalletId}>
                  {w.name} ({currencySymbol}{w.balance.toLocaleString('en-IN')})
                </option>
              ))}
            </select>
            {toWallet && (
              <span className="text-[10px] font-mono font-bold text-neutral-600 mt-1 block">
                Available: {currencySymbol}{toWallet.balance.toLocaleString('en-IN')}
              </span>
            )}
          </div>
        </div>

        {/* Transfer Amount */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-black uppercase text-[#121212]">
            Transfer Amount ({currencySymbol}) *
          </label>
          <div className="relative flex items-center">
            <span className="absolute left-3 text-base font-mono font-black text-neutral-500 pointer-events-none">
              {currencySymbol}
            </span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1000.00"
              className="neo-input pl-8 pr-16 py-2.5 text-lg font-mono font-black"
              required
              autoFocus
            />
            {fromWallet && fromWallet.balance > 0 && (
              <button
                type="button"
                onClick={() => setAmount(String(fromWallet.balance))}
                className="absolute right-2 px-2 py-1 bg-neutral-100 hover:bg-[#FFE600] border border-[#121212] text-[10px] font-black uppercase cursor-pointer"
              >
                Max
              </button>
            )}
          </div>
        </div>

        {/* Balance After Transfer Simulation */}
        {numAmount > 0 && fromWallet && toWallet && (
          <div className="p-3 bg-[#E8F8F0] border-2 border-[#05DF72] text-xs font-bold text-[#0B6B38] flex flex-col gap-1">
            <div className="flex justify-between">
              <span>{fromWallet.name} after transfer:</span>
              <span className="font-mono font-black">
                {currencySymbol}{(fromWallet.balance - numAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{toWallet.name} after transfer:</span>
              <span className="font-mono font-black">
                {currencySymbol}{(toWallet.balance + numAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        {/* Date & Notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-black uppercase text-[#121212]">Transfer Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="neo-input px-3 py-2 text-xs font-bold"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-black uppercase text-[#121212]">Notes (Optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. ATM cash withdrawal, wallet reload"
              className="neo-input px-3 py-2 text-xs font-bold"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t-2 border-[#121212]">
          <NeoButton type="button" variant="outline" size="md" onClick={onClose}>
            Cancel
          </NeoButton>
          <NeoButton type="submit" variant="primary" size="md" disabled={isSubmitting}>
            {isSubmitting ? 'Transferring...' : 'Execute Transfer'}
          </NeoButton>
        </div>
      </form>
    </NeoModal>
  );
};
