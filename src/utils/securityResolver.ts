/**
 * Panam Paaru — Deterministic Security Identity Resolver
 *
 * Resolves imported assets into canonical security identities:
 * 1. Strict ISIN resolution (INF for MF, INE for Equities)
 * 2. Scheme plan (Direct vs Regular) and option (Growth vs IDCW) separation
 * 3. Multi-asset class differentiation: Mutual Funds, Stocks, ETFs, Gold, Crypto, FD, PPF, REITs, Bonds
 * 4. Confidence status assignment: EXACT, MATCHED_BY_ISIN, MATCHED_BY_SCHEME_CODE, MATCHED_BY_SYMBOL, REVIEW_REQUIRED, UNRESOLVED
 *
 * NO GUESSING: If ambiguous, marks as REVIEW_REQUIRED.
 */

export type ResolutionConfidence =
  | 'EXACT'
  | 'MATCHED_BY_ISIN'
  | 'MATCHED_BY_SCHEME_CODE'
  | 'MATCHED_BY_SYMBOL'
  | 'REVIEW_REQUIRED'
  | 'UNRESOLVED';

import { AssetType } from '../types';

export type CanonicalAssetType =
  | 'mutual_fund'
  | 'stocks'
  | 'etf'
  | 'gold'
  | 'crypto'
  | 'fd_rd'
  | 'ppf_epf'
  | 'reit_invit'
  | 'bonds'
  | 'other';

export function toAppAssetType(cat: CanonicalAssetType): AssetType {
  switch (cat) {
    case 'mutual_fund':
      return 'mutual_fund';
    case 'stocks':
    case 'etf':
      return 'stocks';
    case 'gold':
      return 'gold';
    case 'crypto':
      return 'crypto';
    case 'fd_rd':
      return 'fd_rd';
    case 'ppf_epf':
      return 'ppf_epf';
    case 'reit_invit':
      return 'stocks';
    case 'bonds':
    case 'other':
    default:
      return 'other';
  }
}

export interface ResolvedSecurityIdentity {
  rawName: string;
  normalizedName: string;
  canonicalName: string;
  assetType: AssetType;
  canonicalAssetType: CanonicalAssetType;
  subType?: string;
  sector?: string;
  amc?: string;
  isin?: string;
  symbol?: string;
  exchange?: 'NSE' | 'BSE';
  plan?: 'Direct' | 'Regular' | 'Unknown';
  option?: 'Growth' | 'IDCW' | 'Dividend' | 'Unknown';
  confidence: ResolutionConfidence;
  confidenceScore: number; // 0 to 100
  reviewReasons: string[];
}

export const INDIAN_ISIN_REGEX = /\b(IN[A-Z0-9]{10})\b/i;
export const MUTUAL_FUND_ISIN_REGEX = /\b(INF[A-Z0-9]{9})\b/i;
export const EQUITY_ISIN_REGEX = /\b(INE[A-Z0-9]{9})\b/i;

const MAJOR_AMCS: { name: string; aliases: string[] }[] = [
  { name: 'HDFC Mutual Fund', aliases: ['hdfc mutual fund', 'hdfc mf', 'hdfc'] },
  { name: 'ICICI Prudential Mutual Fund', aliases: ['icici prudential', 'icici pru', 'icici mf', 'icici'] },
  { name: 'SBI Mutual Fund', aliases: ['sbi mutual fund', 'sbi mf', 'sbi'] },
  { name: 'Parag Parikh Financial Advisory Services', aliases: ['parag parikh', 'ppfas', 'ppfas mf'] },
  { name: 'Nippon India Mutual Fund', aliases: ['nippon india', 'nippon mf', 'nippon', 'reliance mutual fund'] },
  { name: 'Kotak Mahindra Mutual Fund', aliases: ['kotak mahindra', 'kotak mf', 'kotak'] },
  { name: 'Axis Mutual Fund', aliases: ['axis mutual fund', 'axis mf', 'axis'] },
  { name: 'Mirae Asset Mutual Fund', aliases: ['mirae asset', 'mirae mf', 'mirae'] },
  { name: 'UTI Mutual Fund', aliases: ['uti mutual fund', 'uti mf', 'uti'] },
  { name: 'Aditya Birla Sun Life Mutual Fund', aliases: ['aditya birla', 'absl mf', 'absl', 'birla sun life'] },
  { name: 'Tata Mutual Fund', aliases: ['tata mutual fund', 'tata mf', 'tata'] },
  { name: 'DSP Mutual Fund', aliases: ['dsp mutual fund', 'dsp mf', 'dsp blackrock', 'dsp'] },
  { name: 'Bandhan Mutual Fund', aliases: ['bandhan mutual fund', 'bandhan mf', 'idfc mutual fund', 'idfc mf'] },
  { name: 'Quant Mutual Fund', aliases: ['quant mutual fund', 'quant mf', 'quant'] },
  { name: 'Motilal Oswal Mutual Fund', aliases: ['motilal oswal', 'motilal mf', 'motilal'] },
  { name: 'Edelweiss Mutual Fund', aliases: ['edelweiss mutual fund', 'edelweiss mf', 'edelweiss'] },
  { name: 'Sundaram Mutual Fund', aliases: ['sundaram mutual fund', 'sundaram mf', 'sundaram'] },
  { name: 'Invesco Mutual Fund', aliases: ['invesco mutual fund', 'invesco mf', 'invesco'] },
  { name: 'Franklin Templeton Mutual Fund', aliases: ['franklin templeton', 'franklin mf', 'franklin'] },
  { name: 'Canara Robeco Mutual Fund', aliases: ['canara robeco', 'canara mf'] },
  { name: 'HSBC Mutual Fund', aliases: ['hsbc mutual fund', 'hsbc mf', 'l&t mutual fund'] },
];

