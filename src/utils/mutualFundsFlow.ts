/**
 * Panam Paaru — Backend Flow 2: Mutual Funds Extraction Engine
 *
 * Dedicated processing pipeline for Indian Mutual Funds:
 * - Equity Mutual Funds (Flexi Cap, Large Cap, Mid Cap, Small Cap, Multi Cap, ELSS, Index Funds, etc.)
 * - Hybrid Mutual Funds (Balanced Advantage, Aggressive Hybrid, Multi Asset)
 * - Debt Mutual Funds (Liquid, Overnight, Corporate Bond, Gilt)
 * - Gold / Silver Mutual Funds
 *
 * Supports all official Indian CAS statements (CAMS, KFintech, MF Central, Karvy, AMC statements,
 * NSDL/CDSL CAS mutual fund sections) and broker portals (Zerodha Coin, Groww MF, Kuvera,
 * INDmoney, Paytm Money, etc.).
 *
 * Preserves 4-decimal precision on NAV and Unit balances, extracts authentic AMFI scheme codes
 * and INF ISINs, and extracts ANY values or amounts.
 */

import { ParsedHolding, RawFileContent, cleanCurrency, cleanNavPrice, cleanUnits, cleanXirr, parseCleanNumber, isPersonalInfo, isCASMetadata, isValidHoldingName, cleanSchemeName, isNonHoldingNoise } from './investmentParser';
import { detectDetailedAssetType, detectAmcFromText } from './liveMarketService';
import { extractValidIsin } from './securityResolver';
import { validateHoldingRow } from './importValidator';
import { detectBrokerFromFile } from './brokerDirectory';
import { PdfToken } from './stocksEtfFlow';

const MF_HEADER_PATTERNS = {
  name: /^(scheme|scheme\s*name|fund|fund\s*name|scheme\s*description|particulars?|mutual\s*fund|security\s*name|scheme\s*\/\s*fund|fund\s*description)$/i,
  folio: /^(folio|folio\s*no|folio\s*number|folio\s*no\.|account\s*no|folio\s*id|folio\s*\/\s*account)$/i,
  units: /^(units?|closing\s*units?|unit\s*balance|balance\s*units?|closing\s*balance|units?\s*held|holding\s*units?|quantity|qty|total\s*units)$/i,
  nav: /^(nav|current\s*nav|latest\s*nav|market\s*nav|nav\s*as\s*on\w*|nav\s*date|cmp|ltp|current\s*price|nav\s*price|latest\s*price)$/i,
  buyNav: /^(purchase\s*nav|avg\s*nav|average\s*nav|buy\s*nav|avg\s*cost|average\s*cost|buy\s*price|avg\s*price|cost\s*\/\s*unit)$/i,
  invested: /^(cost|cost\s*val\w*|cost\s*value|invested|invested\s*val\w*|invested\s*amount|total\s*cost|amount\s*invested|purchase\s*val\w*|purchase\s*cost|purchase\s*amount|total\s*investment|inv\s*amt|inv\s*val\w*|book\s*value)$/i,
  currentVal: /^(current\s*val\w*|market\s*val\w*|market\s*value|valuation|present\s*val\w*|present\s*valuation|latest\s*val\w*|cur\s*val\w*|value|total\s*val\w*|total\s*current\s*value)$/i,
  isin: /^(isin|isin\s*code|isin\s*no)$/i,
  schemeCode: /^(scheme\s*code|amfi\s*code|amfi\s*scheme\s*code|fund\s*code|amfi\s*no|amfi\s*id)$/i,
  xirr: /^(xirr|irr|cagr)$/i,
};

// ─────────────────────────────────────────────────────────
// Part A: CAS Entity-Block Mutual Fund Parser (CAMS / KFin / Karvy / AMC)
// ─────────────────────────────────────────────────────────

