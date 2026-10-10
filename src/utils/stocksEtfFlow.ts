/**
 * Panam Paaru — Backend Flow 1: Stocks & ETFs Extraction Engine
 *
 * Dedicated processing pipeline for Indian & Global Equities, Stocks, and ETFs:
 * - Stocks & Equities (NSE / BSE shares)
 * - ETFs (Gold ETFs, Silver ETFs, Index ETFs, Sector ETFs, Liquid ETFs, etc.)
 * - Sovereign Gold Bonds (SGB), REITs & InvITs
 *
 * Supports all major Indian brokers (Zerodha Kite/Console, Groww Stocks, Angel One,
 * Upstox, ICICI Direct, HDFC Sky/Securities, Kotak Neo/Securities, Dhan, Paytm Money,
 * Motilal Oswal, CDSL / NSDL Demat Holding Statements, and custom Excel/CSV portfolios).
 *
 * Handles ANY quantities (fractional or integer), ANY prices (₹0.01 to ₹1,00,000+),
 * and ANY amounts/values without dropping rows.
 */

import { ParsedHolding, RawFileContent, cleanCurrency, cleanNavPrice, cleanUnits, cleanXirr, parseCleanNumber, isPersonalInfo, isValidHoldingName, isNonHoldingNoise } from './investmentParser';
import { detectStockSector } from './liveMarketService';
import { extractValidIsin, extractCleanStockTicker } from './securityResolver';
import { validateHoldingRow } from './importValidator';
import { detectBrokerFromFile } from './brokerDirectory';

export interface PdfToken {
  text: string;
  x: number;
  y: number;
  page: number;
  width?: number;
}

// ─────────────────────────────────────────────────────────
// Stock & ETF Recognition Patterns
// ─────────────────────────────────────────────────────────

const STOCK_HEADER_PATTERNS = {
  name: /^(symbol|tradingsymbol|trading\s*symbol|scrip|scrip\s*name|scrip\s*description|stock|stock\s*name|stock\s*symbol|company|company\s*name|company\s*\/\s*scrip|security|security\s*name|security\s*description|description\s*of\s*securities|instrument|instrument\s*name|holding\s*name|particulars?|description|item|equity|asset|name)$/i,
  isin: /^(isin|isin\s*code|isin\s*no|isin\s*number|scrip\s*isin)$/i,
  qty: /^(qty|quantity|shares|volume|holding\s*qty|holding\s*quantity|available\s*qty|quantity\s*available|total\s*qty|total\s*quantity|net\s*qty|units|units?\s*held|balance\s*qty|free\s*qty|tradable\s*qty|current\s*balance|free\s*balance|allocated\s*quantity)$/i,
  buyPrice: /^(buy\s*avg|buy\s*price|buy\s*cost|avg\s*cost|avg\s*price|average\s*price|avg\s*buy\s*price|avg\s*buy|average\s*buy|cost\s*price|purchase\s*price|avg\s*rate|buy\s*rate|cost|average\s*cost|purchase\s*cost\s*\/\s*unit|cost\s*\/\s*unit|wtd\s*avg\s*price|avg\s*purchase\s*price)$/i,
  curPrice: /^(ltp|cmp|current\s*price|market\s*price|market\s*rate|current\s*market\s*price|current\s*rate|closing\s*price|close\s*price|last\s*price|last\s*traded\s*price|prev\s*close|previous\s*close|previous\s*closing\s*price|mkt\s*price|mkt\s*rate|rate)$/i,
  invested: /^(invested|invested\s*val\w*|invested\s*amount|total\s*cost|total\s*cost\s*basis|total\s*cost\s*value|cost\s*val\w*|total\s*invested|total\s*investment|investment\s*value|purchase\s*val\w*|purchase\s*cost|purchase\s*amt|buy\s*val\w*|inv\s*amt|inv\s*val\w*|total\s*inv|amount\s*invested|book\s*value|cost\s*of\s*investment|cost)$/i,
  currentVal: /^(cur\s*val\w*|current\s*val\w*|market\s*val\w*|present\s*val\w*|latest\s*val\w*|valuation|current\s*amount|total\s*val\w*|total\s*current\s*value|total\s*valuation|present\s*valuation|mkt\s*val\w*|value|market\s*value|current\s*value|market\s*value\s*inr)$/i,
  pnl: /^(p\s*l|pnl|profit|loss|gain|returns?|unrealized|unrealised|overall\s*gain|net\s*chg|net\s*change|total\s*p\s*l|total\s*gain|unrealized\s*p\s*l)$/i,
  sector: /^(sector|industry|theme)$/i,
};

