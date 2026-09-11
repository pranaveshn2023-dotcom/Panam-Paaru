import React, { useState, useRef, useEffect } from 'react';
import { NeoModal } from '../ui/NeoModal';
import { NeoButton } from '../ui/NeoButton';
import {
  extractRawGrid,
  parseInvestmentFile,
  parsePastedText,
  parseCleanNumber,
  cleanCurrency,
  cleanUnits,
  ParsedHolding,
  RawFileContent,
  PasswordRequiredError,
} from '../../utils/investmentParser';
import { detectDetailedAssetType } from '../../utils/liveMarketService';
import { AssetType, ImportBatch } from '../../types';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import {
  Upload,
  FileSpreadsheet,
  Check,
  AlertCircle,
  TrendingUp,
  Trash2,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronRight,
  Plus,
  SlidersHorizontal,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  RotateCcw,
  Clock,
  Building2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';

interface InvestmentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBatchImport: (
    items: {
      name: string;
      assetType: AssetType;
      subType?: string;
      sector?: string;
      broker?: string;
      investedAmount: number;
      currentValue: number;
      units?: number;
      buyPrice?: number;
      currentPrice?: number;
      xirr?: string;
      notes?: string;
    }[],
    fileName?: string,
    broker?: string
  ) => Promise<void>;
  currencySymbol?: string;
  initialFile?: File | null;
  onClearInitialFile?: () => void;
}

const GRANULAR_ASSET_TYPES: { label: string; assetType: AssetType; subType: string }[] = [
  { label: 'Equity Mutual Fund', assetType: 'mutual_fund', subType: 'Equity Mutual Fund' },
  { label: 'Hybrid Mutual Fund', assetType: 'mutual_fund', subType: 'Hybrid Mutual Fund' },
  { label: 'Debt Mutual Fund', assetType: 'mutual_fund', subType: 'Debt Mutual Fund' },
  { label: 'Stock / Equity', assetType: 'stocks', subType: 'Stock / Equity' },
  { label: 'Gold ETF', assetType: 'gold', subType: 'Gold ETF' },
  { label: 'Gold Mutual Fund', assetType: 'gold', subType: 'Gold Mutual Fund' },
  { label: 'Silver ETF', assetType: 'gold', subType: 'Silver ETF' },
  { label: 'Silver Mutual Fund', assetType: 'gold', subType: 'Silver Mutual Fund' },
  { label: 'Sovereign Gold Bond (SGB)', assetType: 'gold', subType: 'Sovereign Gold Bond (SGB)' },
  { label: 'Digital Gold / Silver', assetType: 'gold', subType: 'Digital Gold' },
  { label: 'Cryptocurrency', assetType: 'crypto', subType: 'Cryptocurrency' },
  { label: 'Fixed Deposit / Bonds', assetType: 'fd_rd', subType: 'Fixed Deposit / Bonds' },
  { label: 'Retirement & Provident', assetType: 'ppf_epf', subType: 'Retirement & Provident' },
  { label: 'Real Estate & REITs', assetType: 'real_estate', subType: 'Real Estate & REITs' },
  { label: 'Other Asset', assetType: 'other', subType: 'Other Asset' },
];

const BROKER_OPTIONS = [
  'Auto-Detect Broker',
  'CAMS / KFintech CAS',
  'Zerodha (Kite / Console)',
  'Groww',
  'Upstox',
  'Angel One',
  'INDmoney',
  'Dhan',
  'ICICI Direct',
  'HDFC Sky',
  'Bank Statement',
  'Custom CSV / Excel',
];

