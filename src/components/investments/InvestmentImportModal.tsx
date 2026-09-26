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
  cleanNavPrice,
  ParsedHolding,
  RawFileContent,
  PasswordRequiredError,
} from '../../utils/investmentParser';
import {
  detectDetailedAssetType,
  fetchAmfiNav,
  fetchLiveStockPrice,
  fetchLiveCryptoPrice,
} from '../../utils/liveMarketService';
import { AssetType, ImportBatch } from '../../types';
import { useQuery, useMutation, useAction } from 'convex/react';
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
  HelpCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { ALL_BROKER_OPTIONS, detectBrokerFromFile } from '../../utils/brokerDirectory';
import { BrokerExportGuideModal } from './BrokerExportGuideModal';
import { BrokerSelectDropdown } from './BrokerSelectDropdown';

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

const BROKER_OPTIONS = ALL_BROKER_OPTIONS;

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
  const [detectedBrokerTag, setDetectedBrokerTag] = useState<string | null>(null);
  const [isBrokerGuideOpen, setIsBrokerGuideOpen] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [rawGrid, setRawGrid] = useState<RawFileContent | null>(null);
  const [parsedHoldings, setParsedHoldings] = useState<ParsedHolding[]>([]);
  const [pastedText, setPastedText] = useState('');
  const [error, setError] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [isRecentImportsOpen, setIsRecentImportsOpen] = useState(false);

  // Live market quote enrichment state
  const [isEnrichingLivePrices, setIsEnrichingLivePrices] = useState(false);
  const [enrichedCount, setEnrichedCount] = useState(0);
  const enrichmentRunId = useRef(0);

  // Password Protection State
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pdfPassword, setPdfPassword] = useState('');
  const [isPasswordPrompt, setIsPasswordPrompt] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Convex Queries, Mutations & Actions for Batch History, Live Quotes & 1-Click Rollback
  const importBatches = useQuery((api.investments as any).listImportBatches, isOpen ? {} : 'skip') as ImportBatch[] | undefined;
  const undoBatchMutation = useMutation((api.investments as any).undoImportBatch);
  const fetchLivePriceAction = useAction(api.investments.fetchLivePrice);
  const fetchBatchLivePricesAction = useAction(api.investments.fetchBatchLivePrices);

  // Per-row live price fetching status & debounce timers
  const [rowFetchingPrice, setRowFetchingPrice] = useState<Record<string, boolean>>({});
  const nameDebounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetState = () => {
    enrichmentRunId.current++;
    setIsEnrichingLivePrices(false);
    setEnrichedCount(0);
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
    Object.values(nameDebounceTimers.current).forEach(clearTimeout);
    nameDebounceTimers.current = {};
    setRowFetchingPrice({});
    setDetectedBrokerTag(null);
    setSelectedBroker('Auto-Detect Broker');
  };

  /**
   * Dynamically enriches parsed holdings with authentic LIVE market rates:
   * Uses high-speed server-side batch lookup via Convex (unblocked by CORS)
   * covering AMFI, NSE, BSE, unlisted platforms, and crypto exchanges.
   */
  const enrichHoldingsWithLivePrices = async (holdingsToEnrich: ParsedHolding[]) => {
    if (!holdingsToEnrich || holdingsToEnrich.length === 0) return;

    const runId = ++enrichmentRunId.current;
    setIsEnrichingLivePrices(true);
    setEnrichedCount(0);

    const updatedHoldings = holdingsToEnrich.map((h) => ({ ...h }));

    // Eligible holdings: stocks, mutual funds, gold, crypto, and any equity/unlisted in 'other'
    const eligibleHoldings = updatedHoldings.filter(
      (h) => h.assetType !== 'fd_rd' && h.assetType !== 'ppf_epf' && h.assetType !== 'real_estate'
    );

    let count = 0;

    // 1. Primary: High-speed server-side batch enrichment via Convex (unblocked by browser CORS)
    try {
      const serverBatchRes = await fetchBatchLivePricesAction({
        items: eligibleHoldings.map((h) => ({
          id: h.id,
          name: h.name,
          assetType: h.assetType,
          notes: h.notes,
          isin: h.isin,
          schemeCode: h.schemeCode,
          ticker: h.ticker,
          statementPrice: h.statementPrice || (h.currentPrice && h.currentPrice > 0 ? h.currentPrice : undefined),
        })),
        force: true,
      });

      if (serverBatchRes && typeof serverBatchRes === 'object') {
        for (const [id, rawRes] of Object.entries(serverBatchRes)) {
          const res = rawRes as { price: number; prevClose?: number; symbol?: string; isin?: string; schemeCode?: number; date?: string } | null;
          const idx = updatedHoldings.findIndex((h) => h.id === id);
          if (idx !== -1 && res && res.price > 0) {
            const h = { ...updatedHoldings[idx] };
            const oldPrice = h.statementPrice || h.currentPrice || 0;
            const cleanPrice = cleanNavPrice(res.price, h.assetType === 'mutual_fund');
            h.currentPrice = cleanPrice;
            h.isLiveSynced = true;
            if (res.date) h.liveNavDate = res.date;
            if (res.isin && !h.isin) h.isin = res.isin;
            if (res.schemeCode && !h.schemeCode) h.schemeCode = res.schemeCode;
            if (res.symbol && !h.ticker) h.ticker = res.symbol;

            if (h.units && h.units > 0) {
              h.currentValue = cleanCurrency(h.units * res.price);
            } else if (h.investedAmount > 0 && h.buyPrice && h.buyPrice > 0) {
              const derivedUnits = cleanUnits(h.investedAmount / h.buyPrice);
              h.units = derivedUnits;
              h.currentValue = cleanCurrency(derivedUnits * res.price);
            } else if (oldPrice && oldPrice > 0 && h.currentValue > 0) {
              const derivedUnits = cleanUnits(h.currentValue / oldPrice);
              h.units = derivedUnits;
              h.currentValue = cleanCurrency(derivedUnits * res.price);
            } else if (h.investedAmount > 0 && res.price > 0) {
              const derivedUnits = cleanUnits(h.investedAmount / res.price);
              h.units = derivedUnits;
              h.currentValue = cleanCurrency(derivedUnits * res.price);
            }

            if (h.assetType === 'other') {
              const detected = detectDetailedAssetType(h.name);
              if (detected.assetType !== 'other') {
                h.assetType = detected.assetType;
                h.subType = detected.subType;
              } else if (res.schemeCode || h.isin?.startsWith('INF')) {
                h.assetType = 'mutual_fund';
                h.subType = 'Equity Mutual Fund';
              } else {
                h.assetType = 'stocks';
                h.subType = 'Stock / Equity';
              }
            }

            h.returns = cleanCurrency(h.currentValue - h.investedAmount);
            updatedHoldings[idx] = h;
            count++;
          }
        }

        console.log(`[Enrichment] Successfully synced ${count} of ${eligibleHoldings.length} holdings in batch.`);
        if (count > 0 && enrichmentRunId.current === runId) {
          setEnrichedCount(count);
          setParsedHoldings([...updatedHoldings]);
        }
      }
    } catch (batchErr) {
      console.warn('[Enrichment] Batch server sync error, falling back to per-item sync:', batchErr);
    }

    if (enrichmentRunId.current !== runId) return;

    // 2. Secondary fallback for any remaining unsynced items
    const unsynced = updatedHoldings.filter(
      (h) => !h.isLiveSynced && h.assetType !== 'fd_rd' && h.assetType !== 'ppf_epf' && h.assetType !== 'real_estate'
    );

    if (unsynced.length > 0) {
      await Promise.all(
        unsynced.map(async (holding) => {
          let livePrice: number | null = null;
          let liveDate: string | undefined = undefined;

          try {
            // First try single-item Convex server action
            try {
              const sRes = await fetchLivePriceAction({
                name: holding.name,
                assetType: holding.assetType,
                notes: holding.notes,
                isin: holding.isin,
                statementPrice: holding.statementPrice || holding.currentPrice,
                force: true,
              });
              if (sRes && sRes.price > 0) {
                livePrice = sRes.price;
                if ((sRes as any)?.date) liveDate = (sRes as any).date;
              }
            } catch {}

            // Then try direct AMFI client query if mutual fund
            if (!livePrice && holding.assetType === 'mutual_fund') {
              const isinLookup = holding.isin ? `ISIN: ${holding.isin}` : undefined;
              const live = await fetchAmfiNav(holding.name, holding.notes || isinLookup);
              if (live && live.nav > 0) {
                livePrice = live.nav;
                liveDate = live.date;
              }
            } else if (!livePrice && holding.assetType === 'crypto') {
              const live = await fetchLiveCryptoPrice(holding.name);
              if (live && live.price > 0) livePrice = live.price;
            } else if (!livePrice) {
              const liveStock = await fetchLiveStockPrice(
                holding.name,
                holding.notes,
                holding.isin,
                holding.ticker,
                holding.statementPrice || holding.currentPrice
              );
              if (liveStock && liveStock.price > 0) livePrice = liveStock.price;
            }
          } catch {}

          if (livePrice !== null && livePrice > 0) {
            const idx = updatedHoldings.findIndex((h) => h.id === holding.id);
            if (idx !== -1) {
              const h = { ...updatedHoldings[idx] };
              const oldPrice = h.statementPrice || h.currentPrice || 0;
              const cleanPrice = cleanNavPrice(livePrice, h.assetType === 'mutual_fund');
              h.currentPrice = cleanPrice;
              h.isLiveSynced = true;
              if (liveDate) h.liveNavDate = liveDate;

              if (h.units && h.units > 0) {
                h.currentValue = cleanCurrency(h.units * livePrice);
              } else if (h.investedAmount > 0 && h.buyPrice && h.buyPrice > 0) {
                const derivedUnits = cleanUnits(h.investedAmount / h.buyPrice);
                h.units = derivedUnits;
                h.currentValue = cleanCurrency(derivedUnits * livePrice);
              } else if (oldPrice && oldPrice > 0 && h.currentValue > 0) {
                const derivedUnits = cleanUnits(h.currentValue / oldPrice);
                h.units = derivedUnits;
                h.currentValue = cleanCurrency(derivedUnits * livePrice);
              } else if (h.investedAmount > 0 && livePrice > 0) {
                const derivedUnits = cleanUnits(h.investedAmount / livePrice);
                h.units = derivedUnits;
                h.currentValue = cleanCurrency(derivedUnits * livePrice);
              }

              if (h.assetType === 'other') {
                const detected = detectDetailedAssetType(h.name);
                if (detected.assetType !== 'other') {
                  h.assetType = detected.assetType;
                  h.subType = detected.subType;
                } else if (h.isin?.startsWith('INF')) {
                  h.assetType = 'mutual_fund';
                  h.subType = 'Equity Mutual Fund';
                } else {
                  h.assetType = 'stocks';
                  h.subType = 'Stock / Equity';
                }
              }

              h.returns = cleanCurrency(h.currentValue - h.investedAmount);
              updatedHoldings[idx] = h;
              count++;
            }
          }
        })
      );
    }

    if (enrichmentRunId.current !== runId) return;

    setEnrichedCount(count);
    setParsedHoldings([...updatedHoldings]);
    setIsEnrichingLivePrices(false);
  };

  /**
   * Dedicated single-row live price lookup when the user manually types or edits
   * any fund or stock name in the import table.
   */
  const fetchLivePriceForRow = async (
    id: string,
    assetName: string,
    explicitType?: AssetType,
    notesOrIsin?: string
  ) => {
    if (!assetName || assetName.trim().length < 2) {
      setRowFetchingPrice((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }

    const detected = detectDetailedAssetType(assetName, undefined, undefined, notesOrIsin);
    const targetType = explicitType || detected.assetType;

    if (
      targetType === 'fd_rd' ||
      targetType === 'ppf_epf' ||
      targetType === 'real_estate'
    ) {
      return;
    }

    setRowFetchingPrice((prev) => ({ ...prev, [id]: true }));

    let livePrice: number | null = null;
    let liveDate: string | undefined = undefined;

    try {
      // Primary: Unblocked server action
      try {
        const serverRes = await fetchLivePriceAction({
          name: assetName,
          assetType: targetType,
          notes: notesOrIsin,
          isin: notesOrIsin,
          force: true,
        });
        if (serverRes && serverRes.price > 0) {
          livePrice = serverRes.price;
          const resDate = (serverRes as any)?.date;
          if (resDate) liveDate = resDate;
        }
      } catch {}

      // Secondary client-side fallbacks
      if (livePrice === null || livePrice <= 0) {
        if (targetType === 'mutual_fund') {
          const live = await fetchAmfiNav(assetName, notesOrIsin);
          if (live && live.nav > 0) {
            livePrice = live.nav;
            liveDate = live.date;
          }
        } else if (targetType === 'crypto') {
          const live = await fetchLiveCryptoPrice(assetName);
          if (live && live.price > 0) livePrice = live.price;
        } else {
          const liveStock = await fetchLiveStockPrice(assetName, notesOrIsin);
          if (liveStock && liveStock.price > 0) livePrice = liveStock.price;
        }
      }
    } catch {
      // ignore
    } finally {
      setRowFetchingPrice((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }

    if (livePrice !== null && livePrice > 0) {
      setParsedHoldings((prev) =>
        prev.map((h) => {
          if (h.id !== id) return h;
          const cleanPrice = cleanNavPrice(livePrice!, targetType === 'mutual_fund');
          const updated = {
            ...h,
            currentPrice: cleanPrice,
            isLiveSynced: true,
            liveNavDate: liveDate || h.liveNavDate,
          };
          if (updated.units && updated.units > 0) {
            updated.currentValue = cleanCurrency(updated.units * cleanPrice);
          } else if (updated.investedAmount > 0 && updated.buyPrice && updated.buyPrice > 0) {
            const derivedUnits = cleanUnits(updated.investedAmount / updated.buyPrice);
            updated.units = derivedUnits;
            updated.currentValue = cleanCurrency(derivedUnits * cleanPrice);
          } else if (h.currentPrice && h.currentPrice > 0 && updated.currentValue > 0) {
            const ratio = cleanPrice / h.currentPrice;
            updated.currentValue = cleanCurrency(updated.currentValue * ratio);
          }
          if (updated.currentValue > 0 || updated.investedAmount > 0) {
            updated.returns = cleanCurrency(updated.currentValue - updated.investedAmount);
          }
          updated.isValid = Boolean(
            updated.name.trim() &&
              (updated.currentValue > 0 || updated.investedAmount > 0 || updated.currentPrice > 0)
          );
          return updated;
        })
      );
    }
  };

  const processFile = async (file: File) => {
    try {
      setIsParsing(true);
      setError('');
      setIsPasswordPrompt(false);
      setPasswordError('');

      const result = await parseInvestmentFile(file);
      setRawGrid(result.rawGrid);

      // Intelligent Universal Broker Detection across all 30+ brokers & depositories
      const autoDetected = detectBrokerFromFile(file.name, result.rawGrid);
      if (autoDetected) {
        setSelectedBroker(autoDetected);
        setDetectedBrokerTag(autoDetected);
      }

      if (result.holdings.length > 0) {
        const taggedHoldings = autoDetected
          ? result.holdings.map((h) => ({ ...h, broker: h.broker || autoDetected }))
          : result.holdings;
        setParsedHoldings(taggedHoldings);
        setIsParsing(false);
        enrichHoldingsWithLivePrices(taggedHoldings);
      } else {
        setError('No holdings found in file. Please ensure it is a statement or copy-paste rows.');
        setIsParsing(false);
      }
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

      const autoDetected = detectBrokerFromFile(pendingFile.name, result.rawGrid);
      if (autoDetected) {
        setSelectedBroker(autoDetected);
        setDetectedBrokerTag(autoDetected);
      }

      if (result.holdings.length > 0) {
        const taggedHoldings = autoDetected
          ? result.holdings.map((h) => ({ ...h, broker: h.broker || autoDetected }))
          : result.holdings;
        setParsedHoldings(taggedHoldings);
        setIsPasswordPrompt(false);
        setIsParsing(false);
        enrichHoldingsWithLivePrices(taggedHoldings);
      } else {
        setError('Password accepted, but no asset rows were found.');
        setIsPasswordPrompt(false);
        setIsParsing(false);
      }
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

      const autoDetected = detectBrokerFromFile(undefined, undefined, pastedText);
      if (autoDetected) {
        setSelectedBroker(autoDetected);
        setDetectedBrokerTag(autoDetected);
      }

      const taggedHoldings = autoDetected
        ? extracted.map((h) => ({ ...h, broker: h.broker || autoDetected }))
        : extracted;

      setParsedHoldings(taggedHoldings);
      setError('');
      enrichHoldingsWithLivePrices(taggedHoldings);
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
        name: '',
        assetType: 'stocks',
        subType: 'Stock / Equity',
        investedAmount: 0,
        currentValue: 0,
        units: undefined,
        buyPrice: undefined,
        currentPrice: undefined,
        selected: true,
        isValid: false,
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

        if (field === 'name') {
          const newName = String(val);
          updated.name = newName;
          if (newName.trim().length >= 2) {
            if (!updated.assetType || updated.assetType === 'other') {
              const detected = detectDetailedAssetType(newName, undefined, undefined, updated.isin || updated.notes);
              updated.assetType = detected.assetType;
              updated.subType = detected.subType;
              if (detected.sector && !updated.sector) {
                updated.sector = detected.sector;
              }
            }
          }

          if (nameDebounceTimers.current[id]) {
            clearTimeout(nameDebounceTimers.current[id]);
          }

          if (newName.trim().length >= 2) {
            nameDebounceTimers.current[id] = setTimeout(() => {
              const notesOrIsin = updated.isin ? `ISIN: ${updated.isin}` : updated.notes;
              fetchLivePriceForRow(id, newName, updated.assetType, notesOrIsin);
            }, 400);
          }
        }

        if (field === 'units') {
          const unitsNum = val !== undefined && val !== '' ? parseFloat(val) : undefined;
          updated.units = unitsNum;
          if (unitsNum !== undefined && unitsNum > 0 && updated.currentPrice && updated.currentPrice > 0) {
            updated.currentValue = cleanCurrency(unitsNum * updated.currentPrice);
          }
        }
        if (field === 'currentPrice') {
          const priceNum = val !== undefined && val !== '' ? parseFloat(val) : undefined;
          updated.currentPrice = priceNum;
          if (priceNum !== undefined && priceNum > 0 && updated.units && updated.units > 0) {
            updated.currentValue = cleanCurrency(updated.units * priceNum);
          }
        }
        if (
          field === 'investedAmount' ||
          field === 'currentValue' ||
          field === 'units' ||
          field === 'currentPrice'
        ) {
          updated.returns = cleanCurrency(updated.currentValue - updated.investedAmount);
        }
        // Recalculate validity
        updated.isValid = Boolean(
          updated.name.trim() &&
            (updated.currentValue > 0 || updated.investedAmount > 0 || (updated.currentPrice && updated.currentPrice > 0))
        );
        return updated;
      })
    );
  };

  const handleTypeChange = (id: string, compositeValue: string) => {
    const found = GRANULAR_ASSET_TYPES.find((t) => t.subType === compositeValue);
    const targetAssetType = found ? found.assetType : undefined;
    const targetSubType = found ? found.subType : compositeValue;

    setParsedHoldings((prev) =>
      prev.map((h) => {
        if (h.id !== id) return h;
        const updated = {
          ...h,
          subType: targetSubType,
          ...(targetAssetType ? { assetType: targetAssetType } : {}),
        };
        // If user changed type and there's a name, trigger live price search for the new asset class
        if (h.name && h.name.trim().length >= 2 && targetAssetType) {
          const notesOrIsin = h.isin ? `ISIN: ${h.isin}` : h.notes;
          fetchLivePriceForRow(id, h.name, targetAssetType, notesOrIsin);
        }
        return updated;
      })
    );
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
          currentPrice: h.currentPrice ? cleanNavPrice(h.currentPrice, h.assetType === 'mutual_fund') : undefined,
          schemeCode: h.schemeCode,
          isin: h.isin,
          ticker: h.ticker,
          xirr: h.xirr,
          notes: [
            h.notes || '',
            h.folioNo && !(h.notes || '').includes(h.folioNo) ? `Folio: ${h.folioNo}` : '',
            h.isin && !(h.notes || '').includes(h.isin) ? `ISIN: ${h.isin}` : '',
          ]
            .filter(Boolean)
            .join(' | ') || 'Statement Import',
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-[#FFFDF5] p-2.5 border-2 border-[#121212]">
              <div className="flex flex-col gap-1 w-full sm:w-auto">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black uppercase text-neutral-600 shrink-0">Broker:</span>
                  <BrokerSelectDropdown
                    value={selectedBroker}
                    onChange={(brokerName) => {
                      setSelectedBroker(brokerName);
                      if (brokerName === 'Auto-Detect Broker') {
                        setDetectedBrokerTag(null);
                      } else {
                        setDetectedBrokerTag(brokerName);
                      }
                    }}
                  />

                  {detectedBrokerTag && detectedBrokerTag !== 'Auto-Detect Broker' && (
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-[#05DF72]/20 text-[#0B6B38] border border-[#05DF72] flex items-center gap-1 shrink-0">
                      <Check size={11} strokeWidth={3} />
                      <span>Detected: {detectedBrokerTag}</span>
                    </span>
                  )}
                </div>

                {selectedBroker !== 'Auto-Detect Broker' && (
                  <button
                    type="button"
                    onClick={() => setIsBrokerGuideOpen(true)}
                    className="text-[11px] font-bold text-[#0B6B38] hover:underline flex items-center gap-1 cursor-pointer self-start pl-12 sm:pl-14 transition-colors"
                  >
                    <ChevronDown size={13} />
                    <span>Where do I get this file from {selectedBroker}?</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setImportMode('investments')}
                  className={`flex-1 sm:flex-initial px-2.5 py-1 text-[11px] font-black uppercase border transition-all cursor-pointer text-center ${
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
                  className={`flex-1 sm:flex-initial px-2.5 py-1 text-[11px] font-black uppercase border transition-all cursor-pointer text-center ${
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
                className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-black uppercase border-2 transition-all cursor-pointer text-center ${
                  activeTab === 'upload'
                    ? 'bg-[#FFE600] text-[#121212] border-[#121212] shadow-neo-sm'
                    : 'bg-white text-neutral-600 border-neutral-300'
                }`}
              >
                <span className="sm:hidden">Upload File</span>
                <span className="hidden sm:inline">Upload File (.pdf, .xlsx, .docx, .csv)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('paste')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-black uppercase border-2 transition-all cursor-pointer text-center ${
                  activeTab === 'paste'
                    ? 'bg-[#FFE600] text-[#121212] border-[#121212] shadow-neo-sm'
                    : 'bg-white text-neutral-600 border-neutral-300'
                }`}
              >
                <span className="sm:hidden">Paste Table</span>
                <span className="hidden sm:inline">Copy & Paste Table / CSV</span>
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
                <div className="flex flex-col gap-0.5">
                  <p className="text-xs font-bold text-neutral-800">
                    Paste table rows from any broker statement, Excel, or Google Sheets:
                  </p>
                  <p className="text-[11px] text-neutral-500 font-semibold">
                    Universal Column Detection: Any column arrangement is supported. Paanam identifies Scheme / Stock Name, Units, Price, Cost, and Current Value dynamically by column.
                  </p>
                </div>
                <textarea
                  rows={6}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste rows from any broker or statement in any column order...&#10;Paanam automatically detects each column (Scheme / Stock Name, Units, Buy Price, Cost, Current Value, P&L)."
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
            
            {/* Financial Totals Bar with Live AMFI / Market Status */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#FFFDF5] p-2.5 border-2 border-[#121212] shadow-neo-sm">
              <div className="flex items-center gap-2">
                {isEnrichingLivePrices ? (
                  <div className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-100/80 border border-amber-300 px-2 py-0.5 font-bold animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block shrink-0" />
                    <span>Syncing real-time market prices & AMFI NAVs ({enrichedCount}/{parsedHoldings.length})...</span>
                  </div>
                ) : enrichedCount > 0 ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-[#0B6B38] bg-[#05DF72]/15 border border-[#05DF72]/40 px-2 py-0.5 font-black">
                      <span className="w-2 h-2 rounded-full bg-[#05DF72] inline-block shrink-0" />
                      <span>{enrichedCount} of {parsedHoldings.length} Real-Time Market Prices Synced</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => enrichHoldingsWithLivePrices(parsedHoldings)}
                      className="text-[10px] font-black uppercase tracking-wider text-neutral-600 hover:text-black hover:underline flex items-center gap-1 cursor-pointer"
                      title="Re-fetch live AMFI NAVs and exchange prices"
                    >
                      <RotateCcw size={11} />
                      Refresh
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-600 bg-neutral-100 border border-neutral-300 px-2 py-0.5 font-bold">
                      <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shrink-0" />
                      <span>Statement Prices</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => enrichHoldingsWithLivePrices(parsedHoldings)}
                      className="text-[10px] font-black uppercase tracking-wider text-[#0B6B38] hover:underline flex items-center gap-1 cursor-pointer font-bold"
                      title="Fetch live real-time market prices"
                    >
                      <RotateCcw size={11} />
                      Sync Live Prices
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-mono">
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
            <div className="border-2 border-[#121212] bg-white overflow-x-auto max-h-[380px] overflow-y-auto overscroll-x-contain">
              <table className="min-w-[700px] w-full text-left text-xs font-bold border-collapse">
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
                    <th className="p-2.5 text-right min-w-[100px]">
                      <div className="flex items-center justify-end gap-1">
                        <span>LIVE NAV / CP</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-[#05DF72]" title="Real-time live rate from AMFI & Exchanges" />
                      </div>
                    </th>
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
                              placeholder="Enter fund, stock or ticker name..."
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
                              step="any"
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

                          {/* NAV / CP cell (effective per-unit price) */}
                          <td className="p-2.5 text-right font-mono text-xs font-bold text-neutral-700">
                            {(() => {
                              const isRowLoading = Boolean(rowFetchingPrice[h.id]);
                              const eff =
                                h.currentPrice && h.currentPrice > 0
                                  ? h.currentPrice
                                  : h.units && h.units > 0 && h.currentValue > 0
                                  ? cleanNavPrice(h.currentValue / h.units, h.assetType === 'mutual_fund')
                                  : undefined;
                              return (
                                <div className="flex items-center justify-end gap-1">
                                  {isRowLoading ? (
                                    <span
                                      className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block shrink-0"
                                      title="Searching live AMFI NAV / market quote..."
                                    />
                                  ) : h.isLiveSynced ? (
                                    <span
                                      className="w-1.5 h-1.5 rounded-full bg-[#05DF72] inline-block shrink-0"
                                      title={`Verified Live Market Rate${h.liveNavDate ? ` (${h.liveNavDate})` : ''}`}
                                    />
                                  ) : (
                                    <span
                                      className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block shrink-0"
                                      title="Statement Price (Not yet live synced) - Click Refresh at top to fetch live market quotes"
                                    />
                                  )}
                                  <input
                                    type="number"
                                    step="any"
                                    value={eff !== undefined ? eff : ''}
                                    placeholder={isRowLoading ? '...' : '—'}
                                    onChange={(e) => {
                                      const newPrice = e.target.value ? parseFloat(e.target.value) : undefined;
                                      updateItemField(h.id, 'currentPrice', newPrice);
                                    }}
                                    className={`w-20 p-1 text-right font-mono text-xs border border-transparent hover:border-neutral-300 focus:border-[#121212] bg-transparent hover:bg-neutral-100 focus:bg-white font-black ${
                                      h.isLiveSynced ? 'text-[#0B6B38]' : 'text-neutral-700'
                                    }`}
                                    title={
                                      isRowLoading
                                        ? 'Fetching live market rate...'
                                        : h.isLiveSynced
                                        ? `Verified Live rate from exchange/AMFI${h.liveNavDate ? ` (${h.liveNavDate})` : ''}`
                                        : 'Statement NAV / CP'
                                    }
                                  />
                                </div>
                              );
                            })()}
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
                            <td colSpan={12} className="p-3 pl-12">
                              <div className="grid grid-cols-1 sm:grid-cols-4 xl:grid-cols-8 gap-3">
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
                                    Avg Buy Price ({currencySymbol})
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={h.buyPrice ?? ''}
                                    placeholder="—"
                                    onChange={(e) =>
                                      updateItemField(
                                        h.id,
                                        'buyPrice',
                                        e.target.value ? parseFloat(e.target.value) : undefined
                                      )
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
                                    Folio No
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
                                    ISIN (for NAV accuracy)
                                  </label>
                                  <input
                                    type="text"
                                    value={h.isin || ''}
                                    placeholder="e.g. INF200K01QV8"
                                    onChange={(e) => updateItemField(h.id, 'isin', e.target.value || undefined)}
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

      <BrokerExportGuideModal
        isOpen={isBrokerGuideOpen}
        onClose={() => setIsBrokerGuideOpen(false)}
        onSelectBroker={(brokerName) => {
          setSelectedBroker(brokerName);
          setDetectedBrokerTag(brokerName);
        }}
        initialSelectedBroker={selectedBroker !== 'Auto-Detect Broker' ? selectedBroker : (detectedBrokerTag || undefined)}
      />
    </NeoModal>
  );
};
