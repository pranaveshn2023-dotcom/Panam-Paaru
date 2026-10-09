import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { AssetType } from '../types';
import { detectDetailedAssetType, detectStockSector, detectAmcFromText } from './liveMarketService';
import { detectTablesInSheet, selectPrimaryTable, DetectedTable } from './tableDetector';
import { mapHeadersToCanonical, CanonicalColumnMapping } from './columnMapper';
import { resolveSecurityIdentity, ResolutionConfidence } from './securityResolver';
import { validateHoldingRow } from './importValidator';
import { detectBrokerFromFile } from './brokerDirectory';

// PDF Worker Initialization
function initPdfWorker() {
  if (typeof window !== 'undefined') {
    if (pdfjsLib.GlobalWorkerOptions.workerSrc && pdfjsLib.GlobalWorkerOptions.workerSrc !== './pdf.worker.mjs') return;
    const base = (typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL) || '/';
    pdfjsLib.GlobalWorkerOptions.workerSrc = `${base.replace(/\/$/, '')}/pdf.worker.min.mjs`;
  } else if (typeof process !== 'undefined') {
    try {
      const cwd = process.cwd().replace(/\\/g, '/');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `file:///${cwd}/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`;
    } catch {
      // ignore
    }
  }
}

export class PasswordRequiredError extends Error {
  isPasswordRequired: boolean = true;
  isIncorrectPassword: boolean = false;

  constructor(message: string, isIncorrect: boolean = false) {
    super(message);
    this.name = 'PasswordRequiredError';
    this.isIncorrectPassword = isIncorrect;
  }
}

export interface ParsedHolding {
  id: string;
  name: string;
  assetType: AssetType;
  subType?: string;
  sector?: string;
  amc?: string;
  investedAmount: number;
  currentValue: number;
  returns?: number;
  units?: number;
  buyPrice?: number;
  currentPrice?: number;
  statementPrice?: number;
  statementValue?: number;
  isLiveSynced?: boolean;
  liveNavDate?: string;
  sipAmount?: number;
  sipDay?: number;
  notes?: string;
  broker?: string;
  folioNo?: string;
  isin?: string;
  schemeCode?: number;
  bseCode?: string;
  ticker?: string;
  xirr?: string;
  selected: boolean;
  isValid: boolean;
  resolutionStatus?: ResolutionConfidence;
  marketProvider?: 'AMFI' | 'YAHOO_FINANCE' | 'IMPORTED' | 'UNRESOLVED';
  marketIdentifier?: string;
  reviewReasons?: string[];
  requiresReview?: boolean;
  sourceSheet?: string;
  sourceRowIndex?: number;
}

export function cleanNavPrice(val: number, isMf: boolean = false): number {
  if (isNaN(val) || val <= 0) return 0;
  return isMf ? Math.round(val * 10000) / 10000 : Math.round(val * 100) / 100;
}

export interface RawFileContent {
  fileName: string;
  sheets: {
    sheetName: string;
    rows: (string | number)[][];
  }[];
}

// ──────────────────────────────────────────
// Pure Utility — Number and Text Cleaning
// ──────────────────────────────────────────

export function cleanUnits(units: number | undefined): number | undefined {
  if (units === undefined || isNaN(units) || units <= 0) return undefined;
  // Round to 8 decimal places to support crypto satoshi-level precision while removing JS IEEE 754 float artifacts
  const rounded = Math.round(units * 1e8) / 1e8;
  return rounded;
}

export function cleanCurrency(val: number): number {
  if (isNaN(val)) return 0;
  return Math.round(val * 100) / 100;
}

export function cleanXirr(val: any): string | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'number') {
    if (isNaN(val)) return undefined;
    if (Math.abs(val) <= 1 && val !== 0) {
      const pct = parseFloat((val * 100).toFixed(2));
      return `${pct}%`;
    }
    const pct = parseFloat(val.toFixed(2));
    return `${pct}%`;
  }
  const str = String(val).trim();
  if (!str || str === '-' || str.toLowerCase() === 'n/a' || str.toLowerCase() === 'nan') {
    return undefined;
  }
  if (str.includes('%')) {
    const num = parseFloat(str.replace(/%/g, '').trim());
    if (!isNaN(num)) {
      return `${parseFloat(num.toFixed(2))}%`;
    }
    return str;
  }
  const num = parseFloat(str);
  if (!isNaN(num)) {
    if (Math.abs(num) <= 1 && num !== 0) {
      return `${parseFloat((num * 100).toFixed(2))}%`;
    }
    return `${parseFloat(num.toFixed(2))}%`;
  }
  return undefined;
}

export function parseCleanNumber(val: any): number {
  if (val instanceof Date) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;

  let str = String(val)
    .replace(/[₹$,\s%]/gi, '')
    .replace(/INR/gi, '')
    .replace(/\((.*?)\)/g, '-$1')
    .trim();

  // Strict rejection of phone numbers (10 digits starting with 6-9)
  if (/^[6-9]\d{9}$/.test(str)) return 0;
  // Rejection of Indian PAN cards
  if (/^[A-Z]{5}\d{4}[A-Z]$/i.test(str)) return 0;
  // Reject dates
  if (/^\d{2}[-/]\d{2}[-/]\d{2,4}$/.test(str)) return 0;

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Strict check for Personal Information (PAN, Investor Names, Phones, Emails, Addresses)
 * Guarantees zero personal details are ever captured as asset holdings.
 */
export function isPersonalInfo(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  // PAN card pattern (e.g. ABCDE1234F)
  if (/\b[A-Z]{5}[0-9]{4}[A-Z]\b/i.test(t)) return true;

  // Phone / Mobile number (exempt folio lines from phone number check)
  if (!/\bfolio\b/i.test(t) && (/\b(mobile|phone|contact|tel)\s*[:.]/i.test(t) || /\b[6-9]\d{9}\b/.test(t))) {
    return true;
  }

  // Email address
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(t) || /\bemail\s*[:.]/i.test(t)) return true;

  // Investor / Account holder headers
  if (/^(name\s*of\s*(the\s*)?(investor|holder|client|unit\s*holder|account)|investor\s*name|account\s*holder|client\s*name)\s*[:.]/i.test(t)) return true;
  if (/\b(nominee|guardian|joint\s*holder|dp\s*id|client\s*id)\b/i.test(t)) return true;

  // Residential / Postal addresses
  if (/\b(pincode|pin\s*code|address|street|road|nagar|floor|dist)\s*[:.]/i.test(t)) return true;
  if (/kyc\s*(verified|compliant|ok|status|details)/i.test(t)) return true;

  return false;
}

