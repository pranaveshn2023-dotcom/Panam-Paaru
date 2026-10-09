/**
 * Panam Paaru — Semantic Column Mapper Engine
 *
 * Provides a canonical internal schema, extensive alias dictionaries covering
 * all major Indian brokers & depositories, column type validation,
 * and deterministic confidence scoring.
 *
 * ZERO SILENT GUESSING: If mapping confidence is insufficient, it signals
 * MANUAL_MAPPING_REQUIRED so the user can review and map columns explicitly.
 */

export interface CanonicalColumnMapping {
  securityNameCol: number;
  isinCol?: number;
  symbolCol?: number;
  schemeCodeCol?: number;
  bseCodeCol?: number;
  exchangeCol?: number;
  unitsCol?: number;
  buyPriceCol?: number;
  currentPriceCol?: number;
  investedValueCol?: number;
  currentValueCol?: number;
  pnlCol?: number;
  assetTypeCol?: number;
  subTypeCol?: number;
  sectorCol?: number;
  folioCol?: number;
  brokerCol?: number;
  xirrCol?: number;
  transactionDateCol?: number;
  transactionTypeCol?: number;
  confidence: 'CONFIDENT_AUTO_MAP' | 'REVIEW_REQUIRED' | 'FAILED';
  confidenceScore: number; // 0 to 100
  mappedFieldsCount: number;
  reasons: string[];
}

export interface CanonicalHoldingRecord {
  rawName: string;
  isin?: string;
  symbol?: string;
  schemeCode?: number;
  bseCode?: string;
  exchange?: string;
  units?: number;
  buyPrice?: number;
  currentPrice?: number;
  investedValue: number;
  currentValue: number;
  pnl?: number;
  pnlIsPercent?: boolean;
  assetType?: string;
  subType?: string;
  sector?: string;
  folio?: string;
  broker?: string;
  xirr?: string;
  sourceSheet: string;
  sourceRowIndex: number;
}

