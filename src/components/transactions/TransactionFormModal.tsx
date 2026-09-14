import React, { useState, useEffect } from 'react';
import { NeoModal } from '../ui/NeoModal';
import { NeoButton } from '../ui/NeoButton';
import { NeoInput } from '../ui/NeoInput';
import { Transaction, TransactionType, Category, Wallet } from '../../types';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Calendar, Tag, FileText, Wallet as WalletIcon, Plus, Calculator, Delete } from 'lucide-react';
import { CategoryFormModal } from '../categories/CategoryFormModal';

function evaluateMath(expr: string): number | null {
  try {
    if (!/^[0-9+\-*/().\s]+$/.test(expr)) return null;
    const sanitized = expr.replace(/\s+/g, '');
    // eslint-disable-next-line no-new-func
    const result = Function(`'use strict'; return (${sanitized})`)();
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return Math.round(result * 100) / 100;
    }
    return null;
  } catch {
    return null;
  }
}

interface TransactionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    amount: number;
    type: TransactionType;
    category: string;
    date: string;
    notes?: string;
    walletId?: string;
    transferToWalletId?: string;
  }) => Promise<void>;
  initialData?: Transaction | null;
  categories: Category[];
  wallets?: Wallet[];
  currencySymbol?: string;
  onCreateCategory?: (data: {
    name: string;
    type: 'income' | 'expense';
    color: string;
    icon: string;
  }) => Promise<void>;
}

