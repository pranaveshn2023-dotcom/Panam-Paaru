import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NeoModal } from '../ui/NeoModal';
import { NeoButton } from '../ui/NeoButton';
import { NeoInput } from '../ui/NeoInput';
import { Investment, AssetType } from '../../types';
import {
  TrendingUp,
  Layers,
  Calendar,
  DollarSign,
  Zap,
  Loader2,
  Plus,
  CheckCircle2,
  ArrowRight,
  Edit3,
  RefreshCw,
} from 'lucide-react';
import { useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import {
  fetchAmfiNav,
  fetchLiveStockPrice,
  fetchLiveCryptoPrice,
  detectDetailedAssetType,
} from '../../utils/liveMarketService';

export interface InvestmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    assetType: AssetType;
    investedAmount: number;
    currentValue: number;
    units?: number;
    buyPrice?: number;
    currentPrice?: number;
    sipAmount?: number;
    sipDay?: number;
    xirr?: string;
    notes?: string;
    existingIdToMerge?: string;
  }) => Promise<void>;
  initialData?: Investment | null;
  currencySymbol?: string;
  existingInvestments?: Investment[];
  isTopUpMode?: boolean;
}

const ASSET_TYPES: { label: string; value: AssetType; colorVar: string; desc: string }[] = [
  { label: 'Mutual Funds', value: 'mutual_fund', colorVar: 'var(--neo-cyan)', desc: 'SIPs, Index Funds, ELSS, Flexi Cap' },
  { label: 'Stocks & Equity', value: 'stocks', colorVar: 'var(--neo-yellow)', desc: 'Direct Shares, ETFs' },
  { label: 'Fixed Deposits & RDs', value: 'fd_rd', colorVar: 'var(--neo-green)', desc: 'Bank FDs, Corporate FDs, RDs' },
  { label: 'Gold & Silver', value: 'gold', colorVar: 'var(--neo-yellow)', desc: 'Digital Gold, Sovereign Gold Bonds, Silver' },
  { label: 'Crypto & Web3', value: 'crypto', colorVar: 'var(--neo-purple)', desc: 'Bitcoin, Ethereum, Tokens' },
  { label: 'PPF & EPF', value: 'ppf_epf', colorVar: 'var(--neo-yellow)', desc: 'Provident Fund, NPS, Retirement' },
  { label: 'Real Estate & Land', value: 'real_estate', colorVar: 'var(--neo-pink)', desc: 'Plots, Commercial, Residential' },
  { label: 'Other Assets', value: 'other', colorVar: 'var(--neo-border)', desc: 'Bonds, P2P, Angel, Art' },
];

function findMatchingExistingHolding(query: string, holdings: Investment[]): Investment | null {
  if (!query || query.trim().length < 3 || !holdings || holdings.length === 0) return null;
  const cleanQ = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  const qWords = query.toLowerCase().split(/[\s-_/]+/).filter((w) => w.length > 2);

  for (const h of holdings) {
    const cleanH = h.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanH === cleanQ || cleanH.includes(cleanQ) || cleanQ.includes(cleanH)) return h;

    const hWords = h.name.toLowerCase().split(/[\s-_/]+/).filter((w) => w.length > 2);
    const matchedCount = qWords.filter((w) => hWords.includes(w)).length;
    if (matchedCount >= 2 && matchedCount >= Math.min(qWords.length, 3)) {
      return h;
    }
  }
  return null;
}