/** Noise tokens that look like tickers but are metadata */
const NOISE_TOKENS = new Set([
  'PAN', 'AADHAAR', 'GSTIN', 'GST', 'TAN', 'CIN', 'NA', 'NIL', 'YES', 'NO', 'PAGE', 'TOTAL',
  'SUMMARY', 'PORTFOLIO', 'STATEMENT', 'HOLDINGS', 'REPORT', 'VALUE', 'INVESTMENT',
]);

/**
 * Checks if a line is CAS metadata, summary, or table noise
 */
export function isCASMetadata(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (t.length < 3) return true;
  if (/^\d+$/.test(t)) return true;

  // Personal information check
  if (isPersonalInfo(t)) return true;

  // Valuation summary lines are NOT scheme names
  if (/(?:market|cost|total\s*cost|current|present|latest)\s*val(?:ue)?\s*[:：]/i.test(t)) return true;
  if (/(?:closing|opening|balance)\s*(?:unit\s*)?balance\s*[:：]/i.test(t)) return true;
  if (/^valuation\s*on\b/i.test(t)) return true;

  // Grand totals and summary rows
  if (/^(grand\s*total|sub\s*total|total|summary|portfolio\s*summary|portfolio\s*valuation)/i.test(t)) return true;
  if (/^consolidated\s*account\s*statement|^statement\s*period|^page\s+\d/i.test(t)) return true;
  if (/^registrar|^amc\s*[:]|brokerage|^advisor|^distributor/i.test(t)) return true;
  if (/^\d{2}[-/]\w{3}[-/]\d{2,4}/.test(t)) return true; // transaction date row

  return false;
}

export function isValidHoldingName(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;

  // Reject personal info & metadata
  if (isPersonalInfo(t)) return false;
  if (isCASMetadata(t)) return false;

  // Allow short all-caps tickers (TCS, ITC, INFY, HDFC, RELIANCE, etc.)
  if (/^[A-Z]{2,8}$/.test(t) && !NOISE_TOKENS.has(t.toUpperCase())) return true;
  if (t.length < 3) return false;

  // Must contain at least 2 alphabetic characters
  const letterCount = (t.match(/[a-zA-Z]/g) || []).length;
  if (letterCount < 2) return false;
  if (/^\d+$/.test(t)) return false;

  return true;
}

