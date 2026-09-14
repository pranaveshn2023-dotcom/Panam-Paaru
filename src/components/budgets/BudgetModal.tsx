import React, { useState, useEffect } from 'react';
import { NeoModal } from '../ui/NeoModal';
import { NeoButton } from '../ui/NeoButton';
import { NeoInput } from '../ui/NeoInput';
import { Budget, Category, RecurrenceType, Wallet } from '../../types';
import { CalendarSync, Tag, AlertTriangle, ShieldAlert, Coins, Sparkles, RefreshCw, Layers } from 'lucide-react';

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
  }) => Promise<void>;
  initialData?: Budget | null;
  categories: Category[];
  wallets?: Wallet[];
  currencySymbol?: string;
}

export const BudgetModal: React.FC<BudgetModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  categories,
  wallets = [],
  currencySymbol = '₹',
}) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [initialLoadedAmount, setInitialLoadedAmount] = useState('');
  const [category, setCategory] = useState('');
  const [isRecurring, setIsRecurring] = useState(true);
  const [recurrence, setRecurrence] = useState<RecurrenceType>('monthly');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [sourceWalletId, setSourceWalletId] = useState<string>('');
  const [autoDeductFromWallet, setAutoDeductFromWallet] = useState(true);
  const [alertThreshold, setAlertThreshold] = useState('80');
  const [lowAmount, setLowAmount] = useState('');
  const [lowPercent, setLowPercent] = useState('20');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const expenseCategories = categories.filter((c) => c.type === 'expense');

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setAmount(String(initialData.amount));
      setInitialLoadedAmount(String(initialData.currentLoadedAmount ?? initialData.initialLoadedAmount ?? initialData.amount));
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
    } else {
      setName('');
      setAmount('5000');
      setInitialLoadedAmount('5000');
      setCategory(expenseCategories[0]?.name || 'Food & Dining');
      setIsRecurring(true);
      setRecurrence('monthly');
      setStartDate(new Date().toISOString().slice(0, 10));
      const defaultW = wallets.find((w) => w.isDefault) || wallets[0];
      setSourceWalletId(defaultW?._id || '');
      setAutoDeductFromWallet(true);
      setAlertThreshold('80');
      setLowAmount('1000');
      setLowPercent('20');
    }
    setError('');
  }, [initialData, isOpen, categories, wallets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    const numLoaded = initialLoadedAmount ? parseFloat(initialLoadedAmount) : numAmount;
    const numThreshold = parseInt(alertThreshold, 10);
    const numLowAmount = lowAmount ? parseFloat(lowAmount) : undefined;
    const numLowPercent = lowPercent ? parseInt(lowPercent, 10) : undefined;

    if (!name.trim()) {
      setError('Please provide a budget / pocket name');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid budget limit');
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
          initialLoadedAmount: !isNaN(numLoaded) && numLoaded > 0 ? numLoaded : numAmount,
          category,
          recurrence: effectiveRecurrence,
          isRecurring,
          startDate,
          sourceWalletId: sourceWalletId || undefined,
          autoDeductFromWallet: !!sourceWalletId && autoDeductFromWallet,
          alertThreshold: !isNaN(numThreshold) ? numThreshold : 80,
          lowBalanceThresholdAmount: numLowAmount,
          lowBalanceThresholdPercent: numLowPercent,
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

        {/* Dual Amounts: Target Limit & Initial Loaded Money */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Target Limit */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-black uppercase tracking-wider text-[#121212]">
              {isRecurring ? 'Cycle Budget Limit' : 'Total Setup Budget'} ({currencySymbol}) *
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
                onChange={(e) => setAmount(e.target.value)}
                placeholder="5000.00"
                className="neo-input pl-8 pr-3 py-2 text-base font-mono font-black text-[#121212]"
                required
              />
            </div>
          </div>

          {/* Initial Loaded Money */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-black uppercase tracking-wider text-[#121212] flex items-center gap-1">
              <Coins size={13} className="text-[#05DF72]" />
              Initial Loaded Capital ({currencySymbol})
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-sm font-mono font-black text-neutral-500 pointer-events-none">
                {currencySymbol}
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={initialLoadedAmount}
                onChange={(e) => setInitialLoadedAmount(e.target.value)}
                placeholder="5000.00"
                className="neo-input pl-8 pr-3 py-2 text-base font-mono font-black text-[#05DF72]"
              />
            </div>
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
                    : `Auto-deduct initial setup amount (${currencySymbol}${initialLoadedAmount || amount || '0'}) from this wallet on creation`}
                </span>
              </label>
            )}
          </div>
        )}

        {/* Category & Start Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Category Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-black uppercase tracking-wider text-[#121212] flex items-center gap-1">
              <Tag size={13} />
              Target Category *
            </label>
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
                : 'One-time setup budget with a fixed amount tracking category expenses'}
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
              <span>OFF (One-Time)</span>
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
                One-Time Setup Budget Mode Active
              </span>
              <p className="font-bold text-neutral-800 mt-0.5 leading-relaxed">
                This budget uses a fixed setup pool of <span className="font-mono font-black text-[#121212]">{currencySymbol}{amount || '0'}</span>. All transactions in category <span className="underline font-black text-[#121212]">{category || 'selected'}</span> starting from <span className="font-mono font-black">{startDate}</span> will deduct against this pool without periodic cycle resets.
              </p>
            </div>
          </div>
        )}

        {/* Low-Balance Alert Controls (Both Amount & Percentage) */}
        <div className="p-3 bg-[#FFFDF5] border-2 border-[#121212] shadow-neo-sm flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-black uppercase text-[#121212]">
            <ShieldAlert size={14} className="text-[#FF8800]" />
            <span>Low-Balance Top-up Alerts (Dual Thresholds)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Low Balance Alert by Amount */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-black uppercase text-neutral-600">
                Alert when Balance drops below ({currencySymbol})
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={lowAmount}
                onChange={(e) => setLowAmount(e.target.value)}
                placeholder="e.g. 1000"
                className="neo-input py-1.5 px-2.5 text-xs font-mono font-bold"
              />
            </div>

            {/* Low Balance Alert by Percent */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-black uppercase text-neutral-600 flex justify-between">
                <span>Alert when remaining is &le;</span>
                <span className="font-mono font-bold text-[#FF8800]">{lowPercent}%</span>
              </label>
              <input
                type="range"
                min="5"
                max="50"
                step="5"
                value={lowPercent}
                onChange={(e) => setLowPercent(e.target.value)}
                className="accent-[#FF8800] cursor-pointer"
              />
            </div>
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
    </NeoModal>
  );
};
