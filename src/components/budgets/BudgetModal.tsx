import React, { useState, useEffect } from 'react';
import { NeoModal } from '../ui/NeoModal';
import { NeoButton } from '../ui/NeoButton';
import { NeoInput } from '../ui/NeoInput';
import { Budget, Category, RecurrenceType, Wallet } from '../../types';
import { CalendarSync, Tag, AlertTriangle, ShieldAlert, Coins, Sparkles, RefreshCw, Layers, Plus, Percent } from 'lucide-react';
import { CategoryFormModal } from '../categories/CategoryFormModal';

interface BudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    amount: number;
    initialLoadedAmount?: number;
    category: string;
    recurrence: RecurrenceType;
    isRecurring?: boolean;
    startDate: string;
    sourceWalletId?: string;
    autoDeductFromWallet?: boolean;
    alertThreshold?: number;
    lowBalanceThresholdAmount?: number;
    lowBalanceThresholdPercent?: number;
    alertTarget?: 'pocket' | 'wallet';
  }) => Promise<void>;
  initialData?: Budget | null;
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

export const BudgetModal: React.FC<BudgetModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  categories,
  wallets = [],
  currencySymbol = '₹',
  onCreateCategory,
}) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [isRecurring, setIsRecurring] = useState(true);
  const [recurrence, setRecurrence] = useState<RecurrenceType>('monthly');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [sourceWalletId, setSourceWalletId] = useState<string>('');
  const [autoDeductFromWallet, setAutoDeductFromWallet] = useState(true);
  const [alertThreshold, setAlertThreshold] = useState('80');
  const [alertMode, setAlertMode] = useState<'amount' | 'percent' | 'both'>('amount');
  const [alertTarget, setAlertTarget] = useState<'pocket' | 'wallet'>('pocket');
  const [lowAmount, setLowAmount] = useState('1000');
  const [lowPercent, setLowPercent] = useState('20');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  const expenseCategories = categories.filter((c) => c.type === 'expense');

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setAmount(String(initialData.amount));
      setCategory(initialData.category);
      const isRec = initialData.recurrence !== 'one_time' && initialData.isRecurring !== false;
      setIsRecurring(isRec);
      setRecurrence(isRec ? initialData.recurrence : 'monthly');
      setStartDate(initialData.startDate.slice(0, 10));
      setSourceWalletId(initialData.sourceWalletId || '');
      setAutoDeductFromWallet(initialData.autoDeductFromWallet ?? isRec);
      setAlertThreshold(String(initialData.alertThreshold ?? 80));
      setLowAmount(initialData.lowBalanceThresholdAmount ? String(initialData.lowBalanceThresholdAmount) : '');
      setLowPercent(initialData.lowBalanceThresholdPercent ? String(initialData.lowBalanceThresholdPercent) : '20');
      const hasAmt = Boolean(initialData.lowBalanceThresholdAmount && initialData.lowBalanceThresholdAmount > 0);
      const hasPct = Boolean(initialData.lowBalanceThresholdPercent && initialData.lowBalanceThresholdPercent > 0);
      if (hasAmt && hasPct) {
        setAlertMode('both');
      } else if (hasPct) {
        setAlertMode('percent');
      } else {
        setAlertMode('amount');
      }
      // If user had a threshold >= amount and linked a wallet, default alertTarget to 'wallet'
      const shouldTargetWallet = initialData.alertTarget === 'wallet' || (
        Boolean(initialData.sourceWalletId) &&
        Boolean(initialData.lowBalanceThresholdAmount && initialData.lowBalanceThresholdAmount >= initialData.amount)
      );
      setAlertTarget(shouldTargetWallet ? 'wallet' : 'pocket');
    } else {
      setName('');
      setAmount('');
      setCategory(expenseCategories[0]?.name || 'Food & Dining');
      setIsRecurring(true);
      setRecurrence('monthly');
      setStartDate(new Date().toISOString().slice(0, 10));
      const defaultW = wallets.find((w) => w.isDefault) || wallets[0];
      setSourceWalletId(defaultW?._id || '');
      setAutoDeductFromWallet(true);
      setAlertThreshold('80');
      setAlertMode('amount');
      setAlertTarget('pocket');
      setLowAmount('');
      setLowPercent('20');
    }
    setError('');
  }, [initialData, isOpen, categories, wallets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    const numThreshold = parseInt(alertThreshold, 10);
    const numLowAmount =
      (alertMode === 'amount' || alertMode === 'both') && lowAmount && !isNaN(parseFloat(lowAmount))
        ? Math.max(0, parseFloat(lowAmount))
        : undefined;
    const numLowPercent =
      (alertMode === 'percent' || alertMode === 'both') && lowPercent && !isNaN(parseFloat(lowPercent))
        ? Math.max(1, Math.min(99, parseFloat(lowPercent)))
        : undefined;

    if (!name.trim()) {
      setError('Please provide a budget / pocket name');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid budget amount');
      return;
    }

    const isTargetingWallet = alertTarget === 'wallet' && Boolean(sourceWalletId);
    if (!isTargetingWallet && numLowAmount !== undefined && numLowAmount >= numAmount) {
      if (sourceWalletId) {
        setError(`Pocket alert threshold (${currencySymbol}${numLowAmount}) cannot exceed the pocket pool (${currencySymbol}${numAmount}). If this alert is for your bank account balance, choose "Account Balance" below.`);
      } else {
        setError(`Alert threshold amount (${currencySymbol}${numLowAmount}) must be less than the budget pool (${currencySymbol}${numAmount})`);
      }
      return;
    }
    if (!category) {
      setError('Please select a category');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Please check your connection.')), 8000)
      );

      const effectiveRecurrence: RecurrenceType = isRecurring ? recurrence : 'one_time';

      await Promise.race([
        onSubmit({
          name: name.trim(),
          amount: numAmount,
          initialLoadedAmount: numAmount,
          category,
          recurrence: effectiveRecurrence,
          isRecurring,
          startDate,
          sourceWalletId: sourceWalletId || undefined,
          autoDeductFromWallet: !!sourceWalletId && autoDeductFromWallet,
          alertThreshold: !isNaN(numThreshold) ? numThreshold : 80,
          lowBalanceThresholdAmount: numLowAmount,
          lowBalanceThresholdPercent: numLowPercent,
          alertTarget: isTargetingWallet ? 'wallet' : 'pocket',
        }),
        timeoutPromise,
      ]);

      setIsSubmitting(false);
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err?.message || 'Failed to save budget. Please try again.');
    }
  };

  const recurrenceOptions: { label: string; value: RecurrenceType }[] = [
    { label: 'Daily (24h)', value: 'daily' },
    { label: 'Weekly', value: 'weekly' },
    { label: 'Monthly', value: 'monthly' },
    { label: 'Quarterly', value: 'quarterly' },
    { label: 'Yearly', value: 'yearly' },
  ];

  return (
    <NeoModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        initialData
          ? 'EDIT BUDGET / POCKET'
          : isRecurring
          ? 'CREATE RECURRING BUDGET / POCKET'
          : 'CREATE ONE-TIME SETUP BUDGET'
      }
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Budget Name */}
        <NeoInput
          label="Budget / Pocket Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isRecurring ? "e.g. Daily Food Pool, Monthly Dining, Coffee" : "e.g. Wedding Shopping, Trip to Goa, Renovation"}
          required
        />

        {/* Single Budget Amount Field */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-black uppercase tracking-wider text-[#121212]">
            {isRecurring ? 'Cycle Budget Amount' : 'Budget Amount'} ({currencySymbol}) *
          </label>
          <div className="relative flex items-center">
            <span className="absolute left-3 text-sm font-mono font-black text-neutral-500 pointer-events-none">
              {currencySymbol}
            </span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => {
                const val = e.target.value;
                setAmount(val);
                const parsed = parseFloat(val);
                if (!isNaN(parsed) && parsed > 0) {
                  const currentLow = parseFloat(lowAmount);
                  if (isNaN(currentLow) || currentLow >= parsed || lowAmount === '1000' || !lowAmount) {
                    setLowAmount(String(Math.max(1, Math.round(parsed * 0.2))));
                  }
                }
              }}
              placeholder="5000.00"
              className="neo-input pl-8 pr-3 py-2 text-base font-mono font-black text-[#121212]"
              required
            />
          </div>
        </div>

        {/* Funding Wallet Selection & Auto-Deduct Toggle */}
        {wallets.length > 0 && (
          <div className="p-3.5 bg-[#E8F8F0] border-2 border-[#05DF72] shadow-neo-sm flex flex-col gap-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-black uppercase text-[#0B6B38] flex items-center gap-1.5">
                <Coins size={14} /> Source Funding Wallet
              </label>
              <select
                value={sourceWalletId}
                onChange={(e) => setSourceWalletId(e.target.value)}
                className="p-1.5 text-xs font-black bg-white border-2 border-[#121212] cursor-pointer"
              >
                <option value="">-- No linked wallet (Manual) --</option>
                {wallets.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name} (Bal: {currencySymbol}{w.balance.toLocaleString('en-IN')})
                  </option>
                ))}
              </select>
            </div>

            {sourceWalletId && (
              <label className="flex items-center gap-2 pt-1 border-t border-[#05DF72]/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoDeductFromWallet}
                  onChange={(e) => setAutoDeductFromWallet(e.target.checked)}
                  className="w-4 h-4 accent-[#05DF72] cursor-pointer"
                />
                <span className="text-[11px] font-bold text-[#0B6B38]">
                  {isRecurring
                    ? `Auto-deduct ${currencySymbol}${amount || '0'} from this wallet every ${recurrence} renewal cycle`
                    : `Auto-deduct budget amount (${currencySymbol}${amount || '0'}) from this wallet on creation`}
                </span>
              </label>
            )}
          </div>
        )}

        {/* Category & Start Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Category Selector */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-[#121212] flex items-center gap-1">
                <Tag size={13} />
                Target Category *
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
              className="neo-input py-2 px-3 text-xs font-black uppercase bg-white cursor-pointer"
              required
            >
              {expenseCategories.map((cat) => (
                <option key={cat.name} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-black uppercase tracking-wider text-[#121212]">
              {isRecurring ? 'Anchor Start Date *' : 'Budget Start Date *'}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="neo-input py-2 px-3 text-xs font-mono font-bold bg-white cursor-pointer"
              required
            />
          </div>
        </div>

        {/* Recurring Toggle Switch (ON / OFF) */}
        <div className="p-3 bg-[#FFFDF5] border-2 border-[#121212] shadow-neo-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 text-xs font-black uppercase text-[#121212]">
              <CalendarSync size={14} className={isRecurring ? 'text-[#05DF72]' : 'text-neutral-500'} />
              <span>Recurring Budget Cycles</span>
            </div>
            <span className="text-[11px] font-bold text-neutral-600 mt-0.5">
              {isRecurring
                ? 'Budget automatically renews periodically (Daily, Weekly, Monthly, etc.)'
                : 'Setup budget that auto-resets monthly without recurring wallet deductions'}
            </span>
          </div>

          {/* Neo-Brutalist ON / OFF Toggle Button */}
          <div className="flex items-center gap-1 bg-white p-1 border-2 border-[#121212] shadow-neo-sm self-start sm:self-center">
            <button
              type="button"
              onClick={() => setIsRecurring(false)}
              className={`px-3 py-1.5 text-xs font-black uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
                !isRecurring
                  ? 'bg-[#121212] text-white shadow-neo-sm'
                  : 'bg-transparent text-neutral-600 hover:text-black'
              }`}
            >
              <Layers size={13} />
              <span>OFF (Auto-Resets Monthly)</span>
            </button>
            <button
              type="button"
              onClick={() => setIsRecurring(true)}
              className={`px-3 py-1.5 text-xs font-black uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
                isRecurring
                  ? 'bg-[#05DF72] text-[#121212] border border-[#121212] shadow-neo-sm'
                  : 'bg-transparent text-neutral-600 hover:text-black'
              }`}
            >
              <RefreshCw size={13} />
              <span>ON (Recurring)</span>
            </button>
          </div>
        </div>

        {/* Recurrence Cycle Selector (Shown only when Recurring is ON) */}
        {isRecurring ? (
          <div className="flex flex-col gap-1.5 animate-in fade-in duration-150">
            <label className="text-xs font-black uppercase tracking-wider text-[#121212] flex items-center gap-1">
              <CalendarSync size={13} />
              Recurrence Cycle *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {recurrenceOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRecurrence(opt.value)}
                  className={`p-2 text-[11px] font-black uppercase border-2 transition-all cursor-pointer text-center ${
                    recurrence === opt.value
                      ? 'bg-[#FFE600] text-[#121212] border-[#121212] shadow-neo-sm font-black'
                      : 'bg-white text-neutral-700 border-neutral-300 hover:border-[#121212]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* One-Time Setup Explainer Banner (Shown when Recurring is OFF) */
          <div className="p-3 bg-[#FFE600]/25 border-2 border-[#121212] shadow-neo-sm flex items-start gap-2.5 animate-in fade-in duration-150">
            <Sparkles size={16} className="text-[#121212] shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-black uppercase text-[#121212] block">
                One-Time Setup Budget (Auto-Resets Monthly)
              </span>
              <p className="font-bold text-neutral-800 mt-0.5 leading-relaxed">
                This budget starts with a setup pool of <span className="font-mono font-black text-[#121212]">{currencySymbol}{amount || '0'}</span>. Transactions in category <span className="underline font-black text-[#121212]">{category || 'selected'}</span> will track against this pool and automatically reset on the 1st of every month without recurring wallet deductions.
              </p>
            </div>
          </div>
        )}

        {/* Low-Balance Alert Controls (Amount Limit OR Percentage Limit) */}
        <div className="p-3 bg-[#FFFDF5] border-2 border-[#121212] shadow-neo-sm flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-black uppercase text-[#121212]">
              <ShieldAlert size={14} className="text-[#FF8800]" />
              <span>Low-Balance Top-up Alert Limit</span>
            </div>
            <span className="text-[10px] font-mono font-black uppercase bg-[#FFE600] px-1.5 py-0.5 border border-[#121212]">
              {alertMode === 'amount' ? `By Amount (${currencySymbol})` : alertMode === 'percent' ? 'By Percent (%)' : 'Amount or %'}
            </span>
          </div>

          {/* If a funding wallet is linked, let the user choose whether to monitor the Pocket or the Account */}
          {sourceWalletId && (
            <div className="flex flex-col gap-1.5 p-2.5 bg-[#00F0FF]/15 border-2 border-[#121212] shadow-neo-sm">
              <div className="flex items-center justify-between text-[11px] font-black uppercase text-[#121212]">
                <span>Monitor Alert On:</span>
                <span className="text-[10px] font-mono text-neutral-700">
                  {alertTarget === 'wallet' ? 'Bank Account Balance' : 'Pocket Allowance'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setAlertTarget('pocket')}
                  className={`py-1.5 px-2 text-[11px] font-black uppercase border-2 transition-all cursor-pointer text-center ${
                    alertTarget === 'pocket'
                      ? 'bg-[#FFE600] text-[#121212] border-[#121212] shadow-neo-sm'
                      : 'bg-white text-neutral-600 border-neutral-300'
                  }`}
                >
                  Pocket Allowance ({currencySymbol}{amount || '0'})
                </button>
                <button
                  type="button"
                  onClick={() => setAlertTarget('wallet')}
                  className={`py-1.5 px-2 text-[11px] font-black uppercase border-2 transition-all cursor-pointer text-center ${
                    alertTarget === 'wallet'
                      ? 'bg-[#05DF72] text-[#121212] border-[#121212] shadow-neo-sm'
                      : 'bg-white text-neutral-600 border-neutral-300'
                  }`}
                >
                  Account Balance ({wallets.find((w) => w._id === sourceWalletId)?.name || 'Account'})
                </button>
              </div>
            </div>
          )}

          {/* Segmented Selector: Amount Limit OR Percentage Limit OR Both */}
          <div className="flex items-center gap-1 bg-white p-1 border-2 border-[#121212] shadow-neo-sm">
            <button
              type="button"
              onClick={() => setAlertMode('amount')}
              className={`flex-1 py-1.5 px-2 text-xs font-black uppercase transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                alertMode === 'amount'
                  ? 'bg-[#FFE600] text-[#121212] border border-[#121212] shadow-neo-sm'
                  : 'bg-transparent text-neutral-600 hover:text-black'
              }`}
            >
              <Coins size={12} strokeWidth={2.5} />
              <span>Amount Limit ({currencySymbol})</span>
            </button>
            <button
              type="button"
              onClick={() => setAlertMode('percent')}
              className={`flex-1 py-1.5 px-2 text-xs font-black uppercase transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                alertMode === 'percent'
                  ? 'bg-[#FFE600] text-[#121212] border border-[#121212] shadow-neo-sm'
                  : 'bg-transparent text-neutral-600 hover:text-black'
              }`}
            >
              <Percent size={12} strokeWidth={2.5} />
              <span>Percentage Limit (%)</span>
            </button>
            <button
              type="button"
              onClick={() => setAlertMode('both')}
              className={`py-1.5 px-2.5 text-xs font-black uppercase transition-all cursor-pointer flex items-center justify-center gap-1 ${
                alertMode === 'both'
                  ? 'bg-[#FFE600] text-[#121212] border border-[#121212] shadow-neo-sm'
                  : 'bg-transparent text-neutral-600 hover:text-black'
              }`}
            >
              <span>Both</span>
            </button>
          </div>

          {/* Inputs for selected mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {(alertMode === 'amount' || alertMode === 'both') && (
              <div className={`flex flex-col gap-1 ${alertMode === 'amount' ? 'sm:col-span-2' : ''} animate-in fade-in duration-150`}>
                <label className="text-[11px] font-black uppercase text-[#121212] flex items-center gap-1">
                  <Coins size={11} className="text-[#FF8800]" />
                  {alertTarget === 'wallet' && sourceWalletId
                    ? `Alert When ${wallets.find((w) => w._id === sourceWalletId)?.name || 'Account'} Balance Drops Below (${currencySymbol})`
                    : `Alert When Remaining Pocket Balance Drops Below (${currencySymbol})`}
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-2.5 text-xs font-mono font-black text-neutral-500 pointer-events-none">
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={lowAmount}
                    onChange={(e) => setLowAmount(e.target.value)}
                    placeholder="e.g. 250"
                    className="neo-input pl-7 pr-2.5 py-1.5 text-xs font-mono font-black text-[#121212] w-full"
                    required={alertMode === 'amount'}
                  />
                </div>
                <p className="text-[10px] font-bold text-neutral-600">
                  {alertTarget === 'wallet' && sourceWalletId
                    ? `Warning triggers when your bank account balance drops to or below ${currencySymbol}${lowAmount || '0'}. Add money to account.`
                    : `Warning triggers when remaining pocket funds drop to or below ${currencySymbol}${lowAmount || '0'}.`}
                </p>
              </div>
            )}

            {(alertMode === 'percent' || alertMode === 'both') && (
              <div className={`flex flex-col gap-1.5 ${alertMode === 'percent' ? 'sm:col-span-2' : ''} animate-in fade-in duration-150`}>
                <div className="flex items-center justify-between text-[11px] font-black uppercase text-[#121212]">
                  <span className="flex items-center gap-1">
                    <Percent size={11} className="text-[#FF8800]" />
                    Alert When Remaining Budget Is &le;
                  </span>
                  <span className="font-mono font-black text-[#FF8800] bg-white px-1.5 py-0.5 border border-[#121212]">
                    {lowPercent}% Remaining
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={lowPercent}
                  onChange={(e) => setLowPercent(e.target.value)}
                  className="accent-[#FF8800] cursor-pointer w-full"
                />
                <div className="flex justify-between text-[10px] font-mono font-bold text-neutral-500">
                  <span>5% (Tight)</span>
                  <span>20% (Default)</span>
                  <span>50% (Half Remaining)</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-[#FF4343] text-white text-xs font-bold p-2.5 border-2 border-[#121212] shadow-neo-sm">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2.5 pt-2">
          <NeoButton type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </NeoButton>
          <NeoButton type="submit" variant="secondary" disabled={isSubmitting}>
            {isSubmitting
              ? 'Saving...'
              : initialData
              ? 'Update Budget'
              : isRecurring
              ? 'Create Recurring Budget'
              : 'Create One-Time Budget'}
          </NeoButton>
        </div>
      </form>

      {/* Quick Add Category Modal */}
      {onCreateCategory && (
        <CategoryFormModal
          isOpen={isCategoryModalOpen}
          onClose={() => setIsCategoryModalOpen(false)}
          defaultType="expense"
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
