import React, { useState, useRef } from 'react';
import { NeoModal } from '../ui/NeoModal';
import { NeoButton } from '../ui/NeoButton';
import {
  extractRawGrid,
  autoExtractHoldings,
  parseInvestmentFile,
  parsePastedText,
  parseCleanNumber,
  detectAssetType,
  ParsedHolding,
  RawFileContent,
  PasswordRequiredError,
} from '../../utils/investmentParser';
import { AssetType } from '../../types';
import {
  Upload,
  FileSpreadsheet,
  Check,
  AlertCircle,
  TrendingUp,
  Trash2,
  Sparkles,
  Layers,
  Clipboard,
  Plus,
  SlidersHorizontal,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface InvestmentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBatchImport: (
    items: {
      name: string;
      assetType: AssetType;
      investedAmount: number;
      currentValue: number;
      units?: number;
      buyPrice?: number;
      currentPrice?: number;
      notes?: string;
    }[]
  ) => Promise<void>;
  currencySymbol?: string;
}

const ASSET_TYPES: { label: string; value: AssetType }[] = [
  { label: 'Mutual Fund', value: 'mutual_fund' },
  { label: 'Stocks', value: 'stocks' },
  { label: 'FD & RD', value: 'fd_rd' },
  { label: 'Gold & Silver', value: 'gold' },
  { label: 'Crypto', value: 'crypto' },
  { label: 'PPF / EPF', value: 'ppf_epf' },
  { label: 'Real Estate', value: 'real_estate' },
  { label: 'Other', value: 'other' },
];