function extractLabeledValue(line: string, labelRegex: RegExp): number {
  const match = line.match(labelRegex);
  if (!match) return 0;
  const afterLabel = line.substring(match.index! + match[0].length).trim();
  const nums = afterLabel.match(/[\d,]+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return 0;
  for (const n of nums) {
    const parsed = parseCleanNumber(n);
    if (parsed > 0) return parsed;
  }
  return 0;
}

export function parseMutualFundsFromCASLines(
  sortedLines: string[],
  brokerHint?: string
): ParsedHolding[] {
  const holdings: ParsedHolding[] = [];
  const seenKeys = new Set<string>();

  // Locate block start points: "Folio No", "Name of the Scheme", or "ISIN: INF"
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
      const nextLine = sortedLines[i + 1] || '';
      if (/name\s+of\s+the\s+(instrument|security|scheme)|^\s*scheme\s*[:]/i.test(nextLine)) {
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

    // Search forward from startIdx first, then backward to find the Scheme Name and Folio
    const candidates: number[] = [];
    for (let j = startIdx; j < Math.min(endIdx, startIdx + 8); j++) candidates.push(j);
    for (let j = startIdx - 1; j >= Math.max(0, startIdx - 4); j--) candidates.push(j);

    for (const j of candidates) {
      const candidate = sortedLines[j];
      if (isPersonalInfo(candidate)) continue;

      const folioMatch = candidate.match(/\bfolio\s*(no|number)?\s*[:.]\s*([\w\d/ -]+)/i);
      if (folioMatch && !folioNo) {
        folioNo = folioMatch[2].trim();
      }

      const cleaned = cleanSchemeName(candidate);
      if (
        isValidHoldingName(cleaned) &&
        !isNonHoldingNoise(cleaned) &&
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

    for (let k = startIdx; k < endIdx; k++) {
      const line = sortedLines[k];
      if (isPersonalInfo(line)) continue;
      if (/^(grand\s*total|portfolio\s*valuation|sub\s*total\s*[:：])/i.test(line)) break;

      // Extract Cost Value / Invested Amount
      if (/(?:total\s*)?(?:cost\s*(?:value|basis|of\s*investment)?|amount\s*invested|invested\s*(?:amount|value|val)?|investment|purchase\s*(?:value|cost|amount)|acquisition\s*cost|book\s*(?:value|cost))\s*[:=]?/i.test(line)) {
        const val = extractLabeledValue(line, /(?:total\s*)?(?:cost\s*(?:value|basis|of\s*investment)?|amount\s*invested|invested\s*(?:amount|value|val)?|investment|purchase\s*(?:value|cost|amount)|acquisition\s*cost|book\s*(?:value|cost))\s*[:=]?/i);
        if (val > 0) costValue = val;
      }

      // Extract Purchase NAV / Avg Buy Rate
      if (/(?:purchase\s*nav|avg\s*(?:nav|cost|price|rate)|average\s*(?:nav|cost|price|rate)|buy\s*(?:price|avg|rate))\s*[:=]?/i.test(line)) {
        const val = extractLabeledValue(line, /(?:purchase\s*nav|avg\s*(?:nav|cost|price|rate)|average\s*(?:nav|cost|price|rate)|buy\s*(?:price|avg|rate))\s*[:=]?/i);
        if (val > 0) avgBuyPrice = val;
      }

      // Extract Market Value / Present Value / Valuation
      if (/(?:market|current|present|latest)\s*(?:value|val)\b/i.test(line)) {
        const val = extractLabeledValue(line, /(?:market|current|present|latest)\s*(?:value|val)\b\s*[:=]?/i);
        if (val > 0) marketValue = val;
      }

      if (/valuation\b/i.test(line) && marketValue === 0) {
        const valMatch = line.match(/valuation(?:\s+(?:on|as\s*on|as\s*at)\s+\S+)?\s*[:=.]?\s*(?:INR|Rs\.?)?\s*([\d,]+(?:\.\d+)?)/i);
        if (valMatch) {
          const parsed = parseCleanNumber(valMatch[1]);
          if (parsed > 0) marketValue = parsed;
        }
      }

      // Extract Closing Unit Balance
      if (/(?:closing|total|unit)\s*(?:unit\s*)?balance/i.test(line) || /units?\s*held/i.test(line)) {
        const unitMatch =
          line.match(/(?:closing|total|unit)\s*(?:unit\s*)?balance\s*[:=.]?\s*(?:INR|Rs\.?)?\s*([\d,]+(?:\.\d+)?)/i) ||
          line.match(/units?\s*held\s*[:=.]?\s*(?:INR|Rs\.?)?\s*([\d,]+(?:\.\d+)?)/i);
        if (unitMatch) {
          const parsed = parseCleanNumber(unitMatch[1]);
          if (parsed > 0) closingUnits = parsed;
        }
      }

      // Extract NAV (e.g. NAV: 52.3481 or NAV on 31-Mar-2024: 52.3481)
      if (/\bnav\b/i.test(line)) {
        const navMatch = line.match(/\bnav(?:\s+(?:on|as\s*on|as\s*at|dated)\s+\S+)?\s*[:=.]?\s*(?:INR|Rs\.?)?\s*([\d,]+(?:\.\d+)?)/i);
        if (navMatch) {
          const parsed = parseCleanNumber(navMatch[1]);
          if (parsed > 0) navValue = parsed;
        }
      }

      // Extract ISIN (starts with INF for mutual funds)
      if (/\bisin\s*[:.]\s*(INF[A-Z0-9]{9})\b/i.test(line)) {
        const im = line.match(/\bisin\s*[:.]\s*(INF[A-Z0-9]{9})\b/i);
        if (im) isin = im[1].toUpperCase();
      }

      // Extract AMFI Scheme Code (5 or 6 digits)
      if (/(?:scheme\s*code|amfi\s*code|amfi\s*scheme\s*code|fund\s*code|amfi\s*id|amfi\s*no)\s*[:=.]?\s*(\d{5,6})\b/i.test(line)) {
        const sm = line.match(/(?:scheme\s*code|amfi\s*code|amfi\s*scheme\s*code|fund\s*code|amfi\s*id|amfi\s*no)\s*[:=.]?\s*(\d{5,6})\b/i);
        if (sm) schemeCode = parseInt(sm[1], 10);
      }

      // Extract XIRR
      if (/(?:xirr|irr|cagr)\s*[:=]?\s*([-\d.]+%?)/i.test(line)) {
        const xm = line.match(/(?:xirr|irr|cagr)\s*[:=]?\s*([-\d.]+%?)/i);
        if (xm) xirrValue = cleanXirr(xm[1]);
      }
    }

    // Authentic statement derivations directly from file
    if (navValue === 0 && marketValue > 0 && closingUnits > 0) {
      navValue = cleanNavPrice(marketValue / closingUnits, true);
    }
    if (marketValue === 0 && closingUnits > 0 && navValue > 0) {
      marketValue = cleanCurrency(closingUnits * navValue);
    }
    if (avgBuyPrice === 0 && costValue > 0 && closingUnits > 0) {
      avgBuyPrice = cleanNavPrice(costValue / closingUnits, true);
    }
    if (costValue === 0 && closingUnits > 0 && avgBuyPrice > 0) {
      costValue = cleanCurrency(closingUnits * avgBuyPrice);
    }

    let buyPrice: number | undefined;
    if (avgBuyPrice > 0) {
      buyPrice = cleanNavPrice(avgBuyPrice, true);
    } else if (costValue > 0 && closingUnits > 0) {
      buyPrice = cleanNavPrice(costValue / closingUnits, true);
    }

    if (costValue <= 0 && marketValue <= 0 && closingUnits <= 0) continue;

    const effectiveNav = navValue > 0 ? cleanNavPrice(navValue, true) : (marketValue > 0 && closingUnits > 0 ? cleanNavPrice(marketValue / closingUnits, true) : undefined);

    const detailed = detectDetailedAssetType(schemeName, 'Mutual Fund');
    const amc = detectAmcFromText(schemeName)?.name;

    const dedupeKey = isin
      ? `isin_${isin}`
      : schemeCode
      ? `scheme_${schemeCode}`
      : `${schemeName.toLowerCase()}_${folioNo || ''}`;

    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    const notesParts = [
      folioNo ? `Folio: ${folioNo}` : '',
      isin ? `ISIN: ${isin}` : '',
      schemeCode ? `AMFI: ${schemeCode}` : '',
      xirrValue ? `XIRR: ${xirrValue}` : '',
    ].filter(Boolean);

    const holdingObj: ParsedHolding = {
      id: `cas_mf_${bi}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: schemeName,
      assetType: 'mutual_fund',
      subType: detailed.subType || 'Equity Mutual Fund',
      sector: undefined,
      amc: amc || undefined,
      broker: brokerHint || 'CAMS / KFintech',
      folioNo: folioNo || undefined,
      isin: isin || undefined,
      schemeCode: schemeCode || undefined,
      investedAmount: cleanCurrency(Math.max(0, costValue)),
      currentValue: cleanCurrency(Math.max(0, marketValue)),
      returns: cleanCurrency(marketValue - costValue),
      units: cleanUnits(closingUnits),
      buyPrice,
      currentPrice: effectiveNav || buyPrice,
      statementPrice: effectiveNav,
      statementValue: cleanCurrency(Math.max(0, marketValue)),
      xirr: xirrValue,
      notes: notesParts.length > 0 ? notesParts.join(' | ') : undefined,
      selected: true,
      isValid: true,
      resolutionStatus: schemeCode ? 'MATCHED_BY_SCHEME_CODE' : isin ? 'MATCHED_BY_ISIN' : 'EXACT',
      marketProvider: 'AMFI',
      marketIdentifier: schemeCode ? String(schemeCode) : isin || schemeName,
    };

    const val = validateHoldingRow(holdingObj);
    holdingObj.isValid = val.isValid;
    if (val.requiresReview) holdingObj.requiresReview = true;
    if (val.warnings.length > 0) holdingObj.reviewReasons = val.warnings;

    holdings.push(holdingObj);
  }

  return holdings;
}

// ─────────────────────────────────────────────────────────
// Part B: Grid / Spreadsheet / Table Mutual Fund Extractor
// ─────────────────────────────────────────────────────────

export function extractMutualFundsFromGrid(
  rawGrid: RawFileContent,
  options?: { brokerHint?: string }
): ParsedHolding[] {
  const holdings: ParsedHolding[] = [];
  const seenKeys = new Set<string>();

  for (const sheet of rawGrid.sheets) {
    const matrix = sheet.rows;
    if (!matrix || matrix.length < 2) continue;

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

      let nameCol = -1;
      let folioCol = -1;
      let unitsCol = -1;
      let navCol = -1;
      let buyNavCol = -1;
      let invValCol = -1;
      let curValCol = -1;
      let isinCol = -1;
      let schemeCodeCol = -1;
      let xirrCol = -1;

      normCells.forEach((c, idx) => {
        if (!c) return;
        if (MF_HEADER_PATTERNS.name.test(c) && nameCol === -1) nameCol = idx;
        if (MF_HEADER_PATTERNS.folio.test(c) && folioCol === -1) folioCol = idx;
        if (MF_HEADER_PATTERNS.units.test(c) && unitsCol === -1) unitsCol = idx;
        if (MF_HEADER_PATTERNS.nav.test(c) && navCol === -1) navCol = idx;
        if (MF_HEADER_PATTERNS.buyNav.test(c) && buyNavCol === -1) buyNavCol = idx;
        if (MF_HEADER_PATTERNS.invested.test(c) && invValCol === -1) invValCol = idx;
        if (MF_HEADER_PATTERNS.currentVal.test(c) && curValCol === -1) curValCol = idx;
        if (MF_HEADER_PATTERNS.isin.test(c) && isinCol === -1) isinCol = idx;
        if (MF_HEADER_PATTERNS.schemeCode.test(c) && schemeCodeCol === -1) schemeCodeCol = idx;
        if (MF_HEADER_PATTERNS.xirr.test(c) && xirrCol === -1) xirrCol = idx;
      });

      const hasFinancialCol = unitsCol !== -1 || navCol !== -1 || invValCol !== -1 || curValCol !== -1;
      if (nameCol === -1 || !hasFinancialCol) continue;

      let lastDataRow = r;
      // Extract rows
      for (let dr = r + 1; dr < matrix.length; dr++) {
        lastDataRow = dr;
        const dRow = matrix[dr];
        if (!dRow || dRow.length === 0) continue;

        const rawName = String(dRow[nameCol] ?? '').trim();
        if (!rawName) continue;

        if (/^(total|sub\s*total|grand\s*total|summary|disclaimer|net\s*worth|portfolio\s*total)/i.test(rawName)) break;
        if (isPersonalInfo(rawName)) continue;
        if (isNonHoldingNoise(rawName)) continue;
        if (!isValidHoldingName(rawName)) continue;

        const rowText = dRow.map((c) => String(c ?? '')).join(' ');
        const rawIsin = isinCol !== -1 ? String(dRow[isinCol] ?? '').trim().toUpperCase() : '';
        const extractedIsin = extractValidIsin(rawIsin) || extractValidIsin(rowText);

        // Strict mutual fund gate: if row has INE ISIN, it is a Stock/ETF, skip it here!
        if (extractedIsin && extractedIsin.startsWith('INE')) continue;

        // Verify mutual fund characteristics (INF ISIN, fund keywords, AMC, or Folio)
        const isMfIdentity = Boolean(
          (extractedIsin && extractedIsin.startsWith('INF')) ||
          folioCol !== -1 ||
          /\b(fund|funds|scheme|direct\s*growth|direct\s*plan|regular\s*growth|regular\s*plan|flexi\s*cap|mid\s*cap|small\s*cap|large\s*cap|elss|arbitrage|liquid|index\s*fund)\b/i.test(rawName) ||
          detectAmcFromText(rawName)
        );

        if (!isMfIdentity) continue;

        const folioVal = folioCol !== -1 ? String(dRow[folioCol] ?? '').trim() : undefined;
        const schemeCodeVal = schemeCodeCol !== -1 ? parseInt(String(dRow[schemeCodeCol] ?? ''), 10) : undefined;
        const schemeCode = schemeCodeVal && schemeCodeVal > 0 ? schemeCodeVal : undefined;
        const units = unitsCol !== -1 ? parseCleanNumber(dRow[unitsCol]) : undefined;
        let nav = navCol !== -1 ? parseCleanNumber(dRow[navCol]) : undefined;
        let buyNav = buyNavCol !== -1 ? parseCleanNumber(dRow[buyNavCol]) : undefined;
        let invested = invValCol !== -1 ? parseCleanNumber(dRow[invValCol]) : 0;
        let current = curValCol !== -1 ? parseCleanNumber(dRow[curValCol]) : 0;
        const xirr = xirrCol !== -1 ? cleanXirr(dRow[xirrCol]) : undefined;

        // Authentic statement derivations
        if (nav === 0 && current > 0 && units && units > 0) {
          nav = cleanNavPrice(current / units, true);
        }
        if (current === 0 && units && units > 0 && nav && nav > 0) {
          current = cleanCurrency(units * nav);
        }
        if (buyNav === 0 && invested > 0 && units && units > 0) {
          buyNav = cleanNavPrice(invested / units, true);
        }
        if (invested === 0 && units && units > 0 && buyNav && buyNav > 0) {
          invested = cleanCurrency(units * buyNav);
        }

        if (invested <= 0 && current <= 0 && (!units || units <= 0)) continue;

        const effectiveGridNav = nav && nav > 0 ? cleanNavPrice(nav, true) : (current > 0 && units && units > 0 ? cleanNavPrice(current / units, true) : undefined);
        const cleanName = rawName.replace(/\s+/g, ' ').trim();
        const detailed = detectDetailedAssetType(cleanName, 'Mutual Fund');
        const amc = detectAmcFromText(cleanName)?.name;

        const dedupeKey = extractedIsin
          ? `isin_${extractedIsin}`
          : schemeCode
          ? `scheme_${schemeCode}`
          : `${cleanName.toLowerCase()}_${folioVal || ''}`;

        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);

        const notesParts = [
          folioVal ? `Folio: ${folioVal}` : '',
          extractedIsin ? `ISIN: ${extractedIsin}` : '',
          schemeCode ? `AMFI: ${schemeCode}` : '',
          xirr ? `XIRR: ${xirr}` : '',
        ].filter(Boolean);

        const holdingObj: ParsedHolding = {
          id: `mf_${sheet.sheetName}_${dr}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: cleanName,
          assetType: 'mutual_fund',
          subType: detailed.subType || 'Equity Mutual Fund',
          amc: amc || undefined,
          broker: options?.brokerHint || detectBrokerFromFile(rawGrid.fileName, rawGrid) || undefined,
          folioNo: folioVal || undefined,
          isin: extractedIsin || undefined,
          schemeCode: schemeCode || undefined,
          investedAmount: cleanCurrency(Math.max(0, invested)),
          currentValue: cleanCurrency(Math.max(0, current)),
          returns: cleanCurrency(current - invested),
          units: cleanUnits(units),
          buyPrice: buyNav && buyNav > 0 ? cleanNavPrice(buyNav, true) : undefined,
          currentPrice: effectiveGridNav || (buyNav && buyNav > 0 ? cleanNavPrice(buyNav, true) : undefined),
          statementPrice: effectiveGridNav,
          statementValue: cleanCurrency(Math.max(0, current)),
          xirr,
          notes: notesParts.length > 0 ? notesParts.join(' | ') : undefined,
          selected: true,
          isValid: true,
          resolutionStatus: schemeCode ? 'MATCHED_BY_SCHEME_CODE' : extractedIsin ? 'MATCHED_BY_ISIN' : 'EXACT',
          marketProvider: 'AMFI',
          marketIdentifier: schemeCode ? String(schemeCode) : extractedIsin || cleanName,
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
// Part C: Coordinate-Aware PDF Table Extractor for Mutual Funds
// ─────────────────────────────────────────────────────────

export function extractMutualFundsFromPdfItems(
  items: PdfToken[],
  brokerHint?: string
): ParsedHolding[] {
  if (!items || items.length === 0) return [];

  const lineMap = new Map<string, PdfToken[]>();
  for (const it of items) {
    const text = String(it.text || '').trim();
    if (!text) continue;
    const roundedY = Math.round(it.y / 3) * 3;
    const key = `${it.page}_${roundedY}`;
    if (!lineMap.has(key)) lineMap.set(key, []);
    lineMap.get(key)!.push({ ...it, text });
  }

  const sortedLineEntries = Array.from(lineMap.entries()).sort((a, b) => {
    const [pageA, yA] = a[0].split('_').map(Number);
    const [pageB, yB] = b[0].split('_').map(Number);
    if (pageA !== pageB) return pageA - pageB;
    return yB - yA;
  });

  const holdings: ParsedHolding[] = [];
  const seenKeys = new Set<string>();

  for (let li = 0; li < sortedLineEntries.length; li++) {
    const tokens = sortedLineEntries[li][1].sort((a, b) => a.x - b.x);
    const lineText = tokens.map((t) => t.text).join(' ').toLowerCase();

    const isMfHeader =
      /\b(scheme|fund|mutual\s*fund)\b/i.test(lineText) &&
      (/\b(units?|balance|nav)\b/i.test(lineText) || /\b(cost|value|amount)\b/i.test(lineText));

    if (!isMfHeader) continue;

    const colBounds: { name: string; xStart: number; xEnd: number; type: string }[] = [];
    tokens.forEach((tok, idx) => {
      const tLower = tok.text.toLowerCase();
      let cType = 'unknown';
      if (MF_HEADER_PATTERNS.name.test(tLower)) cType = 'name';
      else if (MF_HEADER_PATTERNS.folio.test(tLower)) cType = 'folio';
      else if (MF_HEADER_PATTERNS.units.test(tLower)) cType = 'units';
      else if (MF_HEADER_PATTERNS.nav.test(tLower)) cType = 'nav';
      else if (MF_HEADER_PATTERNS.buyNav.test(tLower)) cType = 'buyNav';
      else if (MF_HEADER_PATTERNS.invested.test(tLower)) cType = 'invested';
      else if (MF_HEADER_PATTERNS.currentVal.test(tLower)) cType = 'currentVal';
      else if (MF_HEADER_PATTERNS.isin.test(tLower)) cType = 'isin';

      const nextTok = tokens[idx + 1];
      const xEnd = nextTok ? (tok.x + nextTok.x) / 2 : tok.x + 300;
      colBounds.push({ name: tok.text, xStart: tok.x - 10, xEnd, type: cType });
    });

    let lastDataIndex = li;

    for (let di = li + 1; di < sortedLineEntries.length; di++) {
      lastDataIndex = di;
      const dataTokens = sortedLineEntries[di][1].sort((a, b) => a.x - b.x);
      const dataLineText = dataTokens.map((t) => t.text).join(' ');

      if (/^(total|sub\s*total|grand\s*total|summary|disclaimer)/i.test(dataLineText)) break;
      if (isPersonalInfo(dataLineText)) continue;

      // Check if this line is another table header
      const isNextHeader =
        /\b(scheme|fund|mutual\s*fund)\b/i.test(dataLineText) &&
        (/\b(units?|balance|nav)\b/i.test(dataLineText) || /\b(cost|value|amount)\b/i.test(dataLineText));

      if (isNextHeader) {
        lastDataIndex = di - 1;
        break;
      }

      const cellsByType: Record<string, string[]> = {};
      dataTokens.forEach((dt) => {
        let matchedCol = colBounds.find((cb) => dt.x >= cb.xStart && dt.x < cb.xEnd);
        if (!matchedCol && colBounds.length > 0) {
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

      const isinText = (cellsByType['isin'] || []).join('');
      const extractedIsin = extractValidIsin(isinText) || extractValidIsin(dataLineText);
      if (extractedIsin && extractedIsin.startsWith('INE')) continue; // Stock

      const folioVal = (cellsByType['folio'] || [])[0];
      const units = parseCleanNumber((cellsByType['units'] || [])[0]);
      let nav = parseCleanNumber((cellsByType['nav'] || [])[0]);
      let buyNav = parseCleanNumber((cellsByType['buyNav'] || [])[0]);
      let invested = parseCleanNumber((cellsByType['invested'] || [])[0]);
      let current = parseCleanNumber((cellsByType['currentVal'] || [])[0]);

      if (invested === 0 && current === 0 && units === 0) {
        const lineNums = dataLineText.match(/[\d,]+(?:\.\d+)?/g);
        if (lineNums && lineNums.length >= 2) {
          const parsed = lineNums.map(parseCleanNumber).filter((n) => n > 0);
          if (parsed.length >= 2) {
            invested = parsed[parsed.length - 2];
            current = parsed[parsed.length - 1];
          }
        }
      }

      if (nav === 0 && current > 0 && units > 0) {
        nav = cleanNavPrice(current / units, true);
      }
      if (invested === 0 && units > 0 && buyNav > 0) invested = cleanCurrency(units * buyNav);
      if (current === 0 && units > 0 && nav > 0) current = cleanCurrency(units * nav);

      if ((!buyNav || buyNav <= 0) && units > 0 && invested > 0) buyNav = cleanNavPrice(invested / units, true);

      if (invested <= 0 && current <= 0 && units <= 0) continue;

      const effectivePdfNav = nav && nav > 0 ? cleanNavPrice(nav, true) : (current > 0 && units > 0 ? cleanNavPrice(current / units, true) : undefined);
      const cleanName = rawName.replace(/\s+/g, ' ').trim();
      const detailed = detectDetailedAssetType(cleanName, 'Mutual Fund');
      const amc = detectAmcFromText(cleanName)?.name;

      const dedupeKey = extractedIsin ? `isin_${extractedIsin}` : `${cleanName.toLowerCase()}_${folioVal || ''}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      const notesParts = [
        folioVal ? `Folio: ${folioVal}` : '',
        extractedIsin ? `ISIN: ${extractedIsin}` : '',
      ].filter(Boolean);

      const holdingObj: ParsedHolding = {
        id: `pdf_mf_${di}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: cleanName,
        assetType: 'mutual_fund',
        subType: detailed.subType || 'Equity Mutual Fund',
        amc: amc || undefined,
        broker: brokerHint || undefined,
        folioNo: folioVal || undefined,
        isin: extractedIsin || undefined,
        investedAmount: cleanCurrency(Math.max(0, invested)),
        currentValue: cleanCurrency(Math.max(0, current)),
        returns: cleanCurrency(current - invested),
        units: cleanUnits(units),
        buyPrice: buyNav && buyNav > 0 ? cleanNavPrice(buyNav, true) : undefined,
        currentPrice: effectivePdfNav || (buyNav && buyNav > 0 ? cleanNavPrice(buyNav, true) : undefined),
        statementPrice: effectivePdfNav,
        statementValue: cleanCurrency(Math.max(0, current)),
        notes: notesParts.length > 0 ? notesParts.join(' | ') : undefined,
        selected: true,
        isValid: true,
        resolutionStatus: extractedIsin ? 'MATCHED_BY_ISIN' : 'EXACT',
        marketProvider: 'AMFI',
        marketIdentifier: extractedIsin || cleanName,
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