export const InvestmentImportModal: React.FC<InvestmentImportModalProps> = ({
  isOpen,
  onClose,
  onBatchImport,
  currencySymbol = '₹',
  initialFile,
  onClearInitialFile,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [importMode, setImportMode] = useState<'investments' | 'expenses'>('investments');
  const [selectedBroker, setSelectedBroker] = useState<string>('Auto-Detect Broker');
  const [isParsing, setIsParsing] = useState(false);
  const [rawGrid, setRawGrid] = useState<RawFileContent | null>(null);
  const [parsedHoldings, setParsedHoldings] = useState<ParsedHolding[]>([]);
  const [pastedText, setPastedText] = useState('');
  const [error, setError] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [isRecentImportsOpen, setIsRecentImportsOpen] = useState(false);

  // Password Protection State
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pdfPassword, setPdfPassword] = useState('');
  const [isPasswordPrompt, setIsPasswordPrompt] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Convex Queries & Mutations for Batch History & 1-Click Rollback
  const importBatches = useQuery(api.investments.listImportBatches, isOpen ? {} : 'skip') as ImportBatch[] | undefined;
  const undoBatchMutation = useMutation(api.investments.undoImportBatch);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetState = () => {
    setParsedHoldings([]);
    setRawGrid(null);
    setPastedText('');
    setError('');
    setIsParsing(false);
    setIsImporting(false);
    setExpandedRows({});
    setPendingFile(null);
    setPdfPassword('');
    setIsPasswordPrompt(false);
    setPasswordError('');
    setShowPassword(false);
  };

  const processFile = async (file: File) => {
    try {
      setIsParsing(true);
      setError('');
      setIsPasswordPrompt(false);
      setPasswordError('');

      const result = await parseInvestmentFile(file);
      setRawGrid(result.rawGrid);

      if (result.holdings.length > 0) {
        setParsedHoldings(result.holdings);
      } else {
        setError('No holdings found in file. Please ensure it is a statement or copy-paste rows.');
      }
      setIsParsing(false);
    } catch (err: any) {
      setIsParsing(false);
      if (
        err?.isPasswordRequired ||
        err instanceof PasswordRequiredError ||
        String(err?.message || '').toLowerCase().includes('password')
      ) {
        setPendingFile(file);
        setIsPasswordPrompt(true);
        setPasswordError(err?.isIncorrectPassword ? 'Incorrect password. Try PAN in uppercase or DOB.' : '');
      } else {
        setError(err?.message || 'Failed to read file. Please try pasting the table rows directly.');
      }
    }
  };

  // Automatically process file if opened directly (e.g. via Ctrl+U)
  useEffect(() => {
    if (isOpen && initialFile) {
      processFile(initialFile);
      onClearInitialFile?.();
    }
  }, [isOpen, initialFile]);

  // Handle Ctrl+U while modal is already active
  useEffect(() => {
    if (!isOpen) return;
    const handleModalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        e.stopPropagation();
        fileInputRef.current?.click();
      }
    };
    window.addEventListener('keydown', handleModalKeyDown, true);
    return () => window.removeEventListener('keydown', handleModalKeyDown, true);
  }, [isOpen]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUnlockPdf = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pendingFile || !pdfPassword.trim()) return;

    try {
      setIsParsing(true);
      setPasswordError('');
      const result = await parseInvestmentFile(pendingFile, pdfPassword.trim());
      setRawGrid(result.rawGrid);

      if (result.holdings.length > 0) {
        setParsedHoldings(result.holdings);
        setIsPasswordPrompt(false);
      } else {
        setError('Password accepted, but no asset rows were found.');
        setIsPasswordPrompt(false);
      }
      setIsParsing(false);
    } catch (err: any) {
      setIsParsing(false);
      if (
        err?.isPasswordRequired ||
        err instanceof PasswordRequiredError ||
        String(err?.message || '').toLowerCase().includes('password')
      ) {
        setPasswordError(
          err?.isIncorrectPassword
            ? 'Incorrect password. (CAS statements usually use PAN in uppercase or DOB DDMMYYYY).'
            : 'Password required to unlock this statement.'
        );
      } else {
        setPasswordError(err?.message || 'Failed to decrypt and parse PDF.');
      }
    }
  };

  const handleParsePasted = () => {
    if (!pastedText.trim()) {
      setError('Please paste your table rows or CSV text.');
      return;
    }

    try {
      const extracted = parsePastedText(pastedText);
      if (extracted.length === 0) {
        setError('Could not extract rows. Make sure each line has a Name and at least one Amount.');
        return;
      }
      setParsedHoldings(extracted);
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Failed to parse pasted text.');
    }
  };

  const handleAddNewRow = () => {
    const newId = `custom_${Date.now()}`;
    setParsedHoldings((prev) => [
      ...prev,
      {
        id: newId,
        name: 'New Asset',
        assetType: 'mutual_fund',
        subType: 'Equity Mutual Fund',
        investedAmount: 10000,
        currentValue: 10000,
        units: 100,
        selected: true,
        isValid: true,
      },
    ]);
  };

  const toggleSelectAll = () => {
    const allSelected = parsedHoldings.every((h) => h.selected);
    setParsedHoldings((prev) => prev.map((h) => ({ ...h, selected: !allSelected })));
  };

  const toggleItem = (id: string) => {
    setParsedHoldings((prev) =>
      prev.map((h) => (h.id === id ? { ...h, selected: !h.selected } : h))
    );
  };

  const toggleRowExpansion = (id: string) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const updateItemField = (id: string, field: keyof ParsedHolding, val: any) => {
    setParsedHoldings((prev) =>
      prev.map((h) => {
        if (h.id !== id) return h;
        const updated = { ...h, [field]: val };
        if (field === 'investedAmount' || field === 'currentValue') {
          updated.returns = cleanCurrency(updated.currentValue - updated.investedAmount);
        }
        // Recalculate validity
        updated.isValid = Boolean(updated.name.trim() && (updated.currentValue > 0 || updated.investedAmount > 0));
        return updated;
      })
    );
  };

  const handleTypeChange = (id: string, compositeValue: string) => {
    const found = GRANULAR_ASSET_TYPES.find((t) => t.subType === compositeValue);
    if (found) {
      setParsedHoldings((prev) =>
        prev.map((h) =>
          h.id === id ? { ...h, assetType: found.assetType, subType: found.subType } : h
        )
      );
    } else {
      setParsedHoldings((prev) =>
        prev.map((h) =>
          h.id === id ? { ...h, subType: compositeValue } : h
        )
      );
    }
  };

  const removeItem = (id: string) => {
    setParsedHoldings((prev) => prev.filter((h) => h.id !== id));
  };

  const handleUndoBatch = async (batchId: string) => {
    try {
      const res = await undoBatchMutation({ batchId: batchId as any });
      toast.success(`Rolled back import batch (${res.removedCount} items removed).`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to undo import.');
    }
  };

  const validCount = parsedHoldings.filter((h) => h.isValid).length;
  const selectedCount = parsedHoldings.filter((h) => h.selected && h.isValid).length;
  const totalSelectedCurrent = parsedHoldings
    .filter((h) => h.selected && h.isValid)
    .reduce((sum, h) => sum + h.currentValue, 0);
  const totalSelectedInvested = parsedHoldings
    .filter((h) => h.selected && h.isValid)
    .reduce((sum, h) => sum + h.investedAmount, 0);

  const handleImportCommit = async () => {
    const selected = parsedHoldings.filter((h) => h.selected && h.isValid && h.name.trim());
    if (selected.length === 0) {
      setError('Please select at least 1 valid holding to import.');
      return;
    }

    try {
      setIsImporting(true);
      setError('');

      const brokerTag = selectedBroker === 'Auto-Detect Broker' ? undefined : selectedBroker;
      const fileName = rawGrid?.fileName || (activeTab === 'paste' ? 'Pasted Table' : 'Statement Import');

      await onBatchImport(
        selected.map((h) => ({
          name: h.name.trim(),
          assetType: h.assetType,
          subType: h.subType,
          sector: h.sector,
          broker: h.broker || brokerTag,
          investedAmount: cleanCurrency(h.investedAmount),
          currentValue: cleanCurrency(h.currentValue),
          units: cleanUnits(h.units),
          buyPrice: h.buyPrice ? cleanCurrency(h.buyPrice) : undefined,
          currentPrice: h.currentPrice ? cleanCurrency(h.currentPrice) : undefined,
          xirr: h.xirr,
          notes: h.notes
            ? (h.folioNo && !h.notes.includes(h.folioNo) ? `${h.notes} | Folio: ${h.folioNo}` : h.notes)
            : (h.folioNo ? `Folio: ${h.folioNo}` : 'Statement Import'),
        })),
        fileName,
        brokerTag
      );

      try {
        confetti({
          particleCount: 70,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#05DF72', '#FFE600', '#121212'],
        });
      } catch (e) {}

      setIsImporting(false);
      resetState();
      onClose();
    } catch (err: any) {
      setIsImporting(false);
      setError(err?.message || 'Failed to import holdings.');
    }
  };

  return (
    <NeoModal
      isOpen={isOpen}
      onClose={() => {
        resetState();
        onClose();
      }}
      title=""
      maxWidth="xl"
    >
      <div className="flex flex-col gap-4">
        
        {/* Header matching Image 2 */}
        <div className="pb-1 border-b-2 border-[#121212]">
          <h2 className="text-2xl font-black uppercase text-[#121212] tracking-tight">
            Import
          </h2>
          <p className="text-xs font-semibold text-neutral-600 mt-0.5">
            Bulk import assets, income & expenses across any broker statement
          </p>
        </div>

        {/* Green instructions notice matching Image 2 */}
        <div className="p-3 bg-[#E8F8F0] border-2 border-[#05DF72] rounded-none text-xs font-bold text-[#0B6B38] flex items-center justify-between gap-2 shadow-neo-sm">
          <span>
            Review and edit any row before importing. Click a cell to edit, use the dropdown to change asset class, or remove rows with the X button.
          </span>
          {parsedHoldings.length > 0 && (
            <button
              onClick={handleAddNewRow}
              className="px-2.5 py-1 bg-[#121212] text-white text-[10px] font-black uppercase hover:bg-neutral-800 transition-all cursor-pointer shrink-0 flex items-center gap-1"
            >
              <Plus size={12} /> Add Row
            </button>
          )}
        </div>

        {/* Step 1: Upload or Paste Selector */}
        {parsedHoldings.length === 0 && !isPasswordPrompt && (
          <div className="flex flex-col gap-3">
            {/* Broker & Type Selector */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#FFFDF5] p-2.5 border-2 border-[#121212]">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-neutral-600">Source:</span>
                <select
                  value={selectedBroker}
                  onChange={(e) => setSelectedBroker(e.target.value)}
                  className="px-2 py-1 text-xs font-bold bg-white border border-[#121212] cursor-pointer"
                >
                  {BROKER_OPTIONS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setImportMode('investments')}
                  className={`px-2.5 py-1 text-[11px] font-black uppercase border transition-all cursor-pointer ${
                    importMode === 'investments'
                      ? 'bg-[#FFE600] text-[#121212] border-[#121212]'
                      : 'bg-white text-neutral-600 border-neutral-300'
                  }`}
                >
                  Assets & Holdings
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('expenses')}
                  className={`px-2.5 py-1 text-[11px] font-black uppercase border transition-all cursor-pointer ${
                    importMode === 'expenses'
                      ? 'bg-[#FFE600] text-[#121212] border-[#121212]'
                      : 'bg-white text-neutral-600 border-neutral-300'
                  }`}
                >
                  Expenses & Income
                </button>
              </div>
            </div>

            {/* Upload or Paste Tab Switcher */}
            <div className="flex items-center gap-2 border-b-2 border-[#121212] pb-2">
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`px-3 py-1.5 text-xs font-black uppercase border-2 transition-all cursor-pointer ${
                  activeTab === 'upload'
                    ? 'bg-[#FFE600] text-[#121212] border-[#121212] shadow-neo-sm'
                    : 'bg-white text-neutral-600 border-neutral-300'
                }`}
              >
                Upload File (.pdf, .xlsx, .docx, .csv)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('paste')}
                className={`px-3 py-1.5 text-xs font-black uppercase border-2 transition-all cursor-pointer ${
                  activeTab === 'paste'
                    ? 'bg-[#FFE600] text-[#121212] border-[#121212] shadow-neo-sm'
                    : 'bg-white text-neutral-600 border-neutral-300'
                }`}
              >
                Copy & Paste Table / CSV
              </button>
            </div>

            {activeTab === 'upload' ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-8 border-[3px] border-dashed border-[#121212] bg-[#FFFDF5] hover:bg-[#FFE600]/20 transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-3"
              >
                <div className="w-14 h-14 bg-[#FFE600] border-2 border-[#121212] shadow-neo flex items-center justify-center font-black">
                  <Upload size={28} />
                </div>
                <div>
                  <h4 className="text-sm font-black uppercase text-[#121212]">
                    Click or Drag & Drop your Statement File
                  </h4>
                  <p className="text-xs font-semibold text-neutral-600 mt-1 max-w-md">
                    Universal support: CAMS & KFintech CAS (PDF), Zerodha, Groww, Upstox, Angel One, INDmoney, Word (.docx), and all spreadsheets (.xlsx, .csv).
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-1 text-[11px] font-mono font-bold text-neutral-500">
                  <span className="px-2 py-0.5 bg-white border border-[#121212]">.PDF (CAS)</span>
                  <span className="px-2 py-0.5 bg-white border border-[#121212]">.XLSX</span>
                  <span className="px-2 py-0.5 bg-white border border-[#121212]">.DOCX</span>
                  <span className="px-2 py-0.5 bg-white border border-[#121212]">.CSV</span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.xlsx,.xls,.csv,.tsv,.docx,.doc"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-bold text-neutral-700">
                  Copy rows from your broker table, Excel, or Google Sheets and paste here:
                </p>
                <textarea
                  rows={6}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={`HDFC Mid Cap Fund Direct Growth\t14.402\t3362.69\nParag Parikh Flexi Cap Fund Direct Growth\t164.957\t15184.74\nRELIANCE\t10\t28905`}
                  className="w-full p-2.5 font-mono text-xs border-2 border-[#121212] shadow-neo-sm bg-white"
                />
                <NeoButton
                  type="button"
                  variant="dark"
                  onClick={handleParsePasted}
                  className="self-start flex items-center gap-1.5"
                >
                  <Sparkles size={15} />
                  <span>Parse Pasted Table</span>
                </NeoButton>
              </div>
            )}

            {isParsing && (
              <div className="p-3 bg-[#FFE600] border-2 border-[#121212] shadow-neo-sm text-xs font-black uppercase flex items-center justify-center gap-2 animate-pulse">
                <Sparkles size={16} />
                <span>Reading and extracting statement entities...</span>
              </div>
            )}
          </div>
        )}

        {/* Step 1.5: Password Unlock Form for Encrypted PDFs */}
        {isPasswordPrompt && pendingFile && (
          <form onSubmit={handleUnlockPdf} className="flex flex-col gap-3 p-5 bg-[#FFFDF5] border-2 border-[#121212] shadow-neo">
            <div className="flex items-center gap-2.5 pb-2 border-b-2 border-[#121212]">
              <div className="w-9 h-9 bg-[#FFE600] border-2 border-[#121212] flex items-center justify-center font-black shrink-0">
                <Lock size={18} />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase text-[#121212]">
                  Password Protected Statement: {pendingFile.name}
                </h4>
                <p className="text-[11px] font-semibold text-neutral-600">
                  CAMS & KFintech CAS PDFs are encrypted with your PAN or Date of Birth.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase text-neutral-700">
                Enter Statement Password
              </label>
              <div className="relative flex items-center">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoFocus
                  value={pdfPassword}
                  onChange={(e) => setPdfPassword(e.target.value)}
                  placeholder="e.g. ABCDE1234F or 01011990"
                  className="w-full p-2 pr-10 border-2 border-[#121212] font-mono text-xs font-bold bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 text-neutral-500 hover:text-black cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <span className="text-[10px] text-neutral-500 font-semibold">
                Tip: Most statements use your PAN in UPPERCASE (e.g. ABCDE1234F). Some use Date of Birth (DDMMYYYY).
              </span>
            </div>

            {passwordError && (
              <div className="p-2 bg-[#FF4343] text-white text-xs font-bold border-2 border-[#121212] flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{passwordError}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <NeoButton
                type="button"
                variant="outline"
                size="sm"
                onClick={() => resetState()}
              >
                Choose Another File
              </NeoButton>
              <NeoButton
                type="submit"
                variant="secondary"
                size="sm"
                disabled={isParsing || !pdfPassword.trim()}
                className="flex items-center gap-1.5"
              >
                <KeyRound size={14} />
                <span>{isParsing ? 'Decrypting...' : 'Unlock & Extract'}</span>
              </NeoButton>
            </div>
          </form>
        )}

        {/* Step 2: Review Table Matching Image 2 */}
        {parsedHoldings.length > 0 && (
          <div className="flex flex-col gap-3">
            
            {/* Financial Totals Bar */}
            <div className="flex flex-wrap items-center justify-end gap-3 bg-[#FFFDF5] p-2.5 border-2 border-[#121212] shadow-neo-sm">
              <div className="flex items-center gap-3 text-xs font-mono">
                <div>
                  <span className="text-neutral-500 font-bold uppercase text-[10px]">Invested: </span>
                  <span className="font-black text-[#121212]">
                    ₹{totalSelectedInvested.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 font-bold uppercase text-[10px]">Current: </span>
                  <span className="font-black text-[#121212]">
                    ₹{totalSelectedCurrent.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 font-bold uppercase text-[10px]">P&L: </span>
                  <span
                    className={`font-black ${
                      totalSelectedCurrent >= totalSelectedInvested ? 'text-[#0B6B38]' : 'text-[#DC2626]'
                    }`}
                  >
                    {totalSelectedCurrent >= totalSelectedInvested ? '+' : ''}
                    ₹{(totalSelectedCurrent - totalSelectedInvested).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* Table Header & Rows */}
            <div className="border-2 border-[#121212] bg-white overflow-x-auto max-h-[380px] overflow-y-auto">
              <table className="w-full text-left text-xs font-bold border-collapse">
                <thead className="bg-[#121212] text-white sticky top-0 z-10 text-[11px] font-black uppercase tracking-wider">
                  <tr>
                    <th className="p-2.5 w-8 text-center">
                      <input
                        type="checkbox"
                        checked={parsedHoldings.length > 0 && parsedHoldings.every((h) => h.selected)}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 accent-[#05DF72] cursor-pointer"
                      />
                    </th>
                    <th className="p-2.5 w-8 text-center"></th>
                    <th className="p-2.5 w-6 text-center">●</th>
                    <th className="p-2.5 min-w-[200px]">NAME</th>
                    <th className="p-2.5 min-w-[150px]">TYPE</th>
                    <th className="p-2.5 text-right min-w-[105px]">INVESTED</th>
                    <th className="p-2.5 text-right min-w-[105px]">CUR. VALUE</th>
                    <th className="p-2.5 text-right min-w-[95px]">RETURNS</th>
                    <th className="p-2.5 text-right min-w-[80px]">QTY</th>
                    <th className="p-2.5 text-right min-w-[80px]">XIRR</th>
                    <th className="p-2.5 w-8 text-center">✕</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {parsedHoldings.map((h) => {
                    const isExpanded = Boolean(expandedRows[h.id]);
                    return (
                      <React.Fragment key={h.id}>
                        <tr
                          className={`hover:bg-[#FFFDF5] transition-colors ${
                            h.selected ? 'bg-white' : 'bg-neutral-100 opacity-60'
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="p-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={h.selected}
                              onChange={() => toggleItem(h.id)}
                              className="w-4 h-4 accent-[#05DF72] cursor-pointer"
                            />
                          </td>

                          {/* Expand chevron */}
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => toggleRowExpansion(h.id)}
                              className="text-neutral-500 hover:text-black cursor-pointer"
                              title="Toggle details"
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          </td>

                          {/* Green valid status dot */}
                          <td className="p-2.5 text-center">
                            <span
                              className={`w-2 h-2 rounded-full inline-block ${
                                h.isValid ? 'bg-[#05DF72]' : 'bg-[#FF4343]'
                              }`}
                              title={h.isValid ? 'Valid entity' : 'Invalid entity'}
                            />
                          </td>

                          {/* Name cell (editable) */}
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={h.name}
                              onChange={(e) => updateItemField(h.id, 'name', e.target.value)}
                              className="w-full p-1 bg-transparent hover:bg-neutral-100 focus:bg-white border border-transparent hover:border-neutral-300 focus:border-[#121212] font-black text-xs text-[#121212]"
                            />
                          </td>

                          {/* Type dropdown cell */}
                          <td className="p-2.5">
                            <select
                              value={h.subType || h.assetType}
                              onChange={(e) => handleTypeChange(h.id, e.target.value)}
                              className="w-full p-1 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 text-xs font-bold cursor-pointer text-[#121212]"
                            >
                              {h.subType && !GRANULAR_ASSET_TYPES.some((t) => t.subType === h.subType) && (
                                <option value={h.subType}>{h.subType} (from file)</option>
                              )}
                              {GRANULAR_ASSET_TYPES.map((t) => (
                                <option key={t.subType} value={t.subType}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Invested cell (editable) */}
                          <td className="p-2.5 text-right font-mono font-bold text-xs text-[#121212]">
                            <input
                              type="number"
                              step="0.01"
                              value={h.investedAmount}
                              onChange={(e) =>
                                updateItemField(h.id, 'investedAmount', parseFloat(e.target.value) || 0)
                              }
                              className="w-24 p-1 text-right font-mono font-bold text-xs border border-transparent hover:border-neutral-300 focus:border-[#121212] bg-transparent hover:bg-neutral-100 focus:bg-white"
                            />
                          </td>

                          {/* Cur. Value cell (editable) */}
                          <td className="p-2.5 text-right font-mono font-black text-xs text-[#121212]">
                            <input
                              type="number"
                              step="0.01"
                              value={h.currentValue}
                              onChange={(e) =>
                                updateItemField(h.id, 'currentValue', parseFloat(e.target.value) || 0)
                              }
                              className="w-24 p-1 text-right font-mono font-black text-xs border border-transparent hover:border-neutral-300 focus:border-[#121212] bg-transparent hover:bg-neutral-100 focus:bg-white"
                            />
                          </td>

                          {/* Returns (P&L) cell */}
                          <td className="p-2.5 text-right font-mono font-black text-xs">
                            {(() => {
                              const ret = h.returns !== undefined ? h.returns : cleanCurrency(h.currentValue - h.investedAmount);
                              const isPos = ret >= 0;
                              return (
                                <span className={isPos ? 'text-[#0B6B38]' : 'text-[#DC2626]'}>
                                  {isPos ? '+' : ''}₹{ret.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              );
                            })()}
                          </td>

                          {/* Qty cell (editable) */}
                          <td className="p-2.5 text-right font-mono text-xs font-bold text-neutral-700">
                            <input
                              type="number"
                              step="0.001"
                              value={h.units ?? ''}
                              placeholder="—"
                              onChange={(e) =>
                                updateItemField(
                                  h.id,
                                  'units',
                                  e.target.value ? parseFloat(e.target.value) : undefined
                                )
                              }
                              className="w-20 p-1 text-right font-mono text-xs border border-transparent hover:border-neutral-300 focus:border-[#121212] bg-transparent hover:bg-neutral-100 focus:bg-white"
                            />
                          </td>

                          {/* XIRR cell (editable) */}
                          <td className="p-2.5 text-right font-mono font-bold text-xs text-[#121212]">
                            <input
                              type="text"
                              value={h.xirr ?? ''}
                              placeholder="—"
                              onChange={(e) =>
                                updateItemField(h.id, 'xirr', e.target.value || undefined)
                              }
                              className="w-20 p-1 text-right font-mono font-bold text-xs border border-transparent hover:border-neutral-300 focus:border-[#121212] bg-transparent hover:bg-neutral-100 focus:bg-white text-[#121212]"
                            />
                          </td>

                          {/* Remove button */}
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => removeItem(h.id)}
                              className="text-neutral-400 hover:text-[#FF4343] cursor-pointer"
                              title="Remove row"
                            >
                              <X size={14} />
                            </button>
                          </td>
                        </tr>

                        {/* Collapsible Row Details */}
                        {isExpanded && (
                          <tr className="bg-[#FFFDF5] border-b border-neutral-300 text-[11px]">
                            <td colSpan={11} className="p-3 pl-12">
                              <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                                <div>
                                  <label className="text-[10px] font-black uppercase text-neutral-500 block mb-0.5">
                                    Invested Cost ({currencySymbol})
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={h.investedAmount}
                                    onChange={(e) =>
                                      updateItemField(h.id, 'investedAmount', parseFloat(e.target.value) || 0)
                                    }
                                    className="w-full p-1 border border-neutral-300 font-mono text-xs bg-white"
                                  />
                                </div>

                                <div>
                                  <label className="text-[10px] font-black uppercase text-neutral-500 block mb-0.5">
                                    Price / NAV ({currencySymbol})
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={h.currentPrice ?? ''}
                                    placeholder="—"
                                    onChange={(e) =>
                                      updateItemField(
                                        h.id,
                                        'currentPrice',
                                        e.target.value ? parseFloat(e.target.value) : undefined
                                      )
                                    }
                                    className="w-full p-1 border border-neutral-300 font-mono text-xs bg-white"
                                  />
                                </div>

                                <div>
                                  <label className="text-[10px] font-black uppercase text-neutral-500 block mb-0.5">
                                    Sector
                                  </label>
                                  <input
                                    type="text"
                                    value={h.sector || ''}
                                    placeholder="e.g. IT, Banking"
                                    onChange={(e) => updateItemField(h.id, 'sector', e.target.value || undefined)}
                                    className="w-full p-1 border border-neutral-300 text-xs bg-white"
                                  />
                                </div>

                                <div>
                                  <label className="text-[10px] font-black uppercase text-neutral-500 block mb-0.5">
                                    Broker
                                  </label>
                                  <input
                                    type="text"
                                    value={h.broker || ''}
                                    placeholder="e.g. Zerodha, Groww"
                                    onChange={(e) => updateItemField(h.id, 'broker', e.target.value || undefined)}
                                    className="w-full p-1 border border-neutral-300 text-xs bg-white"
                                  />
                                </div>

                                <div>
                                  <label className="text-[10px] font-black uppercase text-neutral-500 block mb-0.5">
                                    Folio / ISIN
                                  </label>
                                  <input
                                    type="text"
                                    value={h.folioNo || ''}
                                    placeholder="e.g. Folio / Demat No."
                                    onChange={(e) => updateItemField(h.id, 'folioNo', e.target.value || undefined)}
                                    className="w-full p-1 border border-neutral-300 text-xs bg-white"
                                  />
                                </div>

                                <div>
                                  <label className="text-[10px] font-black uppercase text-neutral-500 block mb-0.5">
                                    XIRR / Return %
                                  </label>
                                  <input
                                    type="text"
                                    value={h.xirr || ''}
                                    placeholder="e.g. 17.3%"
                                    onChange={(e) => updateItemField(h.id, 'xirr', e.target.value || undefined)}
                                    className="w-full p-1 border border-neutral-300 font-mono text-xs bg-white"
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="bg-[#FF4343] text-white text-xs font-bold p-2.5 border-2 border-[#121212] shadow-neo-sm flex items-center gap-2">
                <AlertCircle size={16} strokeWidth={2.5} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => resetState()}
                className="text-xs font-bold text-neutral-600 hover:text-black cursor-pointer underline text-center sm:text-left py-1"
              >
                Upload different file
              </button>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    resetState();
                    onClose();
                  }}
                  className="px-4 py-2 text-xs font-black uppercase bg-transparent hover:bg-neutral-100 text-neutral-700 hover:text-black cursor-pointer text-center"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleImportCommit}
                  disabled={isImporting || selectedCount === 0}
                  className="px-5 py-2.5 bg-[#05DF72] hover:bg-[#04C966] text-[#121212] text-xs font-black uppercase border-2 border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Check size={16} strokeWidth={3} />
                  <span>
                    {isImporting ? 'Importing...' : `Update & Import ${selectedCount} assets`}
                  </span>
                </button>
              </div>
            </div>

          </div>
        )}

        {/* Step 3: Recent Imports Accordion matching Image 2 */}
        <div className="border-t-2 border-[#121212] pt-3 mt-1">
          <button
            type="button"
            onClick={() => setIsRecentImportsOpen(!isRecentImportsOpen)}
            className="w-full flex items-center justify-between text-xs font-black uppercase text-[#121212] cursor-pointer hover:bg-neutral-100 p-1.5 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              {isRecentImportsOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              <span>Recent imports</span>
            </div>
            <span className="text-[10px] font-bold text-neutral-500 lowercase">
              {importBatches && importBatches.length > 0 ? `${importBatches.length} batch(es)` : 'none yet'}
            </span>
          </button>

          {isRecentImportsOpen && (
            <div className="p-3 bg-[#FFFDF5] border border-neutral-300 mt-2 text-xs font-semibold text-neutral-600 flex flex-col gap-2">
              {importBatches && importBatches.length > 0 ? (
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                  {importBatches.map((b) => (
                    <div
                      key={b._id}
                      className="p-2 bg-white border border-[#121212] flex items-center justify-between gap-2 shadow-neo-sm"
                    >
                      <div>
                        <div className="font-black text-[#121212] flex items-center gap-1.5">
                          <Building2 size={13} />
                          <span>{b.fileName}</span>
                          {b.broker && (
                            <span className="text-[9px] px-1.5 py-0.2 bg-[#FFE600] text-[#121212] border border-[#121212]">
                              {b.broker}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
                          {new Date(b.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          · {b.itemCount} assets · {currencySymbol}
                          {b.totalValue.toLocaleString('en-IN')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUndoBatch(b._id)}
                        className="px-2.5 py-1 text-[10px] font-black uppercase bg-[#FFF0F0] text-[#FF4343] border border-[#FF4343] hover:bg-[#FF4343] hover:text-white transition-all cursor-pointer flex items-center gap-1"
                      >
                        <RotateCcw size={11} /> Undo Import
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-start gap-2 text-[11px] text-neutral-600">
                  <Clock size={15} className="text-neutral-400 shrink-0 mt-0.5" />
                  <span>
                    No imports yet. Once you import a CSV, bank statement, or asset file, recent batches will appear here so you can undo any of them in one click.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </NeoModal>
  );
};