export function cleanSchemeName(line: string): string {
  return line
    .replace(/^(name\s+of\s+(the\s+)?(scheme|instrument|security)|scheme\s*name|scheme|scrip\s*name|instrument|particulars?)\s*[:：]\s*/i, '')
    .replace(/\bfolio\s*(no|number)?\s*[:.]\s*[\w\d/ -]+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const LABEL_TOKENS = [
  'market value', 'current value', 'present value', 'latest value',
  'total market value', 'cost value', 'total cost value', 'total cost',
  'cost of investment', 'cost of acquisition', 'acquisition cost',
  'amount invested', 'invested amount', 'total investment', 'investment',
  'purchase value', 'purchase cost', 'purchase price', 'book value', 'book cost', 'cost',
  'valuation on', 'closing unit balance', 'unit balance', 'balance units',
  'closing balance', 'nav', 'avg nav', 'avg cost', 'purchase nav', 'buy price',
];

function extractLabeledValue(line: string, labelRegex: RegExp): number {
  const lower = line.toLowerCase();
  const m = labelRegex.exec(line);
  if (!m) return 0;
  const start = m.index + m[0].length;
  let end = line.length;
  for (const lb of LABEL_TOKENS) {
    const li = lower.indexOf(lb, start);
    if (li !== -1 && li < end) end = li;
  }
  const nums = line.slice(start, end).match(/[\d,]+(?:\.\d+)?/g);
  if (!nums) return 0;
  const parsed = nums.map(parseCleanNumber).filter((n) => n > 0);
  return parsed.length > 0 ? parsed[0] : 0;
}

// ──────────────────────────────────────────
// Backward-compatible asset detector (delegates to liveMarketService)
// ──────────────────────────────────────────

export function detectAssetType(name: string): AssetType {
  return detectDetailedAssetType(name).assetType;
}

// ──────────────────────────────────────────
// Fund & Stock Entity-Based CAS PDF Parser
// ──────────────────────────────────────────

async function parseCASPdf(file: File, password?: string): Promise<ParsedHolding[]> {
  initPdfWorker();
  const buffer = await file.arrayBuffer();
  let pdf: any;

  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      password: password || undefined,
    });
    pdf = await loadingTask.promise;
  } catch (err: any) {
    if (
      err?.name === 'PasswordException' ||
      err?.code === 1 ||
      err?.code === 2 ||
      String(err?.message || '').toLowerCase().includes('password')
    ) {
      throw new PasswordRequiredError(
        err?.code === 2 ? 'Incorrect password for PDF.' : 'PDF is password-protected.',
        err?.code === 2
      );
    }
    throw err;
  }

  const numPages = pdf.numPages;
  const allItems: { text: string; y: number; x: number; page: number }[] = [];

  for (let p = 1; p <= numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items as any[]) {
      const text = String(item.str || '').trim();
      if (text) {
        allItems.push({
          text,
          y: Math.round(item.transform[5]),
          x: Math.round(item.transform[4]),
          page: p,
        });
      }
    }
  }

  // Group text into lines by Y coordinate (3px tolerance)
  const lineMap = new Map<string, { text: string; x: number }[]>();
  for (const item of allItems) {
    const key = `${item.page}_${Math.round(item.y / 3) * 3}`;
    if (!lineMap.has(key)) lineMap.set(key, []);
    lineMap.get(key)!.push({ text: item.text, x: item.x });
  }

  // Sort lines top-to-bottom across pages
  const sortedLines = Array.from(lineMap.entries())
    .sort((a, b) => {
      const [pageA, yA] = a[0].split('_').map(Number);
      const [pageB, yB] = b[0].split('_').map(Number);
      if (pageA !== pageB) return pageA - pageB;
      return yB - yA; // Bottom-up Y
    })
    .map(([, items]) => {
      items.sort((a, b) => a.x - b.x);
      return items.map((i) => i.text).join('  ');
    });

  // ────────────────────────────────────────
  // Fund & Stock Entity Block Gathering
  // ────────────────────────────────────────
  const holdings: ParsedHolding[] = [];
  let idCounter = 0;

  // Identify all entity block start indices (Folio lines, "Name of the Scheme:", ISIN-grouped demat holdings)
  const blockIndices: number[] = [];
  for (let i = 0; i < sortedLines.length; i++) {
    const line = sortedLines[i];
    if (isPersonalInfo(line)) continue;

    if (
      /\bfolio\s*(no|number)?\s*[:.]/i.test(line) ||
      /^name\s+of\s+the\s+scheme\s*[:.]/i.test(line)
    ) {
      blockIndices.push(i);
    } else if (/\bisin\s*[:.]\s*INF/i.test(line)) {
      // CAMS/KFin print "ISIN: INF..." under every scheme name — that is scheme
      // metadata, NOT a new holding. Only ISIN lines introducing demat/depository
      // holdings (followed by "Name of the Instrument / Security") start a block.
      const nextLine = sortedLines[i + 1] || '';
      if (/name\s+of\s+the\s+(instrument|security)|^\s*instrument\s*[:]/i.test(nextLine)) {
        blockIndices.push(i);
      }
    }
  }

  // Parse each entity block
  for (let bi = 0; bi < blockIndices.length; bi++) {
    const startIdx = blockIndices[bi];
    const endIdx = bi + 1 < blockIndices.length ? blockIndices[bi + 1] : Math.min(sortedLines.length, startIdx + 200);

    let schemeName = '';
    let folioNo = '';

    // 1. Locate Scheme Name: Search forward from startIdx first (where scheme name usually sits), then backward
    const forwardCandidates: number[] = [];
    for (let j = startIdx; j < Math.min(endIdx, startIdx + 6); j++) forwardCandidates.push(j);
    for (let j = startIdx - 1; j >= Math.max(0, startIdx - 3); j--) forwardCandidates.push(j);

    for (const j of forwardCandidates) {
      const candidate = sortedLines[j];
      if (isPersonalInfo(candidate)) continue;

      // Extract Folio if present
      const folioMatch = candidate.match(/\bfolio\s*(no|number)?\s*[:.]\s*([\w\d/ -]+)/i);
      if (folioMatch && !folioNo) {
        folioNo = folioMatch[2].trim();
      }

      const cleaned = cleanSchemeName(candidate);
      if (
        isValidHoldingName(cleaned) &&
        !isCASMetadata(cleaned) &&
        !/\bfolio\s*(no|number)?\s*[:.]/i.test(candidate) &&
        !/\bisin\s*[:.]\s*IN[A-Z0-9]/i.test(candidate) &&
        !/^(registrar|advisor|distributor|opening|closing|statement|weight|allocation|ratio)/i.test(cleaned) &&
        !/(?:market|cost|nav|closing|unit|balance)\s*val/i.test(cleaned)
      ) {
        schemeName = cleaned;
        break;
      }
    }

    if (!schemeName) continue;

    let costValue = 0;
    let marketValue = 0;
    let closingUnits = 0;
    let navValue = 0;
    let avgBuyPrice = 0;
    let xirrValue: string | undefined = undefined;
    let isin = '';
    let schemeCode: number | undefined = undefined;
    let bseCode: string | undefined = undefined;
    let ticker: string | undefined = undefined;

    // 2. Scan block for Units, Cost Value, Market Value, NAV, ISIN, AMFI Code, BSE Code, and Ticker
    for (let k = startIdx; k < endIdx; k++) {
      const line = sortedLines[k];
      if (isPersonalInfo(line)) continue;

      // Stop if hitting a grand total or summary section
      if (/^(grand\s*total|portfolio\s*valuation|sub\s*total\s*[:：])/i.test(line)) break;

      // Extract Cost Value / Invested Amount
      if (
        /(?:total\s*)?(?:cost\s*(?:value|basis|of\s*investment)?|amount\s*invested|invested\s*(?:amount|value|val)?|investment|purchase\s*(?:value|cost|amount)|acquisition\s*cost|book\s*(?:value|cost))/i.test(line)
      ) {
        const val = extractLabeledValue(
          line,
          /(?:total\s*)?(?:cost\s*(?:value|basis|of\s*investment)?|amount\s*invested|invested\s*(?:amount|value|val)?|investment|purchase\s*(?:value|cost|amount)|acquisition\s*cost|book\s*(?:value|cost))\s*[:=]?/i
        );
        if (val > 0) costValue = val;
      }

      // Extract Average Cost / Purchase NAV / Buy Price per unit
      if (/(?:purchase\s*nav|avg\s*(?:nav|cost|price|rate)|average\s*(?:nav|cost|price|rate)|buy\s*(?:price|avg|rate))\s*[:=]?/i.test(line)) {
        const val = extractLabeledValue(
          line,
          /(?:purchase\s*nav|avg\s*(?:nav|cost|price|rate)|average\s*(?:nav|cost|price|rate)|buy\s*(?:price|avg|rate))\s*[:=]?/i
        );
        if (val > 0) avgBuyPrice = val;
      }

      // Extract Market Value / Present Value / Valuation
      if (/(?:market|current|present|latest)\s*(?:value|val)/i.test(line)) {
        const val = extractLabeledValue(line, /(?:market|current|present|latest)\s*(?:value|val)/i);
        if (val > 0) marketValue = val;
      }

      // Extract "Valuation on [Date]: Amount"
      if (/valuation\s*on/i.test(line)) {
        const nums = line.match(/[\d,]+(?:\.\d+)?/g);
        if (nums) {
          const parsed = nums.map(parseCleanNumber).filter((n) => n > 0);
          if (parsed.length > 0 && marketValue === 0) {
            marketValue = parsed[parsed.length - 1];
          }
        }
      }

      // Extract Closing Units (supports "Closing Unit Balance:", "Closing Units",
      // "Total Units:", "Unit Balance:", and KFin "Closing Balance:" formats)
      if (
        /(?:closing|total)\s*(?:unit\s*)?(?:balance|units?)/i.test(line) ||
        /unit\s*balance/i.test(line)
      ) {
        const nums = line.match(/[\d,]+(?:\.\d+)?/g);
        if (nums) {
          const parsed = nums.map(parseCleanNumber).filter((n) => n > 0);
          if (parsed.length > 0) closingUnits = parsed[parsed.length - 1];
        }
      }

      // Extract NAV — supports "NAV: ...", "NAV on <date>: ...", "NAV as on <date>: ...",
      // "NAV as at <date>: ...", "NAV dated <date>: ..." from CAMS / KFintech statements
      if (/^nav\s|nav\s*(?:on|as\s*on|as\s*at|dated|\s*[:.])/i.test(line)) {
        const nums = line.match(/[\d,]+(?:\.\d+)?/g);
        if (nums) {
          const parsed = nums.map(parseCleanNumber).filter((n) => n > 0);
          if (parsed.length > 0) navValue = parsed[parsed.length - 1];
        }
      }

      // Extract ISIN (12-character Indian security identifier, e.g. INF200K01QV8, INE002A01018)
      if (/\bisin\s*[:.]\s*IN[A-Z0-9]{9,11}\b/i.test(line)) {
        const im = line.match(/\bisin\s*[:.]\s*(IN[A-Z0-9]{9,11})\b/i);
        if (im) isin = im[1].toUpperCase();
      }

      // Extract AMFI Scheme Code (5 or 6 digits)
      if (/(?:scheme\s*code|amfi\s*code|amfi\s*scheme\s*code|fund\s*code|amfi\s*id|amfi\s*no)\s*[:=.]?\s*(\d{5,6})\b/i.test(line)) {
        const sm = line.match(/(?:scheme\s*code|amfi\s*code|amfi\s*scheme\s*code|fund\s*code|amfi\s*id|amfi\s*no)\s*[:=.]?\s*(\d{5,6})\b/i);
        if (sm) schemeCode = parseInt(sm[1], 10);
      }

      // Extract BSE Scrip Code (6-digit number, e.g. 500325)
      if (/(?:bse\s*code|bse\s*scrip\s*code|scrip\s*code|security\s*code|bse\s*id)\s*[:=.]?\s*(5\d{5})\b/i.test(line)) {
        const bm = line.match(/(?:bse\s*code|bse\s*scrip\s*code|scrip\s*code|security\s*code|bse\s*id)\s*[:=.]?\s*(5\d{5})\b/i);
        if (bm) bseCode = bm[1];
      }

      // Extract Ticker / Trading Symbol
      if (/(?:ticker|symbol|trading\s*symbol|nse\s*symbol|stock\s*symbol)\s*[:=.]?\s*([A-Z0-9_\-&]{2,14})\b/i.test(line)) {
        const tm = line.match(/(?:ticker|symbol|trading\s*symbol|nse\s*symbol|stock\s*symbol)\s*[:=.]?\s*([A-Z0-9_\-&]{2,14})\b/i);
        if (tm && !/(?:INF|INE)/i.test(tm[1])) ticker = tm[1].toUpperCase();
      }

      // Extract XIRR / IRR / CAGR
      if (/(?:xirr|irr|cagr)\s*[:=]?\s*([-\d\.]+%?)/i.test(line)) {
        const m = line.match(/(?:xirr|irr|cagr)\s*[:=]?\s*([-\d\.]+%?)/i);
        if (m) xirrValue = cleanXirr(m[1]);
      }
    }

    // Infer missing values mathematically
    if (marketValue === 0 && closingUnits > 0 && navValue > 0) {
      marketValue = cleanCurrency(closingUnits * navValue);
    }
    if (costValue === 0 && closingUnits > 0 && avgBuyPrice > 0) {
      costValue = cleanCurrency(closingUnits * avgBuyPrice);
    }
    if (costValue === 0 && marketValue > 0) {
      // Check for transaction rows inside the block to sum purchases
      let txSum = 0;
      for (let txK = startIdx; txK < endIdx; txK++) {
        const txLine = sortedLines[txK];
        if (/\b(purchase|sip|switch\s*in|allotment)\b/i.test(txLine) && !/redemption|switch\s*out/i.test(txLine)) {
          const nums = txLine.match(/[\d,]+(?:\.\d+)?/g);
          if (nums && nums.length >= 2) {
            const parsed = nums.map(parseCleanNumber).filter((n) => n > 10 && n < 10000000);
            if (parsed.length > 0) txSum += parsed[0];
          }
        }
      }
      if (txSum > 0) {
        costValue = cleanCurrency(txSum);
      } else {
        costValue = marketValue;
      }
    }
    if (costValue > 0 && marketValue === 0) {
      marketValue = costValue;
    }

    // Average cost per unit (buy price) from statement cost basis
    let buyPrice: number | undefined;
    if (avgBuyPrice > 0) {
      buyPrice = cleanNavPrice(avgBuyPrice, true);
    } else if (costValue > 0 && closingUnits > 0) {
      buyPrice = cleanNavPrice(costValue / closingUnits, true);
    }

    if (costValue > 0 || marketValue > 0) {
      const detailed = detectDetailedAssetType(schemeName, 'Mutual Fund');
      const isMf = detailed.assetType === 'mutual_fund';
      const resolvedTicker = ticker
        ? (ticker.endsWith('.NS') || ticker.endsWith('.BO') ? ticker : `${ticker}.NS`)
        : bseCode
        ? `${bseCode}.BO`
        : undefined;

      const notesParts = [
        folioNo ? `Folio: ${folioNo}` : '',
        isin ? `ISIN: ${isin}` : '',
        schemeCode ? `AMFI: ${schemeCode}` : '',
        bseCode ? `BSE: ${bseCode}` : '',
        resolvedTicker && !resolvedTicker.endsWith('.BO') ? `Ticker: ${resolvedTicker}` : '',
      ].filter(Boolean);

      // Extract DP Name / Depository Participant from surrounding Demat header
      let blockBroker: string | undefined = undefined;
      for (let backK = startIdx; backK >= Math.max(0, startIdx - 40); backK--) {
        const prevLine = sortedLines[backK];
        if (/(?:dp\s*name|depository\s*participant|broker)\s*[:=.]?\s*([A-Za-z0-9\s.,&-]+)/i.test(prevLine)) {
          const m = prevLine.match(/(?:dp\s*name|depository\s*participant|broker)\s*[:=.]?\s*([A-Za-z0-9\s.,&-]+)/i);
          if (m) {
            const detected = detectBrokerFromFile(undefined, undefined, m[1]);
            blockBroker = detected || m[1].trim();
            break;
          }
        }
      }

      holdings.push({
        id: `cas_${idCounter++}`,
        name: schemeName,
        assetType: detailed.assetType,
        subType: detailed.subType,
        sector: detailed.sector,
        broker: blockBroker || undefined,
        investedAmount: cleanCurrency(costValue),
        currentValue: cleanCurrency(marketValue),
        returns: cleanCurrency(marketValue - costValue),
        units: cleanUnits(closingUnits),
        buyPrice,
        currentPrice: navValue > 0 ? cleanNavPrice(navValue, isMf) : undefined,
        statementPrice: navValue > 0 ? cleanNavPrice(navValue, isMf) : undefined,
        statementValue: cleanCurrency(marketValue),
        folioNo: folioNo || undefined,
        isin: isin || undefined,
        schemeCode,
        bseCode,
        ticker: resolvedTicker,
        xirr: xirrValue,
        notes: notesParts.length > 0 ? notesParts.join(' | ') : undefined,
        selected: true,
        isValid: true,
      });
    }
  }

  // Deduplicate by scheme name
  const seen = new Set<string>();
  return holdings.filter((h) => {
    const key = h.name.toLowerCase().substring(0, 30);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ──────────────────────────────────────────
// Excel / CSV / PDF Raw Grid Extraction
// ──────────────────────────────────────────

export async function extractRawGrid(file: File, password?: string): Promise<RawFileContent> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'pdf') {
    initPdfWorker();
    const buffer = await file.arrayBuffer();
    let pdf: any;

    try {
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        password: password || undefined,
      });
      pdf = await loadingTask.promise;
    } catch (err: any) {
      if (
        err?.name === 'PasswordException' ||
        err?.code === 1 ||
        err?.code === 2 ||
        String(err?.message || '').toLowerCase().includes('password')
      ) {
        throw new PasswordRequiredError(
          err?.code === 2 ? 'Incorrect password for PDF.' : 'PDF is password-protected.',
          err?.code === 2
        );
      }
      throw err;
    }

    const lines: (string | number)[][] = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const items = content.items as any[];

      const rowMap = new Map<number, { text: string; x: number }[]>();
      for (const item of items) {
        const y = Math.round(item.transform[5] / 3) * 3;
        if (!rowMap.has(y)) rowMap.set(y, []);
        rowMap.get(y)!.push({ text: String(item.str || ''), x: item.transform[4] });
      }

      const sortedYs = Array.from(rowMap.keys()).sort((a, b) => b - a);
      for (const y of sortedYs) {
        const cells = rowMap.get(y)!.sort((a, b) => a.x - b.x).map((c) => c.text.trim()).filter(Boolean);
        if (cells.length > 0 && !isCASMetadata(cells.join(' '))) {
          lines.push(cells);
        }
      }
    }

    return { fileName: file.name, sheets: [{ sheetName: 'PDF', rows: lines }] };
  }

  // Word Document (.docx / .doc)
  if (ext === 'docx' || ext === 'doc') {
    const buffer = await file.arrayBuffer();
    let html = '';
    try {
      const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
      html = result.value || '';
    } catch (e) {
      // ignore
    }

    const sheets: { sheetName: string; rows: (string | number)[][] }[] = [];
    const tableMatches = Array.from(html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi));

    if (tableMatches.length > 0) {
      tableMatches.forEach((tableMatch, tIdx) => {
        const tableHtml = tableMatch[1];
        const trMatches = tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
        const rows: (string | number)[][] = [];
        for (const trMatch of trMatches) {
          const cells: string[] = [];
          const tdMatches = trMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
          for (const tdMatch of tdMatches) {
            const cleanCell = tdMatch[1]
              .replace(/<[^>]+>/g, '')
              .replace(/&nbsp;/g, ' ')
              .replace(/&amp;/g, '&')
              .replace(/&#39;/g, "'")
              .replace(/&quot;/g, '"')
              .trim();
            cells.push(cleanCell);
          }
          if (cells.length > 0) rows.push(cells);
        }
        if (rows.length > 0) {
          sheets.push({ sheetName: `Word Table ${tIdx + 1}`, rows });
        }
      });
    }

    if (sheets.length > 0) {
      return { fileName: file.name, sheets };
    }

    // Fallback for paragraph-based tables or lists
    const pMatches = html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    const pRows: (string | number)[][] = [];
    for (const pMatch of pMatches) {
      const text = pMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      if (text) {
        const parts = text.includes('\t') ? text.split('\t') : text.includes(',') ? text.split(',') : [text];
        pRows.push(parts.map((s) => s.trim()));
      }
    }
    return { fileName: file.name, sheets: [{ sheetName: 'Word Document', rows: pRows }] };
  }

  // Excel / CSV / TSV
  const buffer = await file.arrayBuffer();
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array', raw: false });
  } catch (e) {
    const text = new TextDecoder('utf-8').decode(buffer);
    workbook = XLSX.read(text, { type: 'string', raw: false });
  }

  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    let rawRows: any[][] = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) : [];

    rawRows = rawRows.map((row) =>
      row.map((c) => ((c as any) instanceof Date ? '' : c))
    );

    if (rawRows.length > 0 && rawRows[0].length === 1 && typeof rawRows[0][0] === 'string') {
      const firstCell = rawRows[0][0];
      const delim = firstCell.includes(';') ? ';' : firstCell.includes('\t') ? '\t' : firstCell.includes('|') ? '|' : null;
      if (delim) {
        rawRows = rawRows.map((r) => (typeof r[0] === 'string' ? r[0].split(delim) : r));
      }
    }

    return { sheetName: name, rows: rawRows };
  });

  return { fileName: file.name, sheets };
}