// Configurable Alias Dictionary
const ALIASES = {
  securityName: [
    /^(scheme\s*name|fund\s*name|stock\s*name|scrip\s*name|company\s*name|security\s*name|holding\s*name|instrument\s*name|asset\s*name|amc\s*name|trading\s*symbol|tradingsymbol|symbol\s*name|company|ticker|name|scrip|script|holding|holdings|security|scheme|fund|stock|instrument|item|asset)$/i,
    /^(scheme|fund|stock|scrip|instrument|security|particulars?|description|asset|amc|symbol|ticker|tradingsymbol|company|equity|holding|name|item)$/i,
    /\b(scheme\s*name|fund\s*name|stock\s*name|scrip\s*name|company\s*name|security\s*name|holding\s*name|instrument\s*name|scrip|scheme|tradingsymbol|trading\s*symbol|ticker|asset\s*name|security|holding|\bname\b)\b/i,
  ],
  isin: [
    /^\s*isin\s*$/i,
    /\b(isin\s*code|isin\s*no|isin\s*number|\bisin\b)\b/i,
  ],
  schemeCode: [
    /^\s*(scheme\s*code|amfi\s*code|amfi\s*scheme\s*code|fund\s*code|amfi\s*no|amfi\s*id|scheme\s*no)\s*$/i,
    /\b(scheme\s*code|amfi\s*code|amfi\s*scheme\s*code|fund\s*code|amfi\s*no|amfi\s*id)\b/i,
  ],
  bseCode: [
    /^\s*(bse\s*code|bse\s*scrip\s*code|scrip\s*code|bse\s*security\s*code|security\s*code|bse\s*id|bse\s*scrip)\s*$/i,
    /\b(bse\s*code|bse\s*scrip\s*code|scrip\s*code|bse\s*security\s*code|security\s*code)\b/i,
  ],
  symbol: [
    /^\s*(symbol|ticker|trading\s*symbol|tradingsymbol|nse\s*symbol|stock\s*symbol)\s*$/i,
    /\b(symbol|ticker|trading\s*symbol|tradingsymbol|nse\s*symbol|stock\s*symbol)\b/i,
  ],
  units: [
    /^\s*(quantity|qty|units?|shares|volume|balance\s*units?|unit\s*balance|holding\s*qty|available\s*qty|units?\s*held|units?\s*invested|invested\s*units?|total\s*qty|total\s*quantity|net\s*qty)\s*$/i,
    /\b(quantity|qty|units?|shares|volume|balance\s*units?|unit\s*balance|holding\s*qty|available\s*qty|units?\s*held|units?\s*invested|invested\s*units?|total\s*qty|total\s*quantity|net\s*qty)\b/i,
  ],
  buyPrice: [
    /^\s*(buy\s*price|avg\s*price|average\s*price|avg\s*buy\s*price|average\s*buy\s*price|avg\s*cost|average\s*cost|buy\s*avg|cost\s*price|purchase\s*price|purchase\s*nav|avg\s*nav|average\s*nav|buy\s*nav|avg\s*rate|weighted\s*avg|buy\s*rate|avg\s*cost\s*price|avg\s*purchase\s*(?:price|nav|cost))\s*$/i,
    /\b(buy\s*price|avg\s*price|average\s*price|avg\s*buy\s*price|average\s*buy\s*price|avg\s*cost|average\s*cost|buy\s*avg|cost\s*price|purchase\s*price|purchase\s*nav|avg\s*nav|average\s*nav|buy\s*nav|avg\s*rate|weighted\s*avg)\b/i,
  ],
  currentPrice: [
    /^\s*(ltp|cmp|current\s*price|market\s*price|latest\s*nav|current\s*nav|nav|closing\s*price|close\s*price|last\s*price|last\s*traded\s*price|mkt\s*price|prev\s*close|previous\s*close|nav\s*as\s*on\w*|nav\s*date)\s*$/i,
    /\b(ltp|cmp|current\s*price|market\s*price|latest\s*nav|current\s*nav|\bnav\b|closing\s*price|close\s*price|last\s*price|last\s*traded\s*price)\b/i,
  ],
  investedValue: [
    /^\s*(invested\s*val\w*|invested\s*amount|amount\s*invested|total\s*amount\s*invested|total\s*invested|cost\s*val\w*|cost|invested|investment|investment\s*amount|total\s*investment|cost\s*of\s*investment|cost\s*of\s*acquisition|acquisition\s*cost|purchase\s*val\w*|purchase\s*cost|purchase\s*amount|buy\s*val\w*|buy\s*amt|buy\s*amount|inv\s*amt|inv\s*val\w*|inv\s*amount|inv\s*value|principal|book\s*val\w*|book\s*cost|total\s*cost|total\s*cost\s*basis|amount)\s*$/i,
    /\b(invested\s*val\w*|invested\s*amount|amount\s*invested|total\s*amount\s*invested|total\s*invested|cost\s*val\w*|cost|invested|investment|investment\s*amount|total\s*investment|cost\s*of\s*investment|cost\s*of\s*acquisition|acquisition\s*cost|purchase\s*val\w*|purchase\s*cost|purchase\s*amount|buy\s*val\w*|buy\s*amt|buy\s*amount|inv\s*amt|inv\s*val\w*|inv\s*amount|inv\s*value|principal|book\s*val\w*|book\s*cost)\b/i,
  ],
  currentValue: [
    /^\s*(current\s*val\w*|market\s*val\w*|present\s*val\w*|latest\s*val\w*|today\s*val\w*|portfolio\s*val\w*|total\s*val\w*|cur\s*val\w*|mkt\s*val\w*|valuation|current\s*amount|cur\s*amount|current|value|market\s*value|current\s*value|total\s*value)\s*$/i,
    /\b(current\s*val\w*|market\s*val\w*|present\s*val\w*|latest\s*val\w*|today\s*val\w*|portfolio\s*val\w*|total\s*val\w*|cur\s*val\w*|mkt\s*val\w*|valuation|current\s*amount|cur\s*amount|current|value|market\s*value|current\s*value)\b/i,
  ],
  pnl: [
    /^\s*(p\s*l|profit|loss|gain|returns?|unrealized|unrealised|overall\s*gain|returns?\s*[%]|return\s*[%]|net\s*chg|total\s*p\s*l|unrealized\s*p\s*l|unrealised\s*p\s*l)\s*$/i,
    /\b(p\s*l|profit|loss|gain|returns?|unrealized|unrealised|net\s*chg)\b/i,
  ],
  assetType: [
    /^\s*(asset\s*class|asset\s*type|asset\s*category|instrument\s*type|security\s*type|holding\s*type|investment\s*type|category|type|class|segment)\s*$/i,
    /\b(asset\s*class|asset\s*type|asset\s*category|instrument\s*type|security\s*type|holding\s*type|investment\s*type|category|type|class|segment)\b/i,
  ],
  subType: [
    /^\s*(sub\s*category|sub\s*cat|subcategory|cap\s*type|scheme\s*type)\s*$/i,
    /\b(sub\s*category|sub\s*cat|subcategory|cap\s*type|scheme\s*type)\b/i,
  ],
  sector: [
    /^\s*(sector|industry|theme)\s*$/i,
    /\b(sector|industry|theme)\b/i,
  ],
  folio: [
    /^\s*(folio|folio\s*no|folio\s*number|dp\s*id|demat|account\s*no)\s*$/i,
    /\b(folio|folio\s*no|folio\s*number|dp\s*id|demat)\b/i,
  ],
  broker: [
    /^\s*(broker|platform|depository|source|dp\s*name|broker\s*name|dp\s*id|trading\s*account|participant|depository\s*participant)\s*$/i,
    /\b(broker|platform|depository|source|dp\s*name|broker\s*name|trading\s*account|participant)\b/i,
  ],
  xirr: [
    /^\s*(xirr|irr|cagr|annualized\s*returns?|annualised\s*returns?|annualized|annualised)\s*$/i,
    /\b(xirr|irr|cagr|annualized\s*returns?|annualised\s*returns?|annualized|annualised)\b/i,
  ],
};