const ETF_KEYWORDS_REGEX = /\b(etf|bees|\w+bees|exchange\s*traded\s*fund|gold\s*etf|silver\s*etf|nifty\s*bees|junior\s*bees|liquid\s*bees|mon100|cpse\s*etf|bharat\s*22|navi\s*nifty|kotak\s*nv20|uti\s*nifty|hangseng\s*bees|it\s*bees|bank\s*bees|infra\s*bees|psubank\s*bees)\b/i;
const SGB_REGEX = /\b(sovereign\s*gold\s*bond|sgb\s*\d|sgb)\b/i;
const REIT_REGEX = /\b(reit|invit|embassy\s*office|mindspace|brookfield\s*india|powergrid\s*invit|nexus\s*select)\b/i;

/**
 * Categorizes an equity holding into specific SubType (Stock, Gold ETF, Silver ETF, Index ETF, etc.)
 */
export function classifyEquitySubType(name: string, symbol?: string): { subType: string; isEtf: boolean } {
  const combined = `${name} ${symbol || ''}`.toLowerCase();

  if (SGB_REGEX.test(combined)) {
    return { subType: 'Sovereign Gold Bond (SGB)', isEtf: true };
  }
  if (REIT_REGEX.test(combined)) {
    return { subType: 'Real Estate & REITs', isEtf: false };
  }
  if (/gold\s*etf|gold\s*bees|goldbees/i.test(combined)) {
    return { subType: 'Gold ETF', isEtf: true };
  }
  if (/silver\s*etf|silver\s*bees|silverbees/i.test(combined)) {
    return { subType: 'Silver ETF', isEtf: true };
  }
  if (ETF_KEYWORDS_REGEX.test(combined)) {
    return { subType: 'Index ETF', isEtf: true };
  }

  return { subType: 'Stock / Equity', isEtf: false };
}

/**
 * Normalizes trading symbol to exchange format (e.g. TCS.NS or 500325.BO)
 */