// ──────────────────────────────────────────
// Fund & Stock Grid Auto-Extractor (Header & Entity Based)
// ──────────────────────────────────────────

export function autoExtractHoldings(raw: RawFileContent): ParsedHolding[] {
  const holdings: ParsedHolding[] = [];

  for (const sheet of raw.sheets) {
    const matrix = sheet.rows;
    if (!matrix || matrix.length === 0) continue;

    const safeMatrix = matrix.map((row) =>
      row.map((c) => ((c as any) instanceof Date ? '' : c))
    );

    // 1. Detect candidate tables in this sheet
    const detectedTables = detectTablesInSheet(sheet.sheetName, safeMatrix);
    let sheetParsedAny = false;

    for (const table of detectedTables) {
      const mapping = mapHeadersToCanonical(table.headers, table.rawRows.slice(0, 10));
      if (mapping.confidence === 'FAILED' || mapping.securityNameCol === -1) {
        continue;
      }

      sheetParsedAny = true;
      const {
        securityNameCol,
        isinCol,
        schemeCodeCol,
        bseCodeCol,
        symbolCol,
        unitsCol,
        buyPriceCol,
        currentPriceCol,
        investedValueCol,
        currentValueCol,
        pnlCol,
        assetTypeCol,
        subTypeCol,
        sectorCol,
        folioCol,
        brokerCol,
        xirrCol,
      } = mapping;

      for (let r = 0; r < table.rawRows.length; r++) {
        const row = table.rawRows[r];
        if (!row || row.length === 0 || row.length <= securityNameCol) continue;

        const rawName = String(row[securityNameCol] || '').trim();
        if (!rawName) continue;

        // Skip non-holding rows: dates, purely numeric IDs, personal metadata, summary footers
        if (/^\d{2}[-/]\d{2}[-/]\d{2,4}/.test(rawName)) continue;
        if (/^\d+$/.test(rawName)) continue;
        if (isPersonalInfo(rawName)) continue;
        if (/total|sub\s*total|grand\s*total|summary|footer|page\s+\d/i.test(rawName)) continue;
        if (!isValidHoldingName(rawName)) continue;

        const rawSubCat = subTypeCol !== undefined ? String(row[subTypeCol] || '').trim() : undefined;
        const rawType = assetTypeCol !== undefined ? String(row[assetTypeCol] || '').trim() : undefined;
        const rawSector = sectorCol !== undefined ? String(row[sectorCol] || '').trim() : undefined;
        const folioVal = folioCol !== undefined ? String(row[folioCol] || '').trim() : undefined;
        const isinVal = isinCol !== undefined ? String(row[isinCol] || '').trim() : undefined;
        const rawBroker = brokerCol !== undefined ? String(row[brokerCol] || '').trim() : undefined;
        const rawXirr = xirrCol !== undefined ? cleanXirr(row[xirrCol]) : undefined;
        const symbolVal = symbolCol !== undefined ? String(row[symbolCol] || '').trim() : undefined;
        const schemeCodeVal = schemeCodeCol !== undefined ? String(row[schemeCodeCol] || '').trim() : undefined;
        const bseCodeVal = bseCodeCol !== undefined ? String(row[bseCodeCol] || '').trim() : undefined;

        // Extract and clean ISIN
        let rawIsin = isinVal || '';
        if (!rawIsin && folioVal) {
          const isinMatch = folioVal.match(/\b(IN[A-Z0-9]{9,11})\b/i);
          if (isinMatch) rawIsin = isinMatch[1].toUpperCase();
        }
        let rawFolio = folioVal;
        if (rawIsin && rawFolio) {
          rawFolio = rawFolio.replace(/\bIN[A-Z0-9]{9,11}\b/i, '').replace(/[\/\s|,]+/g, ' ').trim() || undefined;
        }
        rawIsin = rawIsin.toUpperCase();

        const isMfIdentity = Boolean(
          (rawIsin && rawIsin.startsWith('INF')) ||
          /\b(fund|funds|scheme|direct\s*growth|direct\s*plan|regular\s*growth|regular\s*plan|flexi\s*cap|mid\s*cap|small\s*cap|large\s*cap|elss|arbitrage|liquid|index\s*fund)\b/i.test(rawName)
        );
        const isStockIdentity = Boolean(rawIsin && rawIsin.startsWith('INE'));

        // Extract AMFI Scheme Code (5 or 6 digits) & BSE Scrip Code (6 digits)
        let rawSchemeCode = schemeCodeVal && /^\d{5,6}$/.test(schemeCodeVal) ? parseInt(schemeCodeVal, 10) : undefined;
        let rawBseCode = bseCodeVal && /^\d{5,6}$/.test(bseCodeVal) ? bseCodeVal : undefined;

        if (!rawSchemeCode && symbolVal && /^\d{5,6}$/.test(symbolVal) && isMfIdentity) {
          rawSchemeCode = parseInt(symbolVal, 10);
        }
        if (!rawBseCode && symbolVal && /^5\d{5}$/.test(symbolVal)) {
          rawBseCode = symbolVal;
        }

        let rawTicker = symbolVal && !/^\d+$/.test(symbolVal) && !symbolVal.startsWith('IN') ? symbolVal.toUpperCase() : undefined;
        if (!rawTicker && rawBseCode) {
          rawTicker = `${rawBseCode}.BO`;
        }

        // Use exact clean scheme / asset name from statement
        const fullName = rawName;

        const units = unitsCol !== undefined ? parseCleanNumber(row[unitsCol]) : undefined;
        let buyPrice = buyPriceCol !== undefined ? parseCleanNumber(row[buyPriceCol]) : undefined;
        let currentPrice = currentPriceCol !== undefined ? parseCleanNumber(row[currentPriceCol]) : undefined;
        let invested = investedValueCol !== undefined ? parseCleanNumber(row[investedValueCol]) : 0;
        let current = currentValueCol !== undefined ? parseCleanNumber(row[currentValueCol]) : 0;

        // P&L percentage vs absolute amount detection
        const pnlHeader = pnlCol !== undefined ? String(table.headers[pnlCol] || '').trim().toLowerCase() : '';
        const rawPnlCell = pnlCol !== undefined ? String(row[pnlCol] || '').trim() : '';
        const pnlRaw = pnlCol !== undefined ? parseCleanNumber(row[pnlCol]) : undefined;
        const pnlIsPercent =
          pnlCol !== undefined &&
          (/%\s*$/.test(rawPnlCell) ||
            (/%|per\s*cent|annual|yld|yield/i.test(pnlHeader) && !/p\s*l|profit|loss|gain|amount|rs|inr|value/i.test(pnlHeader)));

        let pnl: number | undefined = pnlRaw;
        if (pnlIsPercent) {
          pnl = undefined;
        }

        // Derive missing financial numbers only when mathematically verified from row data
        if (invested === 0 && units && buyPrice) invested = units * buyPrice;
        if (current === 0 && units && currentPrice) current = units * currentPrice;

        if (pnlIsPercent && pnlRaw !== undefined) {
          const basis = invested > 0 ? invested : current > 0 ? current : 0;
          if (basis > 0) pnl = cleanCurrency((basis * pnlRaw) / 100);
        }

        let resolvedUnits = units;
        if ((!resolvedUnits || resolvedUnits <= 0) && current > 0 && currentPrice && currentPrice > 0) {
          resolvedUnits = cleanUnits(current / currentPrice);
        } else if ((!resolvedUnits || resolvedUnits <= 0) && invested > 0 && buyPrice && buyPrice > 0) {
          resolvedUnits = cleanUnits(invested / buyPrice);
        }

        if ((!currentPrice || currentPrice <= 0) && resolvedUnits && resolvedUnits > 0 && current > 0) {
          currentPrice = cleanNavPrice(current / resolvedUnits, isMfIdentity);
        }
        if ((!buyPrice || buyPrice <= 0) && resolvedUnits && resolvedUnits > 0 && invested > 0) {
          buyPrice = cleanNavPrice(invested / resolvedUnits, isMfIdentity);
        }

        if (invested > 500000000 || current > 500000000) continue;

        if (invested > 0 || current > 0 || (units !== undefined && units > 0)) {
          const resolved = resolveSecurityIdentity(
            fullName,
            rawIsin,
            rawTicker || symbolVal,
            rawType,
            rawSubCat,
            rawFolio,
            rawSchemeCode,
            rawBseCode
          );

          const finalSchemeCode = rawSchemeCode || resolved.schemeCode;
          const finalBseCode = rawBseCode || resolved.bseCode;
          const finalTicker = rawTicker || resolved.symbol || (finalBseCode ? `${finalBseCode}.BO` : undefined);

          const notesParts = [
            rawFolio ? `Folio: ${rawFolio}` : '',
            rawIsin ? `ISIN: ${rawIsin}` : '',
            finalSchemeCode ? `AMFI: ${finalSchemeCode}` : '',
            finalBseCode ? `BSE: ${finalBseCode}` : '',
            finalTicker && !finalTicker.endsWith('.BO') ? `Ticker: ${finalTicker}` : '',
            rawXirr ? `XIRR: ${rawXirr}` : '',
            table.tableType === 'TRANSACTIONS' ? 'Type: Transaction Statement' : '',
          ].filter(Boolean);

          const finalAssetType = isMfIdentity || finalSchemeCode ? 'mutual_fund' : (isStockIdentity || finalBseCode) ? 'stocks' : resolved.assetType;
          const finalSubType = finalAssetType === 'mutual_fund' ? (resolved.subType || 'Mutual Fund') : finalAssetType === 'stocks' ? (resolved.subType || 'Stock / Equity') : (rawSubCat || rawType || resolved.subType);
          const isMf = finalAssetType === 'mutual_fund';
          const mathReturns = cleanCurrency(current - invested);
          let finalReturns = mathReturns;
          if (pnl !== undefined && !pnlIsPercent) {
            if (invested === 0 || current === 0 || Math.abs(pnl - mathReturns) < 1.0) {
              finalReturns = cleanCurrency(pnl);
            }
          }

          let cleanBroker = rawBroker;
          if (cleanBroker) {
            const detectedFromCell = detectBrokerFromFile(undefined, undefined, cleanBroker);
            if (detectedFromCell) cleanBroker = detectedFromCell;
          }

          const holdingObj: ParsedHolding = {
            id: `tbl_${sheet.sheetName}_${table.headerRowIndex + 1 + r}_${Date.now()}`,
            name: fullName,
            assetType: finalAssetType,
            subType: finalSubType,
            sector: rawSector || undefined,
            amc: resolved.amc,
            broker: cleanBroker || undefined,
            folioNo: rawFolio || undefined,
            isin: rawIsin || resolved.isin || undefined,
            schemeCode: finalSchemeCode,
            bseCode: finalBseCode,
            ticker: finalTicker,
            investedAmount: cleanCurrency(Math.abs(invested)),
            currentValue: cleanCurrency(Math.abs(current)),
            returns: finalReturns,
            units: cleanUnits(resolvedUnits),
            buyPrice: buyPrice && buyPrice > 0 ? cleanNavPrice(buyPrice, isMf) : undefined,
            currentPrice: currentPrice && currentPrice > 0 ? cleanNavPrice(currentPrice, isMf) : undefined,
            statementPrice: currentPrice && currentPrice > 0 ? cleanNavPrice(currentPrice, isMf) : undefined,
            statementValue: cleanCurrency(Math.abs(current)),
            xirr: rawXirr,
            notes: notesParts.length > 0 ? notesParts.join(' | ') : undefined,
            selected: true,
            isValid: true,
            resolutionStatus: (finalSchemeCode ? 'MATCHED_BY_SCHEME_CODE' : (isMfIdentity && rawIsin ? 'MATCHED_BY_ISIN' : resolved.confidence)),
            marketProvider: isMf ? 'AMFI' : finalAssetType === 'stocks' ? 'YAHOO_FINANCE' : 'IMPORTED',
            marketIdentifier: (finalSchemeCode ? String(finalSchemeCode) : (rawIsin || resolved.isin || finalTicker || fullName)),
            reviewReasons: resolved.reviewReasons,
            requiresReview: resolved.confidence === 'REVIEW_REQUIRED' || resolved.confidence === 'UNRESOLVED',
            sourceSheet: sheet.sheetName,
            sourceRowIndex: table.headerRowIndex + 1 + r,
          };

          const validation = validateHoldingRow(holdingObj);
          holdingObj.isValid = validation.isValid;
          if (validation.requiresReview) holdingObj.requiresReview = true;
          if (validation.warnings.length > 0) {
            holdingObj.reviewReasons = [...(holdingObj.reviewReasons || []), ...validation.warnings];
          }

          holdings.push(holdingObj);
        }
      }
    }

    // 2. Fallback for Headerless Statements (e.g. 2-column or 3-column simple lists without header row)
    if (!sheetParsedAny) {
      for (let r = 0; r < safeMatrix.length; r++) {
        const row = safeMatrix[r];
        if (!row || row.length < 2) continue;

        const stringCell = row.find(
          (c: any) => typeof c === 'string' && isValidHoldingName(c) && !isPersonalInfo(c)
        );
        if (!stringCell) continue;

        const nums: number[] = [];
        row.forEach((cell: any) => {
          const n = parseCleanNumber(cell);
          if (n > 0 && n < 500000000) nums.push(n);
        });

        if (nums.length >= 2) {
          const invested = nums[0];
          const current = nums[1];
          const resolved = resolveSecurityIdentity(String(stringCell).trim());

          holdings.push({
            id: `hdrless_${sheet.sheetName}_${r}_${Date.now()}`,
            name: String(stringCell).trim(),
            assetType: resolved.assetType,
            subType: resolved.subType,
            investedAmount: cleanCurrency(invested),
            currentValue: cleanCurrency(current),
            selected: true,
            isValid: true,
            resolutionStatus: 'REVIEW_REQUIRED',
            reviewReasons: ['Statement is missing table headers; values require user confirmation.'],
            requiresReview: true,
            sourceSheet: sheet.sheetName,
            sourceRowIndex: r,
          });
        }
      }
    }
  }

  // Deduplicate by composite key (ISIN preferred, else name + subType + folio)
  const seen = new Set<string>();
  return holdings.filter((h) => {
    const key = h.isin ? `isin_${h.isin}` : `${h.name.toLowerCase()}_${h.subType || ''}_${h.folioNo || ''}`.substring(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ──────────────────────────────────────────
// Universal Entry Point
// ──────────────────────────────────────────

export async function parseInvestmentFile(
  file: File,
  password?: string
): Promise<{
  holdings: ParsedHolding[];
  rawGrid: RawFileContent;
  detectedTable?: DetectedTable;
  columnMapping?: CanonicalColumnMapping;
}> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'pdf') {
    const casHoldings = await parseCASPdf(file, password);
    const rawGrid = await extractRawGrid(file, password);

    if (casHoldings.length > 0) {
      return { holdings: casHoldings, rawGrid };
    }

    const gridHoldings = autoExtractHoldings(rawGrid);
    return { holdings: gridHoldings, rawGrid };
  }

  // Excel / CSV / TSV / DOCX
  const rawGrid = await extractRawGrid(file);
  const holdings = autoExtractHoldings(rawGrid);

  let primaryTable: DetectedTable | undefined;
  let primaryMapping: CanonicalColumnMapping | undefined;

  for (const sheet of rawGrid.sheets) {
    const tables = detectTablesInSheet(sheet.sheetName, sheet.rows);
    const best = selectPrimaryTable(tables);
    if (best) {
      primaryTable = best;
      primaryMapping = mapHeadersToCanonical(best.headers, best.rawRows.slice(0, 5));
      break;
    }
  }

  return { holdings, rawGrid, detectedTable: primaryTable, columnMapping: primaryMapping };
}

// ──────────────────────────────────────────
// Pasted Text Parser
// ──────────────────────────────────────────

export function parsePastedText(text: string): ParsedHolding[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const rows = lines.map((l) => {
    if (l.includes('\t')) return l.split('\t');
    if (l.includes(',')) return l.split(',');
    if (l.includes(';')) return l.split(';');
    return l.split(/\s{2,}/);
  });

  const raw: RawFileContent = {
    fileName: 'Pasted Table',
    sheets: [{ sheetName: 'Pasted', rows }],
  };

  return autoExtractHoldings(raw);
}
