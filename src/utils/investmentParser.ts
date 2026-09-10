import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { AssetType } from '../types';
import { detectDetailedAssetType, detectStockSector } from './liveMarketService';

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
  investedAmount: number;
  currentValue: number;
  returns?: number;
  units?: number;
  buyPrice?: number;
  currentPrice?: number;
  sipAmount?: number;
  sipDay?: number;
  notes?: string;
  broker?: string;
  folioNo?: string;
  isin?: string;
  xirr?: string;
  selected: boolean;
  isValid: boolean;
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
  // Round to 4 decimal places to remove JS IEEE 754 float artifacts (e.g. 0.001000000000000009 -> 0.001)
  const rounded = Math.round(units * 10000) / 10000;
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
    .replace(/^(name\s+of\s+(the\s+)?scheme|scheme\s*name|scheme|scrip\s*name|instrument|particulars?)\s*[:：]\s*/i, '')
    .replace(/\bfolio\s*(no|number)?\s*[:.]\s*[\w\d/ -]+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const LABEL_TOKENS = [
  'market value', 'current value', 'present value', 'latest value',
  'total market value', 'cost value', 'total cost value',
  'valuation on', 'closing unit balance', 'unit balance', 'balance units',
  'closing balance', 'nav',
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

  // Identify all entity block start indices (Folio lines, "Name of the Scheme:", or recognized fund names)
  const blockIndices: number[] = [];
  for (let i = 0; i < sortedLines.length; i++) {
    const line = sortedLines[i];
    if (isPersonalInfo(line)) continue;

    if (
      /\bfolio\s*(no|number)?\s*[:.]/i.test(line) ||
      /^name\s+of\s+the\s+scheme\s*[:.]/i.test(line) ||
      /\bisin\s*[:.]\s*INF/i.test(line)
    ) {
      blockIndices.push(i);
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
    let xirrValue: string | undefined = undefined;

    // 2. Scan block for Units, Cost Value, Market Value, and NAV
    for (let k = startIdx; k < endIdx; k++) {
      const line = sortedLines[k];
      if (isPersonalInfo(line)) continue;

      // Stop if hitting a grand total or summary section
      if (/^(grand\s*total|portfolio\s*valuation|sub\s*total\s*[:：])/i.test(line)) break;

      // Extract Cost Value
      if (/(?:total\s*)?cost\s*(?:value)?/i.test(line)) {
        const val = extractLabeledValue(line, /(?:total\s*)?cost\s*(?:value)?/i);
        if (val > 0) costValue = val;
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

      // Extract Closing Units
      if (/(?:closing|balance)\s*(?:unit\s*)?(?:balance|units)?/i.test(line) || /unit\s*balance/i.test(line)) {
        const nums = line.match(/[\d,]+(?:\.\d+)?/g);
        if (nums) {
          const parsed = nums.map(parseCleanNumber).filter((n) => n > 0);
          if (parsed.length > 0) closingUnits = parsed[parsed.length - 1];
        }
      }

      // Extract NAV
      if (/^nav\s|nav\s*on|nav\s*[:(]/i.test(line)) {
        const nums = line.match(/[\d,]+(?:\.\d+)?/g);
        if (nums) {
          const parsed = nums.map(parseCleanNumber).filter((n) => n > 0);
          if (parsed.length > 0) navValue = parsed[parsed.length - 1];
        }
      }

      // Extract XIRR / IRR / CAGR
      if (/(?:xirr|irr|cagr)\s*[:=]?\s*([-\d\.]+%?)/i.test(line)) {
        const m = line.match(/(?:xirr|irr|cagr)\s*[:=]?\s*([-\d\.]+%?)/i);
        if (m) xirrValue = cleanXirr(m[1]);
      }
    }

    // Infer missing values if possible
    if (marketValue === 0 && closingUnits > 0 && navValue > 0) {
      marketValue = closingUnits * navValue;
    }
    if (marketValue > 0 && costValue === 0) {
      costValue = marketValue;
    }
    if (costValue > 0 && marketValue === 0) {
      marketValue = costValue;
    }

    if (costValue > 0 || marketValue > 0) {
      const detailed = detectDetailedAssetType(schemeName);
      holdings.push({
        id: `cas_${idCounter++}`,
        name: schemeName,
        assetType: detailed.assetType,
        subType: detailed.subType,
        sector: detailed.sector,
        investedAmount: cleanCurrency(costValue),
        currentValue: cleanCurrency(marketValue),
        units: cleanUnits(closingUnits),
        currentPrice: navValue > 0 ? cleanCurrency(navValue) : undefined,
        folioNo: folioNo || undefined,
        xirr: xirrValue,
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

    let headerIdx = -1;
    let nameCol = -1;
    let invCol = -1;
    let curCol = -1;
    let qtyCol = -1;
    let buyPriceCol = -1;
    let curPriceCol = -1;
    let pnlCol = -1;
    let typeCol = -1;
    let subCatCol = -1;
    let sectorCol = -1;
    let folioCol = -1;
    let brokerCol = -1;
    let xirrCol = -1;

    // Scan up to 60 rows for the true table header (supports sheets with leading metadata)
    for (let r = 0; r < Math.min(safeMatrix.length, 60); r++) {
      const rawRow = safeMatrix[r];
      // Normalize cell text: remove symbols, punctuation, collapse spaces
      const row = rawRow.map((c) =>
        String(c || '')
          .toLowerCase()
          .replace(/[\.\(\)₹\$\[\]\/\\-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      );

      let tempInv = -1;
      let tempCur = -1;
      let tempQty = -1;
      let tempBuy = -1;
      let tempCurP = -1;
      let tempPnl = -1;
      let tempType = -1;
      let tempSubCat = -1;
      let tempSector = -1;
      let tempFolio = -1;
      let tempBroker = -1;
      let tempXirr = -1;
      let tempName = -1;

      row.forEach((colName, cIdx) => {
        if (!colName) return;

        // Skip metadata / personal info headers
        if (/client|investor|nominee|account\s*holder|user\s*name|pan|aadhaar|mobile|phone|email|address/i.test(colName)) {
          return;
        }

        // 1. Quantity / Units
        if (tempQty === -1 && /\b(qty|quantity|units?|shares|volume|balance\s*units?|unit\s*balance|holding\s*qty|available\s*qty|avail\w*\s*qty)\b/i.test(colName) && !/price|val|cost|amount/i.test(colName)) {
          tempQty = cIdx;
        }

        // 2. Buy Price / Avg Price
        else if (tempBuy === -1 && /\b(buy\s*price|avg\s*price|average\s*price|avg\s*cost|average\s*cost|buy\s*avg|cost\s*price|purchase\s*price|purchase\s*nav|avg\s*rate)\b/i.test(colName)) {
          tempBuy = cIdx;
        }

        // 3. Current Price / LTP / CMP / NAV
        else if (tempCurP === -1 && /\b(ltp|cmp|current\s*price|market\s*price|latest\s*nav|current\s*nav|\bnav\b|closing\s*price|last\s*traded\s*price)\b/i.test(colName) && !/total|val/i.test(colName)) {
          tempCurP = cIdx;
        }

        // 4. Current Value / Market Value (supports 'Current Valu', 'Cur. Value', 'Mkt Value', etc.)
        else if (
          tempCur === -1 &&
          /\b(current\s*val\w*|market\s*val\w*|present\s*val\w*|latest\s*val\w*|today\s*val\w*|portfolio\s*val\w*|total\s*val\w*|cur\s*val\w*|mkt\s*val\w*|valuation|current\s*amount|cur\s*amount|current|value)\b/i.test(colName) &&
          !/price|nav|cost|invest|buy|purchase|face|book/i.test(colName)
        ) {
          tempCur = cIdx;
        }

        // 5. Invested Amount / Cost Basis (supports 'Invested Valu', 'Cost (Rs.)', 'Buy Value', 'Inv Amt', etc.)
        else if (
          tempInv === -1 &&
          /\b(invested\s*val\w*|invested\s*amount|invest\w*\s*val\w*|cost\s*val\w*|cost|invested|investment|purchase\s*val\w*|purchase\s*cost|buy\s*val\w*|buy\s*amt|buy\s*amount|inv\s*amt|inv\s*val\w*|inv\s*amount|inv\s*value|principal|book\s*val\w*|book\s*cost)\b/i.test(colName) &&
          !/price|nav|avg|per\s*unit/i.test(colName)
        ) {
          tempInv = cIdx;
        }

        // 6. P&L / Returns
        else if (tempPnl === -1 && /\b(p\s*l|profit|loss|gain|returns?|unrealized|unrealised)\b/i.test(colName)) {
          tempPnl = cIdx;
        }

        // 7. Sub-category (e.g. Mid Cap, Large Cap, Liquid, Dynamic Asset Allocation)
        else if (tempSubCat === -1 && /\b(sub\s*category|sub\s*cat|subcategory)\b/i.test(colName)) {
          tempSubCat = cIdx;
        }

        // 8. Asset Class / Category / Type
        else if (tempType === -1 && /\b(asset\s*class|asset\s*type|asset\s*category|instrument\s*type|security\s*type|holding\s*type|investment\s*type|category|type|class|segment)\b/i.test(colName)) {
          tempType = cIdx;
        }

        // 9. Sector / Industry
        else if (tempSector === -1 && /\b(sector|industry|theme)\b/i.test(colName) && !/fund|scheme/i.test(colName)) {
          tempSector = cIdx;
        }

        // 10. Folio / ISIN
        else if (tempFolio === -1 && /\b(folio|isin|dp\s*id|demat|scrip\s*code)\b/i.test(colName)) {
          tempFolio = cIdx;
        }

        // 11. Broker / Platform / Source
        else if (tempBroker === -1 && /\b(broker|platform|depository|source)\b/i.test(colName)) {
          tempBroker = cIdx;
        }

        // 12. XIRR / IRR / CAGR
        else if (tempXirr === -1 && /\b(xirr|irr|cagr|annualized\s*returns?|annualised\s*returns?|annualized|annualised)\b/i.test(colName)) {
          tempXirr = cIdx;
        }
      });

      // Find the holding / stock / scheme / AMC name column
      const specificNameIdx = row.findIndex((c) =>
        /^(scheme\s*name|fund\s*name|stock\s*name|scrip\s*name|company\s*name|instrument|symbol|security\s*name|holding\s*name|scrip|particulars?|instrument\s*name|asset\s*name|amc|amc\s*name)$/i.test(c)
      );

      if (specificNameIdx !== -1) {
        tempName = specificNameIdx;
      } else {
        tempName = row.findIndex((c, idx) => {
          if (
            idx === tempInv ||
            idx === tempCur ||
            idx === tempQty ||
            idx === tempBuy ||
            idx === tempCurP ||
            idx === tempPnl ||
            idx === tempType ||
            idx === tempSubCat ||
            idx === tempSector ||
            idx === tempFolio ||
            idx === tempBroker ||
            idx === tempXirr
          ) {
            return false;
          }
          if (/client|investor|nominee|account|user|pan|aadhaar|mobile|phone|email|address|date|status|sl\s*no|s\s*no|sr\s*no|returns|xirr/i.test(c)) {
            return false;
          }
          return /scheme|fund|stock|scrip|company|symbol|security|holding|particular|instrument|description|name|amc/i.test(c);
        });
      }

      const hasValue = tempInv !== -1 || tempCur !== -1 || tempQty !== -1 || tempCurP !== -1 || tempBuy !== -1 || tempPnl !== -1;
      if (tempName !== -1 && hasValue) {
        headerIdx = r;
        nameCol = tempName;
        invCol = tempInv;
        curCol = tempCur;
        qtyCol = tempQty;
        buyPriceCol = tempBuy;
        curPriceCol = tempCurP;
        pnlCol = tempPnl;
        typeCol = tempType;
        subCatCol = tempSubCat;
        sectorCol = tempSector;
        folioCol = tempFolio;
        brokerCol = tempBroker;
        xirrCol = tempXirr;
        break;
      }
    }

    if (headerIdx !== -1 && nameCol !== -1) {
      for (let r = headerIdx + 1; r < safeMatrix.length; r++) {
        const row = safeMatrix[r];
        if (!row || row.length === 0) continue;
        if (row.length <= nameCol) continue;

        const rawName = String(row[nameCol] || '').trim();
        if (!rawName) continue;

        // Skip date rows, personal info, and summary/footer rows
        if (/^\d{2}[-/]\d{2}[-/]\d{2,4}/.test(rawName)) continue;
        if (/^\d+$/.test(rawName)) continue;
        if (isPersonalInfo(rawName)) continue;
        if (/total|sub\s*total|grand\s*total|summary|footer|page\s+\d/i.test(rawName)) continue;
        if (!isValidHoldingName(rawName)) continue;

        const rawSubCat = subCatCol !== -1 ? String(row[subCatCol] || '').trim() : undefined;
        const rawType = typeCol !== -1 ? String(row[typeCol] || '').trim() : undefined;
        const rawSector = sectorCol !== -1 ? String(row[sectorCol] || '').trim() : undefined;
        const rawFolio = folioCol !== -1 ? String(row[folioCol] || '').trim() : undefined;
        const rawBroker = brokerCol !== -1 ? String(row[brokerCol] || '').trim() : undefined;
        const rawXirr = xirrCol !== -1 ? cleanXirr(row[xirrCol]) : undefined;

        // Build composite holding name if AMC + Sub-category exist (e.g. "HDFC Mutual Fund - Mid Cap")
        let fullName = rawName;
        if (rawSubCat && !fullName.toLowerCase().includes(rawSubCat.toLowerCase())) {
          fullName = `${rawName} - ${rawSubCat}`;
        }

        let units = qtyCol !== -1 ? parseCleanNumber(row[qtyCol]) : undefined;
        let buyPrice = buyPriceCol !== -1 ? parseCleanNumber(row[buyPriceCol]) : undefined;
        let currentPrice = curPriceCol !== -1 ? parseCleanNumber(row[curPriceCol]) : undefined;
        let invested = invCol !== -1 ? parseCleanNumber(row[invCol]) : 0;
        let current = curCol !== -1 ? parseCleanNumber(row[curCol]) : 0;
        let pnl = pnlCol !== -1 ? parseCleanNumber(row[pnlCol]) : undefined;

        // Derive missing financial numbers from existing row data if needed
        if (invested === 0 && units && buyPrice) invested = units * buyPrice;
        if (current === 0 && units && currentPrice) current = units * currentPrice;
        if (current === 0 && invested > 0 && pnl !== undefined) current = invested + pnl;
        if (invested === 0 && current > 0 && pnl !== undefined) invested = current - pnl;

        // Only fallback to current if NO invested amount column and NO buy price column existed in the file
        if (invested === 0 && current > 0 && invCol === -1 && buyPriceCol === -1) invested = current;
        if (current === 0 && invested > 0 && curCol === -1 && curPriceCol === -1) current = invested;

        if (invested > 500000000 || current > 500000000) continue;

        if (invested > 0 || current > 0) {
          const detailed = detectDetailedAssetType(fullName, rawType || rawSubCat, rawSector);
          const notesParts = [
            rawFolio ? `Folio: ${rawFolio}` : '',
            rawXirr ? `XIRR: ${rawXirr}` : '',
          ].filter(Boolean);

          holdings.push({
            id: `auto_${sheet.sheetName}_${r}_${Date.now()}`,
            name: fullName,
            assetType: detailed.assetType,
            subType: rawSubCat || rawType || detailed.subType,
            sector: rawSector || detailed.sector || undefined,
            broker: rawBroker || undefined,
            folioNo: rawFolio || undefined,
            investedAmount: cleanCurrency(Math.abs(invested)),
            currentValue: cleanCurrency(Math.abs(current)),
            returns: pnl !== undefined ? cleanCurrency(pnl) : cleanCurrency(current - invested),
            units: cleanUnits(units),
            buyPrice: buyPrice && buyPrice > 0 ? cleanCurrency(buyPrice) : undefined,
            currentPrice: currentPrice && currentPrice > 0 ? cleanCurrency(currentPrice) : undefined,
            xirr: rawXirr,
            notes: notesParts.length > 0 ? notesParts.join(' | ') : undefined,
            selected: true,
            isValid: true,
          });
        }
      }
    } else {
      // Positional Scan fallback
      const TX_MARKERS = /^(purchase|redemption|switch|sip|dividend|stp|swp|systematic|allotment|bonus|split|merger|transaction|nav|price|amount|balance|units)$/i;
      for (let r = 0; r < safeMatrix.length; r++) {
        const row = safeMatrix[r];
        if (!row || row.length < 2) continue;

        const stringCell = row.find(
          (c: any) => typeof c === 'string' && isValidHoldingName(c) && !TX_MARKERS.test(c) && !isPersonalInfo(c)
        );
        if (!stringCell) continue;

        const numCells = row.map(parseCleanNumber).filter((n: number) => n > 100 && n < 500000000);
        if (numCells.length >= 1) {
          const invested = numCells[0];
          const current = numCells.length >= 2 ? numCells[1] : invested;
          const detailed = detectDetailedAssetType(String(stringCell));

          holdings.push({
            id: `pos_${sheet.sheetName}_${r}_${Date.now()}`,
            name: String(stringCell).trim(),
            assetType: detailed.assetType,
            subType: detailed.subType,
            sector: undefined,
            investedAmount: cleanCurrency(Math.abs(invested)),
            currentValue: cleanCurrency(Math.abs(current)),
            selected: true,
            isValid: true,
          });
        }
      }
    }
  }

  // Deduplicate by composite key so different schemes under the same AMC are both preserved
  const seen = new Set<string>();
  return holdings.filter((h) => {
    const key = `${h.name.toLowerCase()}_${h.subType || ''}_${h.folioNo || ''}`.substring(0, 60);
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

  // Excel / CSV / TSV
  const rawGrid = await extractRawGrid(file);
  const holdings = autoExtractHoldings(rawGrid);
  return { holdings, rawGrid };
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