function cleanHeaderCell(c: any): string {
  if (c === null || c === undefined) return '';
  return String(c)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\.\(\)₹\$\[\]\/\\&\-]/g, ' ')
    .replace(/\b(inr|rs|usd|eur|gbp)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Maps raw header text to canonical columns using exact aliases first, then fuzzy patterns.
 */
export function mapHeadersToCanonical(
  headers: string[],
  sampleRows?: any[][]
): CanonicalColumnMapping {
  const normalized = headers.map(cleanHeaderCell);
  const usedCols = new Set<number>();

  let nameCol = -1;
  let isinCol: number | undefined;
  let schemeCodeCol: number | undefined;
  let bseCodeCol: number | undefined;
  let symbolCol: number | undefined;
  let unitsCol: number | undefined;
  let buyPriceCol: number | undefined;
  let currentPriceCol: number | undefined;
  let invValCol: number | undefined;
  let curValCol: number | undefined;
  let pnlCol: number | undefined;
  let assetTypeCol: number | undefined;
  let subTypeCol: number | undefined;
  let sectorCol: number | undefined;
  let folioCol: number | undefined;
  let brokerCol: number | undefined;
  let xirrCol: number | undefined;

  const reasons: string[] = [];

  // Match exact ISIN column first to avoid folio/isin collision
  normalized.forEach((cell, idx) => {
    if (ALIASES.isin[0].test(cell) || ALIASES.isin[1].test(cell)) {
      isinCol = idx;
      usedCols.add(idx);
    }
  });

  // Match AMFI Scheme Code for mutual funds
  normalized.forEach((cell, idx) => {
    if (usedCols.has(idx)) return;
    if (ALIASES.schemeCode[0].test(cell) || ALIASES.schemeCode[1].test(cell)) {
      schemeCodeCol = idx;
      usedCols.add(idx);
    }
  });

  // Match BSE Scrip Code for stocks
  normalized.forEach((cell, idx) => {
    if (usedCols.has(idx)) return;
    if (ALIASES.bseCode[0].test(cell) || ALIASES.bseCode[1].test(cell)) {
      bseCodeCol = idx;
      usedCols.add(idx);
    }
  });

  // Match Trading Symbol / Ticker (NSE / BSE symbol)
  normalized.forEach((cell, idx) => {
    if (usedCols.has(idx)) return;
    if (ALIASES.symbol[0].test(cell) || ALIASES.symbol[1].test(cell)) {
      symbolCol = idx;
      usedCols.add(idx);
    }
  });

  // Match Units / Quantity (supports 'Units Invested', 'Quantity', 'Balance Units')
  normalized.forEach((cell, idx) => {
    if (usedCols.has(idx)) return;
    if ((ALIASES.units[0].test(cell) || ALIASES.units[1].test(cell)) && !/price|val|cost|amount/i.test(cell)) {
      unitsCol = idx;
      usedCols.add(idx);
    }
  });

  // Match Current Price / NAV / LTP
  normalized.forEach((cell, idx) => {
    if (usedCols.has(idx)) return;
    if (ALIASES.currentPrice[0].test(cell) && !/total|val/i.test(cell)) {
      currentPriceCol = idx;
      usedCols.add(idx);
    }
  });

  // Match Buy Price / Avg Price
  normalized.forEach((cell, idx) => {
    if (usedCols.has(idx)) return;
    if (ALIASES.buyPrice[0].test(cell)) {
      buyPriceCol = idx;
      usedCols.add(idx);
    }
  });

  // Match Invested Value / Cost (excludes 'units invested')
  normalized.forEach((cell, idx) => {
    if (usedCols.has(idx)) return;
    if (
      (ALIASES.investedValue[0].test(cell) || ALIASES.investedValue[1].test(cell)) &&
      !/price|nav|avg|per\s*unit|units?\s*invested|invested\s*units?/i.test(cell)
    ) {
      invValCol = idx;
      usedCols.add(idx);
    }
  });

  // Match Current Value / Market Value
  normalized.forEach((cell, idx) => {
    if (usedCols.has(idx)) return;
    if (ALIASES.currentValue[0].test(cell) && !/price|nav|cost|invest|buy|purchase/i.test(cell)) {
      curValCol = idx;
      usedCols.add(idx);
    }
  });

  // Match P&L / Returns
  normalized.forEach((cell, idx) => {
    if (usedCols.has(idx)) return;
    if (ALIASES.pnl[0].test(cell) || ALIASES.pnl[1].test(cell)) {
      pnlCol = idx;
      usedCols.add(idx);
    }
  });

  // Match XIRR
  normalized.forEach((cell, idx) => {
    if (usedCols.has(idx)) return;
    if (ALIASES.xirr[0].test(cell)) {
      xirrCol = idx;
      usedCols.add(idx);
    }
  });

  // Match Folio
  normalized.forEach((cell, idx) => {
    if (usedCols.has(idx)) return;
    if (ALIASES.folio[0].test(cell)) {
      folioCol = idx;
      usedCols.add(idx);
    }
  });

  // Match Broker / DP Name / Depository
  normalized.forEach((cell, idx) => {
    if (usedCols.has(idx)) return;
    if (ALIASES.broker[0].test(cell) || ALIASES.broker[1].test(cell)) {
      brokerCol = idx;
      usedCols.add(idx);
    }
  });

  // Match Asset Type & SubType
  normalized.forEach((cell, idx) => {
    if (usedCols.has(idx)) return;
    if (ALIASES.subType[0].test(cell)) {
      subTypeCol = idx;
      usedCols.add(idx);
    } else if (ALIASES.assetType[0].test(cell)) {
      assetTypeCol = idx;
      usedCols.add(idx);
    } else if (ALIASES.sector[0].test(cell)) {
      sectorCol = idx;
      usedCols.add(idx);
    }
  });

  // Match Security Name: exact match first, then pattern match among unused columns
  const exactNameIdx = normalized.findIndex((c, idx) => !usedCols.has(idx) && ALIASES.securityName[0].test(c));
  if (exactNameIdx !== -1) {
    nameCol = exactNameIdx;
    usedCols.add(nameCol);
  } else {
    const patternNameIdx = normalized.findIndex((c, idx) => {
      if (usedCols.has(idx)) return false;
      if (/client|investor|nominee|account|user|pan|aadhaar|mobile|phone|email|address|date|status|sl\s*no|s\s*no/i.test(c)) {
        return false;
      }
      return ALIASES.securityName[1].test(c) || ALIASES.securityName[2].test(c);
    });
    if (patternNameIdx !== -1) {
      nameCol = patternNameIdx;
      usedCols.add(nameCol);
    }
  }

  // Sample Row Data-Driven Heuristic: Disambiguate or fill missing columns from cell contents
  if (sampleRows && sampleRows.length > 0) {
    const numCols = headers.length;

    // 1. If ISIN not identified yet, check if any column contains Indian ISIN format
    if (isinCol === undefined) {
      for (let c = 0; c < numCols; c++) {
        if (usedCols.has(c)) continue;
        const isinMatchCount = sampleRows.filter((r) => {
          const val = String(r?.[c] || '').trim();
          return /^IN[A-Z0-9]{10}$/i.test(val);
        }).length;
        if (isinMatchCount >= 1) {
          isinCol = c;
          usedCols.add(c);
          break;
        }
      }
    }

    // 2. If Security Name not identified yet, find column with valid textual scheme/stock names
    if (nameCol === -1) {
      let bestNameCol = -1;
      let maxTextScore = 0;
      for (let c = 0; c < numCols; c++) {
        if (usedCols.has(c)) continue;
        let textScore = 0;
        for (const row of sampleRows) {
          const val = String(row?.[c] || '').trim();
          if (val.length >= 3 && /[a-zA-Z]{2,}/.test(val) && !/^\d{2}[-/]\d{2}[-/]\d{2,4}$/.test(val) && !/^[A-Z]{5}\d{4}[A-Z]$/.test(val)) {
            textScore++;
          }
        }
        if (textScore > maxTextScore && textScore >= Math.min(2, sampleRows.length)) {
          maxTextScore = textScore;
          bestNameCol = c;
        }
      }
      if (bestNameCol !== -1) {
        nameCol = bestNameCol;
        usedCols.add(nameCol);
      }
    }

    // 3. If no value columns identified yet, inspect numeric columns
    if (invValCol === undefined && curValCol === undefined && unitsCol === undefined) {
      const numericCols: { col: number; avgVal: number }[] = [];
      for (let c = 0; c < numCols; c++) {
        if (usedCols.has(c)) continue;
        const nums = sampleRows
          .map((r) => parseFloat(String(r?.[c] || '').replace(/[₹$,\s]/g, '')))
          .filter((n) => !isNaN(n) && n > 0);
        if (nums.length >= Math.min(2, sampleRows.length)) {
          const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
          numericCols.push({ col: c, avgVal: avg });
        }
      }
      numericCols.sort((a, b) => a.avgVal - b.avgVal);
      if (numericCols.length === 1) {
        curValCol = numericCols[0].col;
        usedCols.add(curValCol);
      } else if (numericCols.length === 2) {
        unitsCol = numericCols[0].col;
        curValCol = numericCols[1].col;
        usedCols.add(unitsCol);
        usedCols.add(curValCol);
      } else if (numericCols.length >= 3) {
        unitsCol = numericCols[0].col;
        invValCol = numericCols[1].col;
        curValCol = numericCols[2].col;
        usedCols.add(unitsCol);
        usedCols.add(invValCol);
        usedCols.add(curValCol);
      }
    }
  }

  // Fallback: If no distinct security name column was found but a symbol column exists, use symbol as name
  if (nameCol === -1 && symbolCol !== undefined) {
    nameCol = symbolCol;
    usedCols.add(nameCol);
  }

  // Scoring mapping confidence
  let confidenceScore = 0;
  if (nameCol !== -1) confidenceScore += 40;
  if (unitsCol !== undefined) confidenceScore += 15;
  if (curValCol !== undefined) confidenceScore += 15;
  if (invValCol !== undefined) confidenceScore += 15;
  if (currentPriceCol !== undefined) confidenceScore += 10;
  if (buyPriceCol !== undefined) confidenceScore += 5;
  if (isinCol !== undefined) confidenceScore += 10;
  if (schemeCodeCol !== undefined) confidenceScore += 10;
  if (bseCodeCol !== undefined) confidenceScore += 10;
  if (symbolCol !== undefined) confidenceScore += 5;

  // Essential fields requirement: Must have Security Name AND at least one financial value column
  const hasFinancialCol =
    invValCol !== undefined ||
    curValCol !== undefined ||
    unitsCol !== undefined ||
    currentPriceCol !== undefined ||
    buyPriceCol !== undefined;

  let confidence: 'CONFIDENT_AUTO_MAP' | 'REVIEW_REQUIRED' | 'FAILED' = 'FAILED';

  if (nameCol !== -1 && hasFinancialCol) {
    if (confidenceScore >= 50) {
      confidence = 'CONFIDENT_AUTO_MAP';
    } else {
      confidence = 'REVIEW_REQUIRED';
    }
  } else {
    confidence = 'FAILED';
    reasons.push(
      nameCol === -1
        ? 'Could not confidently identify Security Name column.'
        : 'Could not identify any holding value (Units, Invested, or Current Value) column.'
    );
  }

  const mappedFieldsCount = [
    nameCol,
    isinCol,
    schemeCodeCol,
    bseCodeCol,
    symbolCol,
    unitsCol,
    buyPriceCol,
    currentPriceCol,
    invValCol,
    curValCol,
    pnlCol,
    assetTypeCol,
    subTypeCol,
    sectorCol,
    folioCol,
    brokerCol,
    xirrCol,
  ].filter((c) => c !== undefined && c !== -1).length;

  return {
    securityNameCol: nameCol,
    isinCol,
    schemeCodeCol,
    bseCodeCol,
    symbolCol,
    unitsCol,
    buyPriceCol,
    currentPriceCol,
    investedValueCol: invValCol,
    currentValueCol: curValCol,
    pnlCol,
    assetTypeCol,
    subTypeCol,
    sectorCol,
    folioCol,
    brokerCol,
    xirrCol,
    confidence,
    confidenceScore: Math.min(100, confidenceScore),
    mappedFieldsCount,
    reasons,
  };
}