export const InvestmentImportModal: React.FC<InvestmentImportModalProps> = ({
  isOpen,
  onClose,
  onBatchImport,
  currencySymbol = '₹',
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [isParsing, setIsParsing] = useState(false);
  const [rawGrid, setRawGrid] = useState<RawFileContent | null>(null);
  const [parsedHoldings, setParsedHoldings] = useState<ParsedHolding[]>([]);
  const [pastedText, setPastedText] = useState('');
  const [error, setError] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [showColumnMapper, setShowColumnMapper] = useState(false);

  // Password Protection State
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pdfPassword, setPdfPassword] = useState('');
  const [isPasswordPrompt, setIsPasswordPrompt] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Column Mapper State
  const [selectedSheetIdx, setSelectedSheetIdx] = useState(0);
  const [headerRowIdx, setHeaderRowIdx] = useState(0);
  const [nameColIdx, setNameColIdx] = useState<number>(0);
  const [investedColIdx, setInvestedColIdx] = useState<number>(1);
  const [currentColIdx, setCurrentColIdx] = useState<number>(2);
  const [qtyColIdx, setQtyColIdx] = useState<number>(-1);
  const [buyPriceColIdx, setBuyPriceColIdx] = useState<number>(-1);
  const [curPriceColIdx, setCurPriceColIdx] = useState<number>(-1);
  const [notesColIdx, setNotesColIdx] = useState<number>(-1);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetState = () => {
    setParsedHoldings([]);
    setRawGrid(null);
    setPastedText('');
    setError('');
    setIsParsing(false);
    setIsImporting(false);
    setShowColumnMapper(false);
    setPendingFile(null);
    setPdfPassword('');
    setIsPasswordPrompt(false);
    setPasswordError('');
    setShowPassword(false);
    setNameColIdx(0);
    setInvestedColIdx(1);
    setCurrentColIdx(2);
    setQtyColIdx(-1);
    setBuyPriceColIdx(-1);
    setCurPriceColIdx(-1);
    setNotesColIdx(-1);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsParsing(true);
      setError('');
      setIsPasswordPrompt(false);
      setPasswordError('');

      const result = await parseInvestmentFile(file);
      setRawGrid(result.rawGrid);

      if (result.holdings.length > 0) {
        setParsedHoldings(result.holdings);
        setShowColumnMapper(false);
      } else {
        // Fallback to Visual Column Mapper if automatic heuristics need user alignment
        setShowColumnMapper(true);
        if (result.rawGrid.sheets[0]?.rows?.[0]) {
          setNameColIdx(0);
          setInvestedColIdx(Math.min(1, result.rawGrid.sheets[0].rows[0].length - 1));
          setCurrentColIdx(Math.min(2, result.rawGrid.sheets[0].rows[0].length - 1));
        }
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
        setError(err?.message || 'Failed to read file. Please try pasting the text/table directly.');
      }
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
        setShowColumnMapper(false);
      } else {
        setShowColumnMapper(true);
        setIsPasswordPrompt(false);
        if (result.rawGrid.sheets[0]?.rows?.[0]) {
          setNameColIdx(0);
          setInvestedColIdx(Math.min(1, result.rawGrid.sheets[0].rows[0].length - 1));
          setCurrentColIdx(Math.min(2, result.rawGrid.sheets[0].rows[0].length - 1));
        }
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
            : 'Password required to unlock this PDF.'
        );
      } else {
        setPasswordError(err?.message || 'Failed to decrypt and parse PDF.');
      }
    }
  };

  const handleApplyColumnMapping = () => {
    if (!rawGrid || !rawGrid.sheets[selectedSheetIdx]) return;
    const sheet = rawGrid.sheets[selectedSheetIdx];
    const rows = sheet.rows;

    const holdings: ParsedHolding[] = [];
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const name = String(row[nameColIdx] || '').trim();
      if (!name) continue;

      const invested = parseCleanNumber(row[investedColIdx]);
      const current = parseCleanNumber(row[currentColIdx]) || invested;
      const units = qtyColIdx !== -1 ? parseCleanNumber(row[qtyColIdx]) : undefined;
      const buyPrice = buyPriceColIdx !== -1 ? parseCleanNumber(row[buyPriceColIdx]) : undefined;
      const currentPrice = curPriceColIdx !== -1 ? parseCleanNumber(row[curPriceColIdx]) : undefined;
      const notes = notesColIdx !== -1 ? String(row[notesColIdx] || '').trim() : 'Statement Import';

      if (invested > 0 || current > 0) {
        holdings.push({
          id: `manual_${r}_${Date.now()}`,
          name,
          assetType: detectAssetType(name),
          investedAmount: Math.abs(Number(invested.toFixed(2))),
          currentValue: Math.abs(Number(current.toFixed(2))),
          units: units && units > 0 ? Number(units.toFixed(3)) : undefined,
          buyPrice: buyPrice && buyPrice > 0 ? Number(buyPrice.toFixed(2)) : undefined,
          currentPrice: currentPrice && currentPrice > 0 ? Number(currentPrice.toFixed(2)) : undefined,
          notes: notes || 'Statement Import',
          selected: true,
        });
      }
    }

    if (holdings.length === 0) {
      setError('No valid rows found with the selected columns. Please check your column selections.');
      return;
    }

    setParsedHoldings(holdings);
    setShowColumnMapper(false);
    setError('');
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
        investedAmount: 10000,
        currentValue: 10000,
        selected: true,
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

  const updateItemField = (id: string, field: keyof ParsedHolding, val: any) => {
    setParsedHoldings((prev) =>
      prev.map((h) => (h.id === id ? { ...h, [field]: val } : h))
    );
  };

  const removeItem = (id: string) => {
    setParsedHoldings((prev) => prev.filter((h) => h.id !== id));
  };

  const selectedCount = parsedHoldings.filter((h) => h.selected).length;
  const totalSelectedInvested = parsedHoldings
    .filter((h) => h.selected)
    .reduce((sum, h) => sum + h.investedAmount, 0);
  const totalSelectedCurrent = parsedHoldings
    .filter((h) => h.selected)
    .reduce((sum, h) => sum + h.currentValue, 0);

  const handleImportCommit = async () => {
    const selected = parsedHoldings.filter((h) => h.selected && h.name.trim());
    if (selected.length === 0) {
      setError('Please select at least 1 holding to import.');
      return;
    }

    try {
      setIsImporting(true);
      setError('');

      await onBatchImport(
        selected.map((h) => ({
          name: h.name.trim(),
          assetType: h.assetType,
          investedAmount: h.investedAmount,
          currentValue: h.currentValue,
          units: h.units,
          buyPrice: h.buyPrice,
          currentPrice: h.currentPrice,
          notes: h.notes || 'Statement Import',
        }))
      );

      try {
        confetti({
          particleCount: 60,
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

  const activeSheetRows = rawGrid?.sheets[selectedSheetIdx]?.rows || [];
  const currentHeaderRow = activeSheetRows[headerRowIdx] || [];

  return (
    <NeoModal
      isOpen={isOpen}
      onClose={() => {
        resetState();
        onClose();
      }}
      title="IMPORT INVESTMENTS (PDF / EXCEL / CSV / PASTE)"
      maxWidth="lg"
    >
      <div className="flex flex-col gap-4">
        
        {/* Step 1: Upload or Paste Selector */}
        {parsedHoldings.length === 0 && !showColumnMapper && !isPasswordPrompt && (
          <div className="flex flex-col gap-3">
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
                Upload File (.xlsx, .csv, .pdf)
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
                  <p className="text-xs font-semibold text-neutral-600 mt-1 max-w-sm">
                    Supports CAMS / KFintech CAS (PDF), Zerodha / Groww Holdings (Excel / CSV), and all spreadsheet exports.
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-1 text-[11px] font-mono font-bold text-neutral-500">
                  <span className="px-2 py-0.5 bg-white border border-[#121212]">.PDF</span>
                  <span className="px-2 py-0.5 bg-white border border-[#121212]">.XLSX</span>
                  <span className="px-2 py-0.5 bg-white border border-[#121212]">.CSV</span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.xlsx,.xls,.csv,.tsv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-bold text-neutral-700">
                  Copy rows from Excel, Google Sheets, or your broker website and paste here:
                </p>
                <textarea
                  rows={6}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={`Parag Parikh Flexi Cap Fund\t50000\t65000\nHDFC Bank Ltd\t25000\t32000\nSovereign Gold Bond\t40000\t48000`}
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
                <span>Reading and extracting statement data...</span>
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
                  Password Protected PDF: {pendingFile.name}
                </h4>
                <p className="text-[11px] font-semibold text-neutral-600">
                  CAMS and KFintech CAS PDFs are encrypted with your PAN or Date of Birth.
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
                <span>{isParsing ? 'Decrypting...' : 'Unlock & Import Statement'}</span>
              </NeoButton>
            </div>
          </form>
        )}

        {/* Step 2: Interactive Column Mapper (If auto-detector needs manual confirmation) */}
        {showColumnMapper && rawGrid && (
          <div className="flex flex-col gap-3 p-4 bg-white border-2 border-[#121212] shadow-neo-sm">
            <div className="flex items-center gap-2 pb-1 border-b border-neutral-200">
              <SlidersHorizontal size={18} className="text-[#121212]" />
              <h4 className="text-xs font-black uppercase text-[#121212]">
                Match Columns for: {rawGrid.fileName}
              </h4>
            </div>

            <p className="text-[11px] font-semibold text-neutral-600">
              Select which columns in your file represent the Asset Name, Invested Amount, Current Value, and optional details:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
              <div>
                <label className="text-[10px] font-black uppercase text-neutral-600 block mb-1">
                  1. Asset / Scheme Name
                </label>
                <select
                  value={nameColIdx}
                  onChange={(e) => setNameColIdx(Number(e.target.value))}
                  className="w-full p-1.5 border-2 border-[#121212] text-xs font-bold bg-[#FFFDF5] cursor-pointer"
                >
                  {currentHeaderRow.map((col, idx) => (
                    <option key={idx} value={idx}>
                      Col {idx + 1}: {String(col || `Column ${idx + 1}`).substring(0, 25)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-neutral-600 block mb-1">
                  2. Invested / Cost Amount
                </label>
                <select
                  value={investedColIdx}
                  onChange={(e) => setInvestedColIdx(Number(e.target.value))}
                  className="w-full p-1.5 border-2 border-[#121212] text-xs font-bold bg-[#FFFDF5] cursor-pointer"
                >
                  {currentHeaderRow.map((col, idx) => (
                    <option key={idx} value={idx}>
                      Col {idx + 1}: {String(col || `Column ${idx + 1}`).substring(0, 25)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-neutral-600 block mb-1">
                  3. Current Market Value
                </label>
                <select
                  value={currentColIdx}
                  onChange={(e) => setCurrentColIdx(Number(e.target.value))}
                  className="w-full p-1.5 border-2 border-[#121212] text-xs font-bold bg-[#FFFDF5] cursor-pointer"
                >
                  {currentHeaderRow.map((col, idx) => (
                    <option key={idx} value={idx}>
                      Col {idx + 1}: {String(col || `Column ${idx + 1}`).substring(0, 25)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-neutral-600 block mb-1">
                  4. Quantity / Units (Optional)
                </label>
                <select
                  value={qtyColIdx}
                  onChange={(e) => setQtyColIdx(Number(e.target.value))}
                  className="w-full p-1.5 border-2 border-[#121212] text-xs font-bold bg-[#FFFDF5] cursor-pointer"
                >
                  <option value={-1}>— Not Mapped —</option>
                  {currentHeaderRow.map((col, idx) => (
                    <option key={idx} value={idx}>
                      Col {idx + 1}: {String(col || `Column ${idx + 1}`).substring(0, 25)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-neutral-600 block mb-1">
                  5. Buy Price / Unit (Optional)
                </label>
                <select
                  value={buyPriceColIdx}
                  onChange={(e) => setBuyPriceColIdx(Number(e.target.value))}
                  className="w-full p-1.5 border-2 border-[#121212] text-xs font-bold bg-[#FFFDF5] cursor-pointer"
                >
                  <option value={-1}>— Not Mapped —</option>
                  {currentHeaderRow.map((col, idx) => (
                    <option key={idx} value={idx}>
                      Col {idx + 1}: {String(col || `Column ${idx + 1}`).substring(0, 25)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-neutral-600 block mb-1">
                  6. Current Price / NAV (Optional)
                </label>
                <select
                  value={curPriceColIdx}
                  onChange={(e) => setCurPriceColIdx(Number(e.target.value))}
                  className="w-full p-1.5 border-2 border-[#121212] text-xs font-bold bg-[#FFFDF5] cursor-pointer"
                >
                  <option value={-1}>— Not Mapped —</option>
                  {currentHeaderRow.map((col, idx) => (
                    <option key={idx} value={idx}>
                      Col {idx + 1}: {String(col || `Column ${idx + 1}`).substring(0, 25)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-neutral-600 block mb-1">
                  7. Notes / Folio (Optional)
                </label>
                <select
                  value={notesColIdx}
                  onChange={(e) => setNotesColIdx(Number(e.target.value))}
                  className="w-full p-1.5 border-2 border-[#121212] text-xs font-bold bg-[#FFFDF5] cursor-pointer"
                >
                  <option value={-1}>— Not Mapped —</option>
                  {currentHeaderRow.map((col, idx) => (
                    <option key={idx} value={idx}>
                      Col {idx + 1}: {String(col || `Column ${idx + 1}`).substring(0, 25)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Preview of file sample */}
            <div className="max-h-40 overflow-auto border border-neutral-300 bg-neutral-50 text-[11px] font-mono p-2 mt-1">
              <span className="font-bold text-[10px] uppercase text-neutral-500 block mb-1">File Preview:</span>
              <table className="w-full border-collapse">
                <tbody>
                  {activeSheetRows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-b border-neutral-200">
                      {r.slice(0, 6).map((c, j) => (
                        <td key={j} className="p-1 truncate max-w-[120px]">
                          {String(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <NeoButton type="button" variant="outline" size="sm" onClick={() => resetState()}>
                Cancel
              </NeoButton>
              <NeoButton type="button" variant="secondary" size="sm" onClick={handleApplyColumnMapping}>
                Extract with Selected Columns →
              </NeoButton>
            </div>
          </div>
        )}

        {/* Step 3: Editable Extracted Table */}
        {parsedHoldings.length > 0 && (
          <div className="flex flex-col gap-3">
            
            {/* Header summary & actions */}
            <div className="p-3 bg-[#05DF72] border-2 border-[#121212] shadow-neo-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-[#121212]" />
                <span className="text-xs font-black uppercase text-[#121212]">
                  {parsedHoldings.length} Holdings Ready to Import
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleAddNewRow}
                  className="text-[11px] font-black uppercase underline text-[#121212] cursor-pointer flex items-center gap-1"
                >
                  <Plus size={13} /> Add Row
                </button>
                <button
                  onClick={() => resetState()}
                  className="text-[11px] font-black uppercase underline text-[#121212] cursor-pointer"
                >
                  Upload New File
                </button>
              </div>
            </div>

            {/* Selection & Total Summary Bar */}
            <div className="p-2.5 bg-white border-2 border-[#121212] shadow-neo-sm flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={parsedHoldings.length > 0 && parsedHoldings.every((h) => h.selected)}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 accent-[#121212] cursor-pointer"
                />
                <span className="uppercase">Select All ({selectedCount}/{parsedHoldings.length})</span>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono font-black">
                <span>Invested: {currencySymbol}{totalSelectedInvested.toLocaleString()}</span>
                <span className="text-[#05DF72]">Value: {currencySymbol}{totalSelectedCurrent.toLocaleString()}</span>
              </div>
            </div>

            {/* Editable Holdings Table */}
            <div className="max-h-[320px] overflow-y-auto border-2 border-[#121212] bg-white">
              <table className="w-full text-left text-xs font-bold border-collapse">
                <thead className="bg-[#FFE600] border-b-2 border-[#121212] sticky top-0 z-10 text-[11px] font-black uppercase">
                  <tr>
                    <th className="p-2 w-8 text-center">✓</th>
                    <th className="p-2">Asset / Scheme Name</th>
                    <th className="p-2">Class</th>
                    <th className="p-2 text-right">Invested ({currencySymbol})</th>
                    <th className="p-2 text-right">Current Value ({currencySymbol})</th>
                    <th className="p-2 text-right">Units</th>
                    <th className="p-2 text-right">Buy Price ({currencySymbol})</th>
                    <th className="p-2 text-right">Current Price ({currencySymbol})</th>
                    <th className="p-2">Notes</th>
                    <th className="p-2 text-center">✕</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {parsedHoldings.map((h) => (
                    <tr key={h.id} className={h.selected ? 'bg-white' : 'bg-neutral-100 opacity-60'}>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={h.selected}
                          onChange={() => toggleItem(h.id)}
                          className="w-4 h-4 accent-[#121212] cursor-pointer"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={h.name}
                          onChange={(e) => updateItemField(h.id, 'name', e.target.value)}
                          className="w-full p-1 border border-neutral-300 font-bold text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={h.assetType}
                          onChange={(e) => updateItemField(h.id, 'assetType', e.target.value as AssetType)}
                          className="p-1 border border-neutral-300 text-[11px] font-black uppercase bg-white cursor-pointer"
                        >
                          {ASSET_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={h.investedAmount}
                          onChange={(e) => updateItemField(h.id, 'investedAmount', parseFloat(e.target.value) || 0)}
                          className="w-24 p-1 border border-neutral-300 font-mono text-xs font-bold text-right"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={h.currentValue}
                          onChange={(e) => updateItemField(h.id, 'currentValue', parseFloat(e.target.value) || 0)}
                          className="w-24 p-1 border border-neutral-300 font-mono text-xs font-black text-[#05DF72] text-right"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={h.units || ''}
                          onChange={(e) => updateItemField(h.id, 'units', e.target.value ? parseFloat(e.target.value) : undefined)}
                          className="w-16 p-1 border border-neutral-300 font-mono text-xs font-bold text-right"
                          placeholder="—"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={h.buyPrice || ''}
                          onChange={(e) => updateItemField(h.id, 'buyPrice', e.target.value ? parseFloat(e.target.value) : undefined)}
                          className="w-20 p-1 border border-neutral-300 font-mono text-xs font-bold text-right"
                          placeholder="—"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={h.currentPrice || ''}
                          onChange={(e) => updateItemField(h.id, 'currentPrice', e.target.value ? parseFloat(e.target.value) : undefined)}
                          className="w-20 p-1 border border-neutral-300 font-mono text-xs font-bold text-[#05DF72] text-right"
                          placeholder="—"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={h.notes || ''}
                          onChange={(e) => updateItemField(h.id, 'notes', e.target.value || undefined)}
                          className="w-28 p-1 border border-neutral-300 text-xs font-bold"
                          placeholder="—"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => removeItem(h.id)}
                          className="p-1 hover:text-[#FF4343] cursor-pointer"
                          title="Remove row"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {error && (
          <div className="bg-[#FF4343] text-white text-xs font-bold p-2.5 border-2 border-[#121212] shadow-neo-sm flex items-center gap-2">
            <AlertCircle size={16} strokeWidth={2.5} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex justify-end gap-2.5 pt-2 border-t border-neutral-200">
          <NeoButton
            type="button"
            variant="outline"
            onClick={() => {
              resetState();
              onClose();
            }}
            disabled={isImporting}
          >
            Cancel
          </NeoButton>

          {parsedHoldings.length > 0 && (
            <NeoButton
              type="button"
              variant="secondary"
              onClick={handleImportCommit}
              disabled={isImporting || selectedCount === 0}
              className="flex items-center gap-1.5"
            >
              <Check size={16} strokeWidth={3} />
              <span>
                {isImporting
                  ? 'Importing...'
                  : `Import ${selectedCount} Holdings to Portfolio`}
              </span>
            </NeoButton>
          )}
        </div>

      </div>
    </NeoModal>
  );
};