export function formatStockTicker(symbol?: string, bseCode?: string): string | undefined {
  if (symbol && !/^\d+$/.test(symbol)) {
    const cleanSym = symbol.toUpperCase().replace(/\s+/g, '');
    if (cleanSym.endsWith('.NS') || cleanSym.endsWith('.BO')) return cleanSym;
    return `${cleanSym}.NS`;
  }
  if (bseCode && /^\d{5,6}$/.test(bseCode)) {
    return `${bseCode}.BO`;
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────
// Part A: Grid / Spreadsheet / Table Stock Extractor
// ─────────────────────────────────────────────────────────

export function extractStocksFromGrid(
  rawGrid: RawFileContent,
  options?: { brokerHint?: string }
): ParsedHolding[] {
  const holdings: ParsedHolding[] = [];
  const seenKeys = new Set<string>();

  for (const sheet of rawGrid.sheets) {
    const matrix = sheet.rows;
    if (!matrix || matrix.length < 2) continue;

    // Scan for stock table header row across first 60 rows
    const maxHeaderScan = Math.min(matrix.length, 60);

    for (let r = 0; r < maxHeaderScan; r++) {
      const row = matrix[r];
      if (!row || row.length < 2) continue;

      const normCells = row.map((c) =>
        String(c ?? '')
          .toLowerCase()
          .replace(/[\r\n\t]+/g, ' ')
          .replace(/[._\-–—/\\()[\]₹$]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      );

      // Check if this row looks like a stock/equity table header
      let nameCol = -1;
      let isinCol = -1;
      let qtyCol = -1;
      let buyPriceCol = -1;
      let curPriceCol = -1;
      let invValCol = -1;
      let curValCol = -1;
      let pnlCol = -1;
      let sectorCol = -1;
      let symbolCol = -1;

      normCells.forEach((c, idx) => {
        if (!c) return;
        if (STOCK_HEADER_PATTERNS.name.test(c) && nameCol === -1) nameCol = idx;
        if (STOCK_HEADER_PATTERNS.isin.test(c) && isinCol === -1) isinCol = idx;
        if (STOCK_HEADER_PATTERNS.qty.test(c) && qtyCol === -1) qtyCol = idx;
        if (STOCK_HEADER_PATTERNS.buyPrice.test(c) && buyPriceCol === -1) buyPriceCol = idx;
        if (STOCK_HEADER_PATTERNS.curPrice.test(c) && curPriceCol === -1) curPriceCol = idx;
        if (STOCK_HEADER_PATTERNS.invested.test(c) && invValCol === -1) invValCol = idx;
        if (STOCK_HEADER_PATTERNS.currentVal.test(c) && curValCol === -1) curValCol = idx;
        if (STOCK_HEADER_PATTERNS.pnl.test(c) && pnlCol === -1) pnlCol = idx;
        if (STOCK_HEADER_PATTERNS.sector.test(c) && sectorCol === -1) sectorCol = idx;
        if (/^(ticker|trading\s*symbol|symbol|nse\s*symbol|bse\s*code|scrip\s*code)$/i.test(c) && symbolCol === -1) symbolCol = idx;
      });

      // Must identify at least security name and at least one financial column (quantity, price, or value)
      const hasFinancialCol = qtyCol !== -1 || buyPriceCol !== -1 || curPriceCol !== -1 || invValCol !== -1 || curValCol !== -1;
      if (nameCol === -1 || !hasFinancialCol) continue;

      let lastDataRow = r;
      // Extract rows following this header
      for (let dr = r + 1; dr < matrix.length; dr++) {
        lastDataRow = dr;
        const dRow = matrix[dr];
        if (!dRow || dRow.length === 0) continue;

        const rawName = String(dRow[nameCol] ?? '').trim();
        if (!rawName) continue;

        // Skip metadata / summary / footer rows
        if (/^(total|sub\s*total|grand\s*total|summary|disclaimer|net\s*worth|portfolio\s*total|page\s+\d)/i.test(rawName)) break;
        if (isPersonalInfo(rawName)) continue;
        if (isNonHoldingNoise(rawName)) continue;
        if (!isValidHoldingName(rawName)) continue;

        // Skip mutual funds explicitly: they belong to Flow 2
        if (/\b(direct\s*growth|regular\s*growth|direct\s*plan|regular\s*plan|mutual\s*fund|amc|folio\s*no)\b/i.test(rawName)) {
          continue;
        }

        const rawIsinCell = isinCol !== -1 ? String(dRow[isinCol] ?? '').trim().toUpperCase() : '';
        const rowTextCombined = dRow.map((c) => String(c ?? '')).join(' ');
        const extractedIsin = extractValidIsin(rawIsinCell) || extractValidIsin(rowTextCombined);

        // If ISIN is present and starts with INF, this is a mutual fund, leave for Flow 2
        if (extractedIsin && extractedIsin.startsWith('INF')) continue;

        const rawSymbol = symbolCol !== -1 ? String(dRow[symbolCol] ?? '').trim().toUpperCase() : undefined;
        const units = qtyCol !== -1 ? parseCleanNumber(dRow[qtyCol]) : undefined;
        let buyPrice = buyPriceCol !== -1 ? parseCleanNumber(dRow[buyPriceCol]) : undefined;
        let curPrice = curPriceCol !== -1 ? parseCleanNumber(dRow[curPriceCol]) : undefined;
        let invested = invValCol !== -1 ? parseCleanNumber(dRow[invValCol]) : 0;
        let current = curValCol !== -1 ? parseCleanNumber(dRow[curValCol]) : 0;
        const pnl = pnlCol !== -1 ? parseCleanNumber(dRow[pnlCol]) : undefined;
        const rawSector = sectorCol !== -1 ? String(dRow[sectorCol] ?? '').trim() : undefined;

        // Mathematical derivation of missing numbers
        if (invested === 0 && units && units > 0 && buyPrice && buyPrice > 0) {
          invested = cleanCurrency(units * buyPrice);
        }
        if (current === 0 && units && units > 0 && curPrice && curPrice > 0) {
          current = cleanCurrency(units * curPrice);
        }
        if (invested === 0 && current > 0) {
          invested = pnl !== undefined ? cleanCurrency(current - pnl) : current;
        }
        if (current === 0 && invested > 0) {
          current = pnl !== undefined ? cleanCurrency(invested + pnl) : invested;
        }

        if ((!buyPrice || buyPrice <= 0) && units && units > 0 && invested > 0) {
          buyPrice = cleanNavPrice(invested / units, false);
        }
        if ((!curPrice || curPrice <= 0) && units && units > 0 && current > 0) {
          curPrice = cleanNavPrice(current / units, false);
        }

        // Verify holding has valid value or positive quantity
        if (invested <= 0 && current <= 0 && (!units || units <= 0)) continue;

        const { subType, isEtf } = classifyEquitySubType(rawName, rawSymbol);
        const resolvedTicker = formatStockTicker(rawSymbol || (extractCleanStockTicker(rawName).length <= 12 ? extractCleanStockTicker(rawName) : undefined));
        const detectedSector = rawSector || detectStockSector(rawName, resolvedTicker);
        const cleanName = rawName.replace(/\s+/g, ' ').trim();

        // Deduplication key
        const dedupeKey = extractedIsin
          ? `isin_${extractedIsin}`
          : resolvedTicker
          ? `ticker_${resolvedTicker}`
          : `name_${cleanName.toLowerCase()}`;

        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);

        const holdingObj: ParsedHolding = {
          id: `stock_${sheet.sheetName}_${dr}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: cleanName,
          assetType: 'stocks',
          subType,
          sector: detectedSector || undefined,
          broker: options?.brokerHint || detectBrokerFromFile(rawGrid.fileName, rawGrid) || undefined,
          isin: extractedIsin || undefined,
          ticker: resolvedTicker,
          investedAmount: cleanCurrency(Math.max(0, invested)),
          currentValue: cleanCurrency(Math.max(0, current)),
          returns: cleanCurrency(current - invested),
          units: cleanUnits(units),
          buyPrice: buyPrice && buyPrice > 0 ? cleanNavPrice(buyPrice, false) : undefined,
          currentPrice: curPrice && curPrice > 0 ? cleanNavPrice(curPrice, false) : undefined,
          statementPrice: curPrice && curPrice > 0 ? cleanNavPrice(curPrice, false) : undefined,
          statementValue: cleanCurrency(Math.max(0, current)),
          selected: true,
          isValid: true,
          resolutionStatus: extractedIsin ? 'MATCHED_BY_ISIN' : resolvedTicker ? 'MATCHED_BY_SYMBOL' : 'EXACT',
          marketProvider: 'YAHOO_FINANCE',
          marketIdentifier: resolvedTicker || extractedIsin || cleanName,
          sourceSheet: sheet.sheetName,
          sourceRowIndex: dr,
        };

        const val = validateHoldingRow(holdingObj);
        holdingObj.isValid = val.isValid;
        if (val.requiresReview) holdingObj.requiresReview = true;
        if (val.warnings.length > 0) holdingObj.reviewReasons = val.warnings;

        holdings.push(holdingObj);
      }

      r = Math.max(r, lastDataRow);
    }
  }

  return holdings;
}

// ─────────────────────────────────────────────────────────
// Part B: Coordinate-Aware PDF Table Extractor for Stocks & ETFs
// ─────────────────────────────────────────────────────────

export function extractStocksFromPdfItems(
  items: PdfToken[],
  brokerHint?: string
): ParsedHolding[] {
  if (!items || items.length === 0) return [];

  // Group items by line: Y coordinate grouped with 3px tolerance
  const lineMap = new Map<string, PdfToken[]>();
  for (const it of items) {
    const text = String(it.text || '').trim();
    if (!text) continue;
    const roundedY = Math.round(it.y / 3) * 3;
    const key = `${it.page}_${roundedY}`;
    if (!lineMap.has(key)) lineMap.set(key, []);
    lineMap.get(key)!.push({ ...it, text });
  }

  // Sort lines top to bottom
  const sortedLineEntries = Array.from(lineMap.entries()).sort((a, b) => {
    const [pageA, yA] = a[0].split('_').map(Number);
    const [pageB, yB] = b[0].split('_').map(Number);
    if (pageA !== pageB) return pageA - pageB;
    return yB - yA; // top down
  });

  const holdings: ParsedHolding[] = [];
  const seenKeys = new Set<string>();

  // Scan lines to locate stock table header
  for (let li = 0; li < sortedLineEntries.length; li++) {
    const tokens = sortedLineEntries[li][1].sort((a, b) => a.x - b.x);
    const lineText = tokens.map((t) => t.text).join(' ').toLowerCase();

    // Look for stock table indicators
    const isStockHeader =
      /\b(symbol|tradingsymbol|instrument|scrip|company|stock)\b/i.test(lineText) &&
      (/\b(qty|quantity|shares)\b/i.test(lineText) || /\b(ltp|cmp|current\s*price|avg\s*price|buy\s*price)\b/i.test(lineText)) &&
      !/\b(folio|folio\s*no|amfi)\b/i.test(lineText);

    if (!isStockHeader) continue;

    // Detect column intervals [xStart, xEnd] from header tokens
    const colBounds: { name: string; xStart: number; xEnd: number; type: string }[] = [];
    tokens.forEach((tok, idx) => {
      const tLower = tok.text.toLowerCase();
      let cType = 'unknown';
      if (STOCK_HEADER_PATTERNS.name.test(tLower)) cType = 'name';
      else if (STOCK_HEADER_PATTERNS.isin.test(tLower)) cType = 'isin';
      else if (STOCK_HEADER_PATTERNS.qty.test(tLower)) cType = 'qty';
      else if (STOCK_HEADER_PATTERNS.buyPrice.test(tLower)) cType = 'buyPrice';
      else if (STOCK_HEADER_PATTERNS.curPrice.test(tLower)) cType = 'curPrice';
      else if (STOCK_HEADER_PATTERNS.invested.test(tLower)) cType = 'invested';
      else if (STOCK_HEADER_PATTERNS.currentVal.test(tLower)) cType = 'currentVal';
      else if (STOCK_HEADER_PATTERNS.pnl.test(tLower)) cType = 'pnl';

      const nextTok = tokens[idx + 1];
      const xEnd = nextTok ? (tok.x + nextTok.x) / 2 : tok.x + 300;
      colBounds.push({ name: tok.text, xStart: tok.x - 10, xEnd, type: cType });
    });

    let lastDataIndex = li;

    // Parse data lines under this header
    for (let di = li + 1; di < sortedLineEntries.length; di++) {
      lastDataIndex = di;
      const dataTokens = sortedLineEntries[di][1].sort((a, b) => a.x - b.x);
      const dataLineText = dataTokens.map((t) => t.text).join(' ');

      if (/^(total|sub\s*total|grand\s*total|summary|disclaimer|portfolio\s*total)/i.test(dataLineText)) break;
      if (isPersonalInfo(dataLineText)) continue;

      // Check if this line is another table header (e.g. repeated header on next page or new table)
      const isNextHeader =
        /\b(symbol|tradingsymbol|instrument|scrip|company|stock)\b/i.test(dataLineText) &&
        (/\b(qty|quantity|shares)\b/i.test(dataLineText) || /\b(ltp|cmp|current\s*price|avg\s*price|buy\s*price)\b/i.test(dataLineText)) &&
        !/\b(folio|folio\s*no|amfi)\b/i.test(dataLineText);

      if (isNextHeader) {
        lastDataIndex = di - 1;
        break;
      }

      // Group tokens into columns based on X coordinate
      const cellsByType: Record<string, string[]> = {};
      dataTokens.forEach((dt) => {
        // Find best column bound
        let matchedCol = colBounds.find((cb) => dt.x >= cb.xStart && dt.x < cb.xEnd);
        if (!matchedCol && colBounds.length > 0) {
          // Fallback to closest column
          matchedCol = colBounds.reduce((prev, curr) =>
            Math.abs(curr.xStart - dt.x) < Math.abs(prev.xStart - dt.x) ? curr : prev
          );
        }
        if (matchedCol) {
          if (!cellsByType[matchedCol.type]) cellsByType[matchedCol.type] = [];
          cellsByType[matchedCol.type].push(dt.text);
        }
      });

      const rawName = (cellsByType['name'] || []).join(' ').trim();
      if (!rawName || isNonHoldingNoise(rawName) || !isValidHoldingName(rawName)) continue;
      if (/\b(direct\s*growth|regular\s*growth|direct\s*plan|mutual\s*fund)\b/i.test(rawName)) continue;

      const isinText = (cellsByType['isin'] || []).join('');
      const extractedIsin = extractValidIsin(isinText) || extractValidIsin(dataLineText);
      if (extractedIsin && extractedIsin.startsWith('INF')) continue; // Skip mutual funds

      const units = parseCleanNumber((cellsByType['qty'] || [])[0]);
      let buyPrice = parseCleanNumber((cellsByType['buyPrice'] || [])[0]);
      let curPrice = parseCleanNumber((cellsByType['curPrice'] || [])[0]);
      let invested = parseCleanNumber((cellsByType['invested'] || [])[0]);
      let current = parseCleanNumber((cellsByType['currentVal'] || [])[0]);

      // If coordinate mapping missed numbers, extract from line regex
      if (invested === 0 && current === 0 && units === 0) {
        const lineNums = dataLineText.match(/[\d,]+(?:\.\d+)?/g);
        if (lineNums && lineNums.length >= 2) {
          const parsed = lineNums.map(parseCleanNumber).filter((n) => n > 0);
          if (parsed.length >= 3) {
            invested = parsed[parsed.length - 2];
            current = parsed[parsed.length - 1];
          }
        }
      }

      if (invested === 0 && units > 0 && buyPrice > 0) invested = cleanCurrency(units * buyPrice);
      if (current === 0 && units > 0 && curPrice > 0) current = cleanCurrency(units * curPrice);
      if (invested === 0 && current > 0) invested = current;
      if (current === 0 && invested > 0) current = invested;

      if ((!buyPrice || buyPrice <= 0) && units > 0 && invested > 0) buyPrice = cleanNavPrice(invested / units, false);
      if ((!curPrice || curPrice <= 0) && units > 0 && current > 0) curPrice = cleanNavPrice(current / units, false);

      if (invested <= 0 && current <= 0 && units <= 0) continue;

      const { subType } = classifyEquitySubType(rawName);
      const cleanName = rawName.replace(/\s+/g, ' ').trim();
      const resolvedTicker = formatStockTicker(extractCleanStockTicker(cleanName));

      const dedupeKey = extractedIsin ? `isin_${extractedIsin}` : resolvedTicker ? `ticker_${resolvedTicker}` : `name_${cleanName.toLowerCase()}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      const holdingObj: ParsedHolding = {
        id: `pdf_stock_${di}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: cleanName,
        assetType: 'stocks',
        subType,
        sector: detectStockSector(cleanName, resolvedTicker) || undefined,
        broker: brokerHint || undefined,
        isin: extractedIsin || undefined,
        ticker: resolvedTicker,
        investedAmount: cleanCurrency(Math.max(0, invested)),
        currentValue: cleanCurrency(Math.max(0, current)),
        returns: cleanCurrency(current - invested),
        units: cleanUnits(units),
        buyPrice: buyPrice && buyPrice > 0 ? cleanNavPrice(buyPrice, false) : undefined,
        currentPrice: curPrice && curPrice > 0 ? cleanNavPrice(curPrice, false) : undefined,
        statementPrice: curPrice && curPrice > 0 ? cleanNavPrice(curPrice, false) : undefined,
        statementValue: cleanCurrency(Math.max(0, current)),
        selected: true,
        isValid: true,
        resolutionStatus: extractedIsin ? 'MATCHED_BY_ISIN' : resolvedTicker ? 'MATCHED_BY_SYMBOL' : 'EXACT',
        marketProvider: 'YAHOO_FINANCE',
        marketIdentifier: resolvedTicker || extractedIsin || cleanName,
      };

      const val = validateHoldingRow(holdingObj);
      holdingObj.isValid = val.isValid;
      if (val.requiresReview) holdingObj.requiresReview = true;
      if (val.warnings.length > 0) holdingObj.reviewReasons = val.warnings;

      holdings.push(holdingObj);
    }

    li = Math.max(li, lastDataIndex);
  }

  return holdings;
}