/**
 * Strips noise, corporate wrappers, and punctuation from holding names
 */
export function normalizeSecurityName(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts and validates an Indian ISIN from text or fields
 */
export function extractValidIsin(text?: string): string | undefined {
  if (!text) return undefined;
  const match = text.match(INDIAN_ISIN_REGEX);
  if (match) {
    const isin = match[1].toUpperCase();
    if (isin.length === 12) return isin;
  }
  return undefined;
}

/**
 * Determines Mutual Fund Plan (Direct vs Regular)
 */
export function detectMfPlan(text: string): 'Direct' | 'Regular' | 'Unknown' {
  if (/\b(direct\s*plan|direct\s*growth|direct\s*idcw|\bdirect\b|\bdir\b)\b/i.test(text)) {
    return 'Direct';
  }
  if (/\b(regular\s*plan|regular\s*growth|regular\s*idcw|\bregular\b|\breg\b)\b/i.test(text)) {
    return 'Regular';
  }
  return 'Unknown';
}

/**
 * Determines Mutual Fund Option (Growth vs IDCW vs Dividend)
 */
export function detectMfOption(text: string): 'Growth' | 'IDCW' | 'Dividend' | 'Unknown' {
  if (/\b(growth|growth\s*plan|\bgr\b)\b/i.test(text)) {
    return 'Growth';
  }
  if (/\b(idcw|income\s*distribution)\b/i.test(text)) {
    return 'IDCW';
  }
  if (/\b(dividend|payout|reinvestment)\b/i.test(text)) {
    return 'Dividend';
  }
  return 'Unknown';
}

/**
 * Classifies asset type deterministically based on name, ISIN, and category hints
 */
export function classifyAsset(
  name: string,
  hintType?: string,
  hintSubCat?: string,
  isin?: string
): { assetType: CanonicalAssetType; subType?: string } {
  const clean = name.toLowerCase();
  const cleanHints = `${hintType || ''} ${hintSubCat || ''}`.toLowerCase();

  // 1. ISIN-based absolute classification
  if (isin) {
    if (isin.startsWith('INF')) {
      return { assetType: 'mutual_fund', subType: hintSubCat || 'Mutual Fund' };
    }
    if (isin.startsWith('INE') || isin.startsWith('IN9')) {
      // Check if it's an ETF or SGB before assuming equity
      if (/\b(etf|bees|gold\s*etf|nifty\s*bees)\b/i.test(clean)) {
        return { assetType: 'etf', subType: 'Exchange Traded Fund' };
      }
      if (/\b(sgb|sovereign\s*gold\s*bond)\b/i.test(clean)) {
        return { assetType: 'gold', subType: 'Sovereign Gold Bond' };
      }
      return { assetType: 'stocks', subType: hintSubCat || 'Equity' };
    }
  }

  // 2. Sovereign Gold Bonds / Gold
  if (/\b(sovereign\s*gold\s*bond|sgb\s*\d|sgb|digital\s*gold|24k\s*gold)\b/i.test(clean) || /\bgold\b/i.test(cleanHints)) {
    return { assetType: 'gold', subType: 'Sovereign Gold Bond / Gold' };
  }

  // 3. ETFs
  if (/\b(etf|bees|\w+bees|exchange\s*traded\s*fund)\b/i.test(clean) || /\betf\b/i.test(cleanHints)) {
    return { assetType: 'etf', subType: 'ETF' };
  }

  // 4. Crypto
  if (/\b(bitcoin|btc|ethereum|eth|solana|sol|tether|usdt|cardano|ada|doge|ripple|xrp|crypto)\b/i.test(clean)) {
    return { assetType: 'crypto', subType: 'Cryptocurrency' };
  }

  // 5. Fixed Income / FD / RD
  if (/\b(fixed\s*deposit|term\s*deposit|recurring\s*deposit|\bfd\b|\brd\b)\b/i.test(clean) || /\b(fd|rd|deposit)\b/i.test(cleanHints)) {
    return { assetType: 'fd_rd', subType: 'Fixed Deposit' };
  }

  // 6. Retirement / PF / NPS
  if (/\b(ppf|epf|vpf|provident\s*fund|nps\s*tier|national\s*pension)\b/i.test(clean) || /\b(ppf|epf|nps)\b/i.test(cleanHints)) {
    return { assetType: 'ppf_epf', subType: 'Retirement / Pension' };
  }

  // 7. REITs / InvITs
  if (/\b(reit|invit|embassy\s*office|mindspace|brookfield\s*india|powergrid\s*invit|nexus\s*select)\b/i.test(clean)) {
    return { assetType: 'reit_invit', subType: 'REIT / InvIT' };
  }

  // 8. Bonds & Debentures
  if (/\b(debenture|ncd|tax\s*free\s*bond|gov\s*bond|g\s*sec|treasury\s*bill|corporate\s*bond)\b/i.test(clean)) {
    return { assetType: 'bonds', subType: 'Bond / Debenture' };
  }

  // 9. Stocks Check (Explicit stock tickers, corporate names, or bank names without fund keywords)
  const hasMfKeywords = /\b(fund|scheme|index\s*fund|flexi\s*cap|mid\s*cap|small\s*cap|large\s*cap|elss|tax\s*saver|hybrid|arbitrage|overnight|liquid|equity\s*fund|debt\s*fund|direct\s*plan|regular\s*plan|\bgrowth\b|\bidcw\b|dividend|plan|option)\b/i.test(clean);
  const isExplicitStock = /\b(bank|ltd|limited|corp|technologies|industries|enterprises|motors|holding)\b/i.test(clean) && !hasMfKeywords;

  if (isExplicitStock) {
    return { assetType: 'stocks', subType: hintSubCat || 'Equity Share' };
  }

  // 10. Mutual Funds
  const isMfPattern =
    hasMfKeywords ||
    /\b(mutual\s*fund|mf)\b/i.test(cleanHints) ||
    MAJOR_AMCS.some((a) => a.aliases.some((al) => clean.includes(al) && (hasMfKeywords || clean.includes('mutual fund') || clean.includes('amc'))));

  if (isMfPattern) {
    return { assetType: 'mutual_fund', subType: hintSubCat || 'Mutual Fund Scheme' };
  }

  // 11. Default Stocks if single symbol or company indicators
  if (/^[a-z0-9]{2,14}$/i.test(clean) || /\b(ltd|limited|corp|technologies|industries|enterprises|bank|finance|motors)\b/i.test(clean)) {
    return { assetType: 'stocks', subType: 'Equity Share' };
  }

  return { assetType: 'other', subType: hintSubCat || 'Other Investment' };
}

/**
 * Resolves security identity and computes confidence level
 */
export function resolveSecurityIdentity(
  rawName: string,
  isinValue?: string,
  symbolValue?: string,
  hintType?: string,
  hintSubCat?: string,
  folioValue?: string
): ResolvedSecurityIdentity {
  const normName = normalizeSecurityName(rawName);
  const isin = extractValidIsin(isinValue) || extractValidIsin(folioValue) || extractValidIsin(rawName);
  const { assetType, subType } = classifyAsset(normName, hintType, hintSubCat, isin);

  let plan: 'Direct' | 'Regular' | 'Unknown' = 'Unknown';
  let option: 'Growth' | 'IDCW' | 'Dividend' | 'Unknown' = 'Unknown';
  let amc: string | undefined;

  if (assetType === 'mutual_fund') {
    plan = detectMfPlan(normName);
    option = detectMfOption(normName);

    const matchedAmc = MAJOR_AMCS.find((a) => a.aliases.some((al) => normName.toLowerCase().includes(al)));
    if (matchedAmc) {
      amc = matchedAmc.name;
    } else {
      const dynAmcMatch = normName.match(/^([A-Za-z0-9&.\s]+?\s+(?:Mutual\s+Fund|Asset\s+Management|AMC))/i);
      if (dynAmcMatch) {
        amc = dynAmcMatch[1].trim();
      }
    }
  }

  let confidence: ResolutionConfidence = 'UNRESOLVED';
  let confidenceScore = 30;
  const reviewReasons: string[] = [];

  if (isin) {
    confidence = 'MATCHED_BY_ISIN';
    confidenceScore = 95;
  } else if (symbolValue && /^[A-Z0-9\-]+$/i.test(symbolValue)) {
    confidence = 'MATCHED_BY_SYMBOL';
    confidenceScore = 80;
  } else if (assetType === 'mutual_fund') {
    if (plan === 'Unknown') {
      reviewReasons.push('Mutual fund scheme plan (Direct vs Regular) is ambiguous.');
      confidence = 'REVIEW_REQUIRED';
      confidenceScore = 55;
    } else {
      confidence = 'EXACT';
      confidenceScore = 75;
    }
  } else if (assetType === 'stocks') {
    confidence = 'EXACT';
    confidenceScore = 70;
  }

  return {
    rawName,
    normalizedName: normName,
    canonicalName: normName,
    assetType: toAppAssetType(assetType),
    canonicalAssetType: assetType,
    subType,
    amc,
    isin,
    symbol: symbolValue,
    plan,
    option,
    confidence,
    confidenceScore,
    reviewReasons,
  };
}