export const TransactionFormModal: React.FC<TransactionFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  categories,
  wallets = [],
  currencySymbol = '₹',
  onCreateCategory,
}) => {
  const [type, setType] = useState<TransactionType>('expense');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [walletId, setWalletId] = useState('');
  const [transferToWalletId, setTransferToWalletId] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcExpression, setCalcExpression] = useState('');

  useEffect(() => {
    const defaultWallet = wallets.find((w) => w.isDefault) || wallets[0];
    const secondWallet = wallets.find((w) => w._id !== defaultWallet?._id) || wallets[1];

    if (initialData) {
      setType(initialData.type);
      setTitle(initialData.title);
      setAmount(String(initialData.amount));
      setCalcExpression(String(initialData.amount));
      setCategory(initialData.category);
      setDate(initialData.date.slice(0, 10));
      setNotes(initialData.notes || '');
      setWalletId(initialData.walletId || defaultWallet?._id || '');
      setTransferToWalletId(initialData.transferToWalletId || secondWallet?._id || '');
    } else {
      setType('expense');
      setTitle('');
      setAmount('');
      setCalcExpression('');
      setCategory(categories.find((c) => c.type === 'expense')?.name || 'Food & Dining');
      setDate(new Date().toISOString().slice(0, 10));
      setNotes('');
      setWalletId(defaultWallet?._id || '');
      setTransferToWalletId(secondWallet?._id || '');
    }
    setShowCalculator(false);
    setError('');
  }, [initialData, isOpen, categories, wallets]);

  const handleKeypadPress = (btn: string) => {
    if (btn === 'C') {
      setCalcExpression('');
      setAmount('');
    } else if (btn === '⌫') {
      const next = calcExpression.slice(0, -1);
      setCalcExpression(next);
      const val = evaluateMath(next);
      if (val !== null) setAmount(String(val));
      else if (!next) setAmount('');
    } else if (btn === '=') {
      const val = evaluateMath(calcExpression);
      if (val !== null) {
        setAmount(String(val));
        setCalcExpression(String(val));
      }
    } else {
      const opMap: Record<string, string> = { '×': '*', '÷': '/' };
      const char = opMap[btn] || btn;
      const next = calcExpression + char;
      setCalcExpression(next);
      const val = evaluateMath(next);
      if (val !== null) setAmount(String(val));
    }
  };

  const filteredCategories = categories.filter((c) => c.type === (type === 'transfer' ? 'expense' : type));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);

    if (type === 'transfer') {
      if (!walletId || !transferToWalletId) {
        setError('Please select both source and destination accounts');
        return;
      }
      if (walletId === transferToWalletId) {
        setError('Source and destination accounts must be different');
        return;
      }
    }

    const effectiveTitle = title.trim() || (type === 'transfer'
      ? `Transfer: ${wallets.find((w) => w._id === walletId)?.name || 'Account'} → ${wallets.find((w) => w._id === transferToWalletId)?.name || 'Account'}`
      : '');

    if (!effectiveTitle) {
      setError('Please provide a transaction title');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid positive amount');
      return;
    }
    if (type !== 'transfer' && !category) {
      setError('Please select a category');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Please check your connection.')), 8000)
      );

      await Promise.race([
        onSubmit({
          title: effectiveTitle,
          amount: numAmount,
          type,
          category: type === 'transfer' ? 'Transfer' : category,
          date,
          notes: notes.trim() || undefined,
          walletId: walletId || undefined,
          transferToWalletId: type === 'transfer' ? transferToWalletId : undefined,
        }),
        timeoutPromise,
      ]);

      setIsSubmitting(false);
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err?.message || 'Failed to save transaction. Please try again.');
    }
  };

  return (
    <NeoModal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'EDIT TRANSACTION' : 'ADD NEW TRANSACTION'}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Type Toggle: Expense, Income, Transfer */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-neutral-100 border-2 border-[#121212]">
          <button
            type="button"
            onClick={() => {
              setType('expense');
              const firstExp = categories.find((c) => c.type === 'expense');
              if (firstExp) setCategory(firstExp.name);
            }}
            className={`py-2 px-2 text-[11px] sm:text-xs font-black uppercase flex items-center justify-center gap-1 border-2 transition-all cursor-pointer ${
              type === 'expense'
                ? 'bg-[#FF4343] text-white border-[#121212] shadow-neo-sm'
                : 'bg-transparent text-neutral-600 border-transparent hover:text-[#121212]'
            }`}
          >
            <ArrowUpRight size={14} strokeWidth={3} />
            Expense
          </button>

          <button
            type="button"
            onClick={() => {
              setType('income');
              const firstInc = categories.find((c) => c.type === 'income');
              if (firstInc) setCategory(firstInc.name);
            }}
            className={`py-2 px-2 text-[11px] sm:text-xs font-black uppercase flex items-center justify-center gap-1 border-2 transition-all cursor-pointer ${
              type === 'income'
                ? 'bg-[#05DF72] text-[#121212] border-[#121212] shadow-neo-sm'
                : 'bg-transparent text-neutral-600 border-transparent hover:text-[#121212]'
            }`}
          >
            <ArrowDownLeft size={14} strokeWidth={3} />
            Income
          </button>

          <button
            type="button"
            onClick={() => {
              setType('transfer');
            }}
            className={`py-2 px-2 text-[11px] sm:text-xs font-black uppercase flex items-center justify-center gap-1 border-2 transition-all cursor-pointer ${
              type === 'transfer'
                ? 'bg-[#00F0FF] text-[#121212] border-[#121212] shadow-neo-sm'
                : 'bg-transparent text-neutral-600 border-transparent hover:text-[#121212]'
            }`}
          >
            <ArrowLeftRight size={14} strokeWidth={3} />
            Transfer
          </button>
        </div>

        {/* Amount Input with Built-in Calculator */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black uppercase tracking-wider text-[#121212]">
              Amount ({currencySymbol}) *
            </label>
            <button
              type="button"
              onClick={() => {
                setShowCalculator((prev) => !prev);
                if (!calcExpression && amount) setCalcExpression(amount);
              }}
              className={`text-[11px] font-black uppercase flex items-center gap-1 px-2 py-0.5 border border-[#121212] transition-all cursor-pointer ${
                showCalculator
                  ? 'bg-[#FFE600] text-[#121212] shadow-neo-sm'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-[#FFE600]'
              }`}
            >
              <Calculator size={12} strokeWidth={2.5} />
              <span>{showCalculator ? 'Close Calc' : 'Calculator'}</span>
            </button>
          </div>

          <div className="relative flex items-center">
            <span className="absolute left-3.5 text-lg font-mono font-black text-neutral-500 pointer-events-none">
              {currencySymbol}
            </span>
            <input
              type={showCalculator ? 'text' : 'number'}
              step="0.01"
              min="0.01"
              value={showCalculator ? (calcExpression || amount) : amount}
              onChange={(e) => {
                const val = e.target.value;
                if (showCalculator) {
                  setCalcExpression(val);
                  const parsed = evaluateMath(val);
                  if (parsed !== null) setAmount(String(parsed));
                } else {
                  setAmount(val);
                }
              }}
              onKeyDown={(e) => {
                if (showCalculator && e.key === 'Enter') {
                  e.preventDefault();
                  const parsed = evaluateMath(calcExpression);
                  if (parsed !== null) {
                    setAmount(String(parsed));
                    setCalcExpression(String(parsed));
                  }
                }
              }}
              placeholder="0.00"
              className="neo-input pl-9 pr-3.5 py-3 text-xl font-mono font-black text-[#121212]"
              required
              autoFocus
            />
          </div>

          {/* Built-in Keypad (MyMoney Style) */}
          {showCalculator && (
            <div className="p-2.5 bg-neutral-100 border-2 border-[#121212] shadow-neo-sm flex flex-col gap-1.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between text-xs font-mono font-black text-neutral-600 px-1">
                <span>Calc: {calcExpression || '0'}</span>
                <span className="text-[#121212] font-black">
                  = {currencySymbol}{amount || '0'}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[
                  ['C', '(', ')', '÷'],
                  ['7', '8', '9', '×'],
                  ['4', '5', '6', '-'],
                  ['1', '2', '3', '+'],
                  ['0', '.', '⌫', '='],
                ].flat().map((btn) => (
                  <button
                    key={btn}
                    type="button"
                    onClick={() => handleKeypadPress(btn)}
                    className={`py-2 text-xs font-mono font-black border-2 transition-all cursor-pointer ${
                      btn === '='
                        ? 'bg-[#05DF72] text-[#121212] border-[#121212] shadow-neo-sm font-black'
                        : btn === 'C'
                        ? 'bg-[#FF4343] text-white border-[#121212]'
                        : ['+', '-', '×', '÷'].includes(btn)
                        ? 'bg-[#FFE600] text-[#121212] border-[#121212]'
                        : 'bg-white text-[#121212] border-neutral-300 hover:border-black'
                    }`}
                  >
                    {btn}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Wallets / Accounts Selection */}
        {wallets.length > 0 && (
          <div>
            {type === 'transfer' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-neutral-50 border-2 border-[#121212]">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-black uppercase tracking-wider text-neutral-600 flex items-center gap-1">
                    <WalletIcon size={12} /> From Account
                  </label>
                  <select
                    value={walletId}
                    onChange={(e) => setWalletId(e.target.value)}
                    className="neo-input py-2 px-2.5 text-xs font-black bg-white cursor-pointer"
                    required
                  >
                    <option value="" disabled>Select Source</option>
                    {wallets.map((w) => (
                      <option key={w._id} value={w._id}>
                        {w.name} ({currencySymbol}{w.balance.toLocaleString('en-IN')})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-black uppercase tracking-wider text-neutral-600 flex items-center gap-1">
                    <WalletIcon size={12} /> To Account
                  </label>
                  <select
                    value={transferToWalletId}
                    onChange={(e) => setTransferToWalletId(e.target.value)}
                    className="neo-input py-2 px-2.5 text-xs font-black bg-white cursor-pointer"
                    required
                  >
                    <option value="" disabled>Select Destination</option>
                    {wallets.map((w) => (
                      <option key={w._id} value={w._id} disabled={w._id === walletId}>
                        {w.name} ({currencySymbol}{w.balance.toLocaleString('en-IN')})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-[#121212] flex items-center gap-1">
                  <WalletIcon size={13} />
                  Account / Wallet
                </label>
                <select
                  value={walletId}
                  onChange={(e) => setWalletId(e.target.value)}
                  className="neo-input py-2.5 px-3 text-xs font-black bg-white cursor-pointer"
                >
                  <option value="">-- None / Unassigned --</option>
                  {wallets.map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.name} • {w.type.toUpperCase()} ({currencySymbol}{w.balance.toLocaleString('en-IN')})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Title Input */}
        <NeoInput
          label="Title / Description"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={type === 'transfer' ? 'Auto-generated or custom transfer description' : 'e.g. Grocery Shopping, Client Invoice'}
          required={type !== 'transfer'}
        />

        {/* Category Selector (hidden for Transfer) */}
        {type !== 'transfer' && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-[#121212] flex items-center gap-1">
                <Tag size={13} />
                Category *
              </label>
              {onCreateCategory && (
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(true)}
                  className="text-[11px] font-black uppercase text-[#121212] hover:text-[#05DF72] underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={11} strokeWidth={3} />
                  New Category
                </button>
              )}
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="neo-input py-2.5 px-3 text-xs font-black uppercase bg-white cursor-pointer"
              required
            >
              {filteredCategories.map((cat) => (
                <option key={cat.name} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Date Picker */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-black uppercase tracking-wider text-[#121212] flex items-center gap-1">
            <Calendar size={13} />
            Transaction Date *
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="neo-input py-2.5 px-3 text-xs font-mono font-bold bg-white cursor-pointer"
            required
          />
        </div>

        {/* Notes (Optional) */}
        <NeoInput
          label="Notes (Optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add tags, bill refs, context..."
        />

        {error && (
          <div className="bg-[#FF4343] text-white text-xs font-bold p-2.5 border-2 border-[#121212] shadow-neo-sm">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2.5 pt-2">
          <NeoButton type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </NeoButton>
          <NeoButton
            type="submit"
            variant={type === 'expense' ? 'danger' : type === 'transfer' ? 'primary' : 'secondary'}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? 'Saving...'
              : initialData
              ? 'Update Transaction'
              : type === 'transfer'
              ? 'Complete Transfer'
              : 'Save Transaction'}
          </NeoButton>
        </div>
      </form>

      {/* Quick Add Category Modal */}
      {onCreateCategory && (
        <CategoryFormModal
          isOpen={isCategoryModalOpen}
          onClose={() => setIsCategoryModalOpen(false)}
          defaultType={type === 'income' ? 'income' : 'expense'}
          onSubmit={async (catData) => {
            await onCreateCategory({
              name: catData.name,
              type: catData.type,
              color: catData.color,
              icon: catData.icon,
            });
            setCategory(catData.name);
            setIsCategoryModalOpen(false);
          }}
        />
      )}
    </NeoModal>
  );
};