export const InvestmentModal: React.FC<InvestmentModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  currencySymbol = '₹',
  existingInvestments = [],
  isTopUpMode: initialTopUpMode = false,
}) => {
  const [name, setName] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('mutual_fund');
  const [investedAmount, setInvestedAmount] = useState('');
  const [currentValue, setCurrentValue] = useState('');
  const [units, setUnits] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [sipAmount, setSipAmount] = useState('');
  const [sipDay, setSipDay] = useState('5');
  const [xirr, setXirr] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ── Top-Up Mode State ──
  const [mode, setMode] = useState<'normal' | 'topup'>('normal');
  const [matchedHolding, setMatchedHolding] = useState<Investment | null>(null);
  const [dismissedMatchId, setDismissedMatchId] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState<string>('');
  const [topUpUnits, setTopUpUnits] = useState<string>('');

  // ── Real-time price fetching state ──
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [livePriceSymbol, setLivePriceSymbol] = useState<string>('');
  const fetchTimeoutRef = useRef<any>(null);
  const fetchIdRef = useRef<number>(0);

  const fetchLivePriceAction = useAction(api.investments.fetchLivePrice);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setAssetType(initialData.assetType);
      setInvestedAmount(String(initialData.investedAmount));
      setCurrentValue(String(initialData.currentValue));
      setUnits(initialData.units ? String(initialData.units) : '');
      setBuyPrice(initialData.buyPrice ? String(initialData.buyPrice) : '');
      setCurrentPrice(initialData.currentPrice ? String(initialData.currentPrice) : '');
      setSipAmount(initialData.sipAmount ? String(initialData.sipAmount) : '');
      setSipDay(initialData.sipDay ? String(initialData.sipDay) : '5');
      setXirr(initialData.xirr || '');
      setNotes(initialData.notes || '');
      setLivePrice(initialData.currentPrice || null);
      setLivePriceSymbol(initialData.name);

      if (initialTopUpMode) {
        setMatchedHolding(initialData);
        setMode('topup');
        setTopUpAmount('');
        setTopUpUnits('');
      } else {
        setMatchedHolding(null);
        setMode('normal');
      }
    } else {
      setName('');
      setAssetType('mutual_fund');
      setInvestedAmount('');
      setCurrentValue('');
      setUnits('');
      setBuyPrice('');
      setCurrentPrice('');
      setSipAmount('');
      setSipDay('5');
      setXirr('');
      setNotes('');
      setLivePrice(null);
      setLivePriceSymbol('');
      setMatchedHolding(null);
      setDismissedMatchId(null);
      setMode('normal');
      setTopUpAmount('');
      setTopUpUnits('');
    }
    setError('');
  }, [initialData, isOpen, initialTopUpMode]);

  const investedAmountRef = useRef(investedAmount);
  investedAmountRef.current = investedAmount;

  const unitsRef = useRef(units);
  unitsRef.current = units;

  const buyPriceRef = useRef(buyPrice);
  buyPriceRef.current = buyPrice;

  const livePriceRef = useRef(livePrice);
  livePriceRef.current = livePrice;

  // ── Live price auto-fetch (debounced) ──
  const doFetchLivePrice = useCallback(async (assetName: string, type: AssetType, id: number) => {
    if (!assetName || assetName.trim().length < 2) {
      setLivePrice(null);
      setLivePriceSymbol('');
      setIsFetchingPrice(false);
      return;
    }

    if (type === 'fd_rd' || type === 'ppf_epf' || type === 'real_estate' || type === 'other') {
      setLivePrice(null);
      setLivePriceSymbol('');
      setIsFetchingPrice(false);
      return;
    }

    setIsFetchingPrice(true);

    try {
      let result: { price: number; prevClose?: number; symbol?: string } | null = null;

      if (type === 'mutual_fund') {
        const mf = await fetchAmfiNav(assetName, notes);
        if (mf && mf.nav > 0) {
          result = { price: mf.nav, symbol: mf.schemeName };
        } else {
          try {
            const serverRes = await fetchLivePriceAction({ name: assetName, assetType: type, notes });
            if (serverRes && serverRes.price > 0) result = serverRes;
          } catch { }
        }
      } else if (type === 'crypto') {
        result = await fetchLiveCryptoPrice(assetName);
        if (!result || result.price <= 0) {
          try {
            const serverRes = await fetchLivePriceAction({ name: assetName, assetType: type });
            if (serverRes && serverRes.price > 0) result = serverRes;
          } catch { }
        }
      } else {
        try {
          const serverRes = await fetchLivePriceAction({ name: assetName, assetType: type, notes });
          if (serverRes && serverRes.price > 0) result = serverRes;
        } catch { }

        if (!result || result.price <= 0) {
          result = await fetchLiveStockPrice(assetName, notes);
        }
      }

      if (id !== fetchIdRef.current) return;

      if (result && result.price > 0) {
        setLivePrice(result.price);
        setLivePriceSymbol(result.symbol || '');
        setCurrentPrice(String(result.price));

        const numInv = parseFloat(investedAmountRef.current);
        const numUnits = parseFloat(unitsRef.current);
        const numBuy = parseFloat(buyPriceRef.current);

        if (!isNaN(numUnits) && numUnits > 0) {
          const computedVal = Math.round(numUnits * result.price * 100) / 100;
          setCurrentValue(String(computedVal));
          if (!isNaN(numInv) && numInv > 0 && isNaN(numBuy)) {
            const avgBuy = Math.round((numInv / numUnits) * 10000) / 10000;
            setBuyPrice(String(avgBuy));
          }
        } else if (!isNaN(numInv) && numInv > 0) {
          const effPrice = !isNaN(numBuy) && numBuy > 0 ? numBuy : result.price;
          const derivedUnits = Math.round((numInv / effPrice) * 10000) / 10000;
          setUnits(String(derivedUnits));
          const computedVal = Math.round(derivedUnits * result.price * 100) / 100;
          setCurrentValue(String(computedVal));
          if (isNaN(numBuy) || numBuy <= 0) {
            setBuyPrice(String(result.price));
          }
        }
      } else {
        setLivePrice(null);
        setLivePriceSymbol('');
      }
    } catch {
      if (id === fetchIdRef.current) {
        setLivePrice(null);
        setLivePriceSymbol('');
      }
    } finally {
      if (id === fetchIdRef.current) {
        setIsFetchingPrice(false);
      }
    }
  }, [fetchLivePriceAction]);

  useEffect(() => {
    if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);

    if (name.trim().length >= 2) {
      fetchTimeoutRef.current = setTimeout(() => {
        const id = ++fetchIdRef.current;
        doFetchLivePrice(name, assetType, id);
      }, 350);
    } else {
      fetchIdRef.current++;
      setLivePrice(null);
      setLivePriceSymbol('');
      setIsFetchingPrice(false);
    }

    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    };
  }, [name, assetType, doFetchLivePrice]);

  // ── Dynamic cross-calculation handlers ──
  const handleInvestedAmountChange = (val: string) => {
    setInvestedAmount(val);
    const numInv = parseFloat(val);
    const numUnits = parseFloat(units);
    const numBuy = parseFloat(buyPrice);
    const activePrice = livePrice ?? (currentPrice ? parseFloat(currentPrice) : null);

    if (!isNaN(numInv) && numInv > 0) {
      if (!isNaN(numUnits) && numUnits > 0) {
        // Both invested amount and units are present -> auto-calculate Buy Price per unit
        const avgBuy = Math.round((numInv / numUnits) * 10000) / 10000;
        setBuyPrice(String(avgBuy));
        if (activePrice && activePrice > 0) {
          const computedVal = Math.round(numUnits * activePrice * 100) / 100;
          setCurrentValue(String(computedVal));
        }
      } else {
        // Units is not set -> derive units from Buy Price or Live NAV
        const effPrice = !isNaN(numBuy) && numBuy > 0 ? numBuy : activePrice;
        if (effPrice && effPrice > 0) {
          const derivedUnits = Math.round((numInv / effPrice) * 10000) / 10000;
          setUnits(String(derivedUnits));
          if (activePrice && activePrice > 0) {
            const computedVal = Math.round(derivedUnits * activePrice * 100) / 100;
            setCurrentValue(String(computedVal));
          } else {
            setCurrentValue(val);
          }
          if (isNaN(numBuy) || numBuy <= 0) {
            setBuyPrice(String(effPrice));
          }
        } else {
          setCurrentValue(val);
        }
      }
    } else if (!val) {
      setUnits('');
      setCurrentValue('');
      setBuyPrice('');
    }
  };

  const handleUnitsChange = (val: string) => {
    setUnits(val);
    const numUnits = parseFloat(val);
    const numInv = parseFloat(investedAmount);
    const numBuy = parseFloat(buyPrice);
    const activePrice = livePrice ?? (currentPrice ? parseFloat(currentPrice) : null);

    if (!isNaN(numUnits) && numUnits > 0) {
      if (activePrice && activePrice > 0) {
        const computedVal = Math.round(numUnits * activePrice * 100) / 100;
        setCurrentValue(String(computedVal));
      }

      if (!isNaN(numInv) && numInv > 0) {
        // Both invested amount and units exist -> auto calculate average buy price
        const avgBuy = Math.round((numInv / numUnits) * 10000) / 10000;
        setBuyPrice(String(avgBuy));
      } else if (!isNaN(numBuy) && numBuy > 0) {
        const computedInv = Math.round(numUnits * numBuy * 100) / 100;
        setInvestedAmount(String(computedInv));
      } else if (activePrice && activePrice > 0) {
        const computedInv = Math.round(numUnits * activePrice * 100) / 100;
        setInvestedAmount(String(computedInv));
        setBuyPrice(String(activePrice));
      }
    }
  };

  const handleBuyPriceChange = (val: string) => {
    setBuyPrice(val);
    const numBuy = parseFloat(val);
    const numUnits = parseFloat(units);
    const numInv = parseFloat(investedAmount);
    const activePrice = livePrice ?? (currentPrice ? parseFloat(currentPrice) : null);

    if (!isNaN(numBuy) && numBuy > 0) {
      if (!isNaN(numInv) && numInv > 0) {
        const derivedUnits = Math.round((numInv / numBuy) * 10000) / 10000;
        setUnits(String(derivedUnits));
        const effPrice = activePrice && activePrice > 0 ? activePrice : numBuy;
        const computedVal = Math.round(derivedUnits * effPrice * 100) / 100;
        setCurrentValue(String(computedVal));
      } else if (!isNaN(numUnits) && numUnits > 0) {
        const computedInv = Math.round(numUnits * numBuy * 100) / 100;
        setInvestedAmount(String(computedInv));
      }
    }
  };

  const handleCurrentPriceChange = (val: string) => {
    setCurrentPrice(val);
    const numPrice = parseFloat(val);
    if (!isNaN(numPrice) && numPrice > 0) {
      setLivePrice(numPrice);
      const numUnits = parseFloat(units);
      const numInv = parseFloat(investedAmount);
      const numBuy = parseFloat(buyPrice);

      if (!isNaN(numUnits) && numUnits > 0) {
        const computedVal = Math.round(numUnits * numPrice * 100) / 100;
        setCurrentValue(String(computedVal));
      } else if (!isNaN(numInv) && numInv > 0) {
        const effBuy = !isNaN(numBuy) && numBuy > 0 ? numBuy : numPrice;
        const derivedUnits = Math.round((numInv / effBuy) * 10000) / 10000;
        setUnits(String(derivedUnits));
        const computedVal = Math.round(derivedUnits * numPrice * 100) / 100;
        setCurrentValue(String(computedVal));
      }
    }
  };

  // ── Top-up specific calculations ──
  const effectiveNavForTopUp = livePrice ?? (currentPrice ? parseFloat(currentPrice) : (matchedHolding?.currentPrice || (matchedHolding && matchedHolding.units ? matchedHolding.currentValue / matchedHolding.units : 1)));

  const handleTopUpAmountChange = (val: string) => {
    setTopUpAmount(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0 && effectiveNavForTopUp > 0) {
      const derived = Math.round((num / effectiveNavForTopUp) * 10000) / 10000;
      setTopUpUnits(String(derived));
    } else if (!val) {
      setTopUpUnits('');
    }
  };

  const handleTopUpUnitsChange = (val: string) => {
    setTopUpUnits(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0 && effectiveNavForTopUp > 0) {
      const derived = Math.round(num * effectiveNavForTopUp * 100) / 100;
      setTopUpAmount(String(derived));
    } else if (!val) {
      setTopUpAmount('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'topup' && matchedHolding) {
      const addAmt = parseFloat(topUpAmount);
      if (isNaN(addAmt) || addAmt <= 0) {
        setError('Please enter a valid additional amount to invest');
        return;
      }

      const addU = topUpUnits ? parseFloat(topUpUnits) : (effectiveNavForTopUp > 0 ? addAmt / effectiveNavForTopUp : 0);
      const existingUnits = matchedHolding.units || 0;
      const existingInvested = matchedHolding.investedAmount || 0;

      const newTotalUnits = Math.round((existingUnits + addU) * 10000) / 10000;
      const newTotalInvested = Math.round((existingInvested + addAmt) * 100) / 100;
      const newAvgBuyPrice = newTotalUnits > 0 ? Math.round((newTotalInvested / newTotalUnits) * 10000) / 10000 : undefined;
      const effNav = effectiveNavForTopUp > 0 ? effectiveNavForTopUp : (matchedHolding.currentPrice || 1);
      const newTotalCurrentValue = Math.round(newTotalUnits * effNav * 100) / 100;

      try {
        setIsSubmitting(true);
        setError('');
        await onSubmit({
          name: matchedHolding.name,
          assetType: matchedHolding.assetType,
          investedAmount: newTotalInvested,
          currentValue: newTotalCurrentValue,
          units: newTotalUnits > 0 ? newTotalUnits : undefined,
          buyPrice: newAvgBuyPrice,
          currentPrice: effNav,
          sipAmount: matchedHolding.sipAmount,
          sipDay: matchedHolding.sipDay,
          xirr: matchedHolding.xirr,
          notes: matchedHolding.notes,
          existingIdToMerge: matchedHolding._id,
        });
        setIsSubmitting(false);
        onClose();
      } catch (err: any) {
        setIsSubmitting(false);
        setError(err?.message || 'Failed to top up holding. Please try again.');
      }
      return;
    }

    const numInvested = parseFloat(investedAmount);
    const numCurrent = currentValue ? parseFloat(currentValue) : numInvested;
    const numUnits = units ? parseFloat(units) : undefined;
    const numBuyPrice = buyPrice ? parseFloat(buyPrice) : undefined;
    const numCurrentPrice = currentPrice ? parseFloat(currentPrice) : undefined;
    const numSip = sipAmount ? parseFloat(sipAmount) : undefined;
    const numSipDay = sipDay ? parseInt(sipDay, 10) : undefined;

    if (!name.trim()) {
      setError('Please enter asset or investment name');
      return;
    }
    if (isNaN(numInvested) || numInvested < 0) {
      setError('Please enter a valid invested amount');
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
          name: name.trim(),
          assetType,
          investedAmount: numInvested,
          currentValue: !isNaN(numCurrent) ? numCurrent : numInvested,
          units: numUnits,
          buyPrice: numBuyPrice,
          currentPrice: numCurrentPrice,
          sipAmount: numSip,
          sipDay: numSipDay,
          xirr: xirr.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
        timeoutPromise,
      ]);

      setIsSubmitting(false);
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err?.message || 'Failed to save investment. Please try again.');
    }
  };

  const hasAutoValue = !!(livePrice && units && parseFloat(units) > 0);
  const autoBuyPriceCalculated = !!(units && parseFloat(units) > 0 && investedAmount && parseFloat(investedAmount) > 0);

  return (
    <NeoModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        mode === 'topup' && matchedHolding
          ? `TOP UP: ${matchedHolding.name.substring(0, 24)}...`
          : initialData
          ? 'EDIT INVESTMENT ASSET'
          : 'ADD INVESTMENT ASSET'
      }
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* ── TOP-UP MODE ACTIVE BANNER ── */}
        {mode === 'topup' && matchedHolding && (
          <div className="p-3.5 bg-[#E8F8F0] border-[3px] border-[#05DF72] shadow-neo-sm flex flex-col gap-2.5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-[#0B6B38] flex items-center gap-1.5">
                <CheckCircle2 size={15} />
                Topping Up Existing Holding
              </span>
              <button
                type="button"
                onClick={() => setMode('normal')}
                className="text-[10px] font-bold text-neutral-600 hover:text-neutral-900 underline cursor-pointer"
              >
                Switch to Separate Asset
              </button>
            </div>

            <div className="bg-white p-2.5 border-2 border-[#121212] flex flex-col gap-1">
              <span className="text-xs font-black uppercase text-[#121212] truncate">{matchedHolding.name}</span>
              <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-700 flex-wrap">
                <span>Holdings: <strong>{matchedHolding.units || 0} units</strong></span>
                <span>•</span>
                <span>Basis: <strong>{currencySymbol}{matchedHolding.investedAmount.toLocaleString('en-IN')}</strong></span>
                <span>•</span>
                <span>NAV: <strong>{currencySymbol}{effectiveNavForTopUp.toFixed(4)}</strong></span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-black uppercase text-[#121212]">
                  Additional Capital to Add ({currencySymbol}) *
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-sm font-mono font-black text-neutral-500 pointer-events-none">
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={topUpAmount}
                    onChange={(e) => handleTopUpAmountChange(e.target.value)}
                    placeholder="e.g. 999.00"
                    className="neo-input pl-8 pr-3 py-2 text-base font-mono font-black"
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-black uppercase text-[#121212]">
                  Additional Units (Auto-Derived)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={topUpUnits}
                  onChange={(e) => handleTopUpUnitsChange(e.target.value)}
                  placeholder="Auto-calculated from NAV"
                  className="neo-input px-3 py-2 text-base font-mono font-black"
                />
              </div>
            </div>

            {topUpAmount && parseFloat(topUpAmount) > 0 && (
              <div className="p-2.5 bg-white border border-[#05DF72] text-[11px] font-mono flex flex-col gap-1">
                <span className="font-bold text-[#0B6B38]">New Holding After Top-Up:</span>
                <div className="grid grid-cols-2 gap-1 text-neutral-800">
                  <span>New Basis: <strong>{currencySymbol}{(matchedHolding.investedAmount + (parseFloat(topUpAmount) || 0)).toFixed(2)}</strong></span>
                  <span>New Units: <strong>{((matchedHolding.units || 0) + (parseFloat(topUpUnits) || 0)).toFixed(4)} units</strong></span>
                  <span>New Avg Buy: <strong>{currencySymbol}{(((matchedHolding.investedAmount + (parseFloat(topUpAmount) || 0)) / ((matchedHolding.units || 0) + (parseFloat(topUpUnits) || 0))) || 0).toFixed(2)}</strong></span>
                  <span>New Valuation: <strong>{currencySymbol}{(((matchedHolding.units || 0) + (parseFloat(topUpUnits) || 0)) * effectiveNavForTopUp).toFixed(2)}</strong></span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── NORMAL MODE INPUTS ── */}
        {mode === 'normal' && (
          <>
            {/* Asset Name */}
            <div className="flex flex-col gap-1.5">
              <NeoInput
                label="Investment / Asset Name"
                value={name}
                onChange={(e) => {
                  const newName = e.target.value;
                  setName(newName);
                  if (!initialData && newName.trim().length >= 3) {
                    const detected = detectDetailedAssetType(newName);
                    if (detected.assetType && detected.assetType !== 'other') {
                      setAssetType(detected.assetType);
                    }
                    const matched = findMatchingExistingHolding(newName, existingInvestments);
                    if (matched && matched._id !== dismissedMatchId) {
                      setMatchedHolding(matched);
                    } else if (!matched) {
                      setMatchedHolding(null);
                    }
                  }
                }}
                placeholder="e.g. Enter fund name, stock ticker, or asset..."
                required
              />

              {/* Matching Existing Holding Banner in Normal Mode */}
              {matchedHolding && !initialData && dismissedMatchId !== matchedHolding._id && (
                <div className="p-3 bg-[#E8F8F0] border-2 border-[#05DF72] shadow-neo-sm flex flex-col gap-2 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-[#0B6B38] flex items-center gap-1">
                      <CheckCircle2 size={14} />
                      Existing Holding Found: {matchedHolding.name}
                    </span>
                    <span className="text-[10px] font-mono font-bold bg-[#05DF72] text-[#121212] px-1.5 py-0.5">
                      {matchedHolding.units || 0} units
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-600 font-medium">
                    Current Basis: {currencySymbol}{matchedHolding.investedAmount.toLocaleString('en-IN')} • Value: {currencySymbol}{matchedHolding.currentValue.toLocaleString('en-IN')}
                  </p>
                  <div className="flex items-center gap-2 pt-1 border-t border-[#05DF72]/40 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setMode('topup')}
                      className="px-3 py-1 bg-[#05DF72] hover:bg-[#04c463] text-[#121212] border border-[#121212] text-xs font-black uppercase shadow-neo-sm cursor-pointer"
                    >
                      Top Up Existing Holding (Add to Basis & Units)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDismissedMatchId(matchedHolding._id)}
                      className="px-2 py-1 bg-white hover:bg-neutral-100 text-neutral-700 border border-[#121212] text-xs font-bold cursor-pointer"
                    >
                      Create as Separate Asset
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Asset Classification Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--neo-border)' }}>
                <Layers size={13} />
                Asset Class *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {ASSET_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setAssetType(type.value)}
                    className="p-2 text-[11px] font-black uppercase border-2 transition-all cursor-pointer text-center truncate"
                    style={
                      assetType === type.value
                        ? { background: 'var(--neo-border)', color: 'var(--neo-yellow)', borderColor: 'var(--neo-border)', boxShadow: '3px 3px 0 var(--neo-border)' }
                        : { background: 'white', color: '#555', borderColor: '#ccc' }
                    }
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Live Price Indicator Badge ── */}
            {(isFetchingPrice || livePrice) && (
              <div
                className="flex items-center gap-2 px-3 py-2 border-2 text-xs font-black rounded-sm"
                style={{
                  background: livePrice ? 'linear-gradient(135deg, #e8fdf0, #f0fdf4)' : '#fafafa',
                  borderColor: livePrice ? '#05DF72' : '#ddd',
                }}
              >
                {isFetchingPrice ? (
                  <>
                    <Loader2 size={14} className="animate-spin" style={{ color: '#888' }} />
                    <span style={{ color: '#888' }}>Fetching live market price / NAV...</span>
                  </>
                ) : livePrice ? (
                  <>
                    <span
                      style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: '#05DF72', display: 'inline-block',
                        boxShadow: '0 0 6px #05DF72',
                        animation: 'pulse 2s infinite',
                      }}
                    />
                    <Zap size={13} style={{ color: '#05DF72' }} />
                    <span style={{ color: '#121212' }}>
                      LIVE: {currencySymbol}{livePrice.toLocaleString('en-IN', { maximumFractionDigits: 4 })}
                    </span>
                    {livePriceSymbol && (
                      <span style={{ color: '#888', fontWeight: 600, fontSize: 10 }}>
                        ({livePriceSymbol.length > 30 ? livePriceSymbol.substring(0, 30) + '…' : livePriceSymbol})
                      </span>
                    )}
                  </>
                ) : null}
              </div>
            )}

            {/* Invested Capital vs Current Valuation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--neo-border)' }}>
                  <DollarSign size={13} />
                  Invested Capital ({currencySymbol}) *
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-sm font-mono font-black text-neutral-500 pointer-events-none">
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={investedAmount}
                    onChange={(e) => handleInvestedAmountChange(e.target.value)}
                    placeholder="0.00"
                    className="neo-input pl-8 pr-3 py-2 text-base font-mono font-black"
                    style={{ color: 'var(--neo-border)' }}
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--neo-border)' }}>
                  <TrendingUp size={13} style={{ color: 'var(--neo-green)' }} />
                  Current Value ({currencySymbol}) *
                  {hasAutoValue && (
                    <span className="text-[9px] font-bold ml-1 px-1 py-0.5" style={{ color: '#fff', background: '#05DF72', borderRadius: 2 }}>AUTO</span>
                  )}
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-sm font-mono font-black text-neutral-500 pointer-events-none">
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={currentValue}
                    onChange={(e) => setCurrentValue(e.target.value)}
                    placeholder="0.00"
                    className="neo-input pl-8 pr-3 py-2 text-base font-mono font-black"
                    style={{ color: 'var(--neo-green)' }}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Units, Buy Price & Live Price */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-black uppercase text-neutral-600">
                  Quantity / Units (Optional)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={units}
                  onChange={(e) => handleUnitsChange(e.target.value)}
                  placeholder="Auto-calculated"
                  className="neo-input py-1.5 px-2.5 text-xs font-mono font-bold"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-black uppercase text-neutral-600 flex items-center justify-between">
                  <span>Buy Price / Unit ({currencySymbol})</span>
                  {autoBuyPriceCalculated && (
                    <span className="text-[9px] font-bold text-[#05DF72] lowercase font-mono">auto: inv ÷ units</span>
                  )}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={buyPrice}
                  onChange={(e) => handleBuyPriceChange(e.target.value)}
                  placeholder="0.00"
                  className="neo-input py-1.5 px-2.5 text-xs font-mono font-bold"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-black uppercase text-neutral-600 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    Live Price / NAV ({currencySymbol})
                    {livePrice && (
                      <span
                        style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: '#05DF72', display: 'inline-block',
                          boxShadow: '0 0 4px #05DF72',
                        }}
                      />
                    )}
                  </span>
                  <span className="text-[9px] font-bold text-neutral-400 lowercase">editable</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={currentPrice}
                  onChange={(e) => handleCurrentPriceChange(e.target.value)}
                  placeholder={isFetchingPrice ? 'Fetching...' : 'Click to edit NAV'}
                  className="neo-input py-1.5 px-2.5 text-xs font-mono font-bold"
                  style={{ color: livePrice ? '#05DF72' : undefined }}
                />
              </div>
            </div>

            {/* Recurring SIP Section */}
            <div className="p-3 border-2 shadow-neo-sm flex flex-col gap-2" style={{ background: 'var(--neo-bg)', borderColor: 'var(--neo-border)' }}>
              <div className="flex items-center gap-1.5 text-xs font-black uppercase" style={{ color: 'var(--neo-border)' }}>
                <Calendar size={14} style={{ color: 'var(--neo-cyan)' }} />
                <span>Monthly Recurring SIP (Optional)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-black uppercase text-neutral-600">
                    Monthly SIP Amount ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={sipAmount}
                    onChange={(e) => setSipAmount(e.target.value)}
                    placeholder="0.00"
                    className="neo-input py-1.5 px-2.5 text-xs font-mono font-bold"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-black uppercase text-neutral-600">
                    SIP Deduction Day (1 - 28)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    value={sipDay}
                    onChange={(e) => setSipDay(e.target.value)}
                    placeholder="5"
                    className="neo-input py-1.5 px-2.5 text-xs font-mono font-bold"
                  />
                </div>
              </div>
            </div>

            {/* Notes and XIRR */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-black uppercase text-neutral-600">
                  XIRR / CAGR % (Optional)
                </label>
                <input
                  type="text"
                  value={xirr}
                  onChange={(e) => setXirr(e.target.value)}
                  placeholder="—"
                  className="neo-input py-1.5 px-2.5 text-xs font-mono font-bold"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-black uppercase text-neutral-600">
                  Notes / Folio Number (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional folio, demat, or notes"
                  className="neo-input py-1.5 px-2.5 text-xs font-bold"
                />
              </div>
            </div>
          </>
        )}

        {error && (
          <div className="text-white text-xs font-bold p-2.5 border-2 shadow-neo-sm" style={{ background: 'var(--neo-red)', borderColor: 'var(--neo-border)' }}>
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
              : mode === 'topup' && matchedHolding
              ? `Confirm Top Up (+${currencySymbol}${topUpAmount || '0.00'})`
              : initialData
              ? 'Update Asset'
              : 'Add Investment'}
          </NeoButton>
        </div>
      </form>
    </NeoModal>
  );
};
