/**
 * Panam Paaru — Deterministic Table Detection & Classification Engine
 *
 * Scans raw spreadsheet / document matrices across all sheets.
 * Identifies financial tables, scores signal density, detects header rows,
 * and distinguishes HOLDINGS tables from TRANSACTION statements.
 * Zero external AI. 100% deterministic and reproducible.
 */

import { mapHeadersToCanonical } from './columnMapper';

export type TableType = 'HOLDINGS' | 'TRANSACTIONS' | 'ACCOUNT_SUMMARY' | 'UNKNOWN';

export interface DetectedTable {
  sheetName: string;
  tableType: TableType;
  headerRowIndex: number;
  dataStartRowIndex: number;
  dataEndRowIndex: number;
  columnCount: number;
  confidenceScore: number; // 0 to 100
  headers: string[];
  rawRows: any[][];
  warnings: string[];
}

// Canonical signals for Holdings statements
const HOLDINGS_SIGNALS = [
  /\b(holding|holdings|portfolio|balance|quantity|qty|units?|shares|volume|net\s*qty)\b/i,
  /\b(price|avg\s*price|buy\s*price|cost\s*price|avg\s*cost|purchase\s*price|rate|buy\s*rate|avg\s*rate)\b/i,
  /\b(ltp|cmp|current\s*price|market\s*price|nav|latest\s*nav|closing\s*price|close\s*price|last\s*price)\b/i,
  /\b(invested|amount\s*invested|invested\s*val\w*|invested\s*amount|cost\s*val\w*|purchase\s*val\w*|total\s*cost|total\s*invested|principal|cost|book\s*cost|amount)\b/i,
  /\b(current\s*val\w*|market\s*val\w*|portfolio\s*val\w*|valuation|present\s*val\w*|cur\s*val\w*|value|market\s*value|current\s*value|total\s*value)\b/i,
  /\b(unrealized|unrealised|profit|loss|p\s*l|pnl|returns?|gain|overall\s*gain|net\s*chg|yield|xirr|cagr)\b/i,
  /\b(isin|symbol|scrip|instrument|scheme|fund|stock|company|asset|security|particulars?|description|item|name|scrip\s*name|scheme\s*name|fund\s*name)\b/i,
  /\b(folio|folio\s*no|folio\s*number|amfi|amfi\s*code|scheme\s*code|bse\s*code)\b/i,
];

// Canonical signals for Transaction statements / tradebooks
const TRANSACTION_SIGNALS = [
  /\b(trade\s*date|trans\w*\s*date|order\s*date|date\s*of\s*trans\w*)\b/i,
  /\b(trans\w*\s*type|order\s*type|buy\s*\/\s*sell|action|b\s*\/\s*s)\b/i,
  /\b(trade\s*price|execution\s*price|executed\s*rate|order\s*price)\b/i,
  /\b(trade\s*no|order\s*no|order\s*id|trans\w*\s*id|ref\s*no)\b/i,
  /\b(brokerage|stt|stamp\s*duty|sebi\s*turnover|gst|net\s*rate)\b/i,
];

// Personal metadata markers that indicate non-table header rows
const METADATA_SIGNALS = [
  /\b(client\s*id|investor\s*name|account\s*holder|pan\s*no|aadhaar|mobile|email|address|dp\s*id)\b/i,
  /\b(statement\s*period|generated\s*on|report\s*date|page\s*\d+\s*of\s*\d+)\b/i,
];

/**
 * Normalizes a raw cell to cleaned lowercase text for header inspection
 */
export function normalizeCellText(val: any): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return '';
  return String(val)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\.\(\)₹\$\[\]\/\\-]/g, ' ')
    .replace(/\b(inr|rs|usd|eur|gbp)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Checks whether a row is purely metadata or personal account information
 */
export function isMetadataRow(row: any[]): boolean {
  if (!row || row.length === 0) return true;
  const nonBlank = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== '');
  if (nonBlank.length <= 1) {
    const text = normalizeCellText(nonBlank[0] || '');
    if (METADATA_SIGNALS.some((rgx) => rgx.test(text))) return true;
  }
  const combined = row.map(normalizeCellText).join(' ');
  let metaMatches = 0;
  for (const rgx of METADATA_SIGNALS) {
    if (rgx.test(combined)) metaMatches++;
  }
  return metaMatches >= 2;
}

/**
 * Evaluates candidate header rows within a worksheet matrix and scores table candidates.
 */
export function detectTablesInSheet(
  sheetName: string,
  matrix: any[][]
): DetectedTable[] {
  if (!matrix || matrix.length < 2) return [];

  const maxScanRows = Math.min(matrix.length, 120);

  // ── PASS 1: Strict Verified Table Detection via Canonical Column Mapping ──
  // Checks every candidate row to see if it maps to a security name AND at least one financial column.
  // This completely eliminates title rows or metadata rows being falsely treated as tables.
  const verifiedTables: DetectedTable[] = [];

  for (let r = 0; r < maxScanRows; r++) {
    const rawRow = matrix[r];
    if (!rawRow || rawRow.length < 2) continue;

    const nonBlankCount = rawRow.filter((c) => c !== null && c !== undefined && String(c).trim() !== '').length;
    if (nonBlankCount < 2) continue;
    if (isMetadataRow(rawRow)) continue;

    const candidateHeaders = rawRow.map((c) => String(c ?? '').trim());
    const sampleRows = matrix.slice(r + 1, r + 8);
    const mapping = mapHeadersToCanonical(candidateHeaders, sampleRows);

    if (mapping.confidence !== 'FAILED' && mapping.securityNameCol !== -1) {
      const hasFinancialCol =
        mapping.unitsCol !== undefined ||
        mapping.currentValueCol !== undefined ||
        mapping.investedValueCol !== undefined ||
        mapping.currentPriceCol !== undefined ||
        mapping.buyPriceCol !== undefined;

      if (hasFinancialCol) {
        // Confirmed real table header row!
        let dataStart = r + 1;
        let dataEnd = dataStart;
        let emptyRowCount = 0;

        for (let dr = dataStart; dr < matrix.length; dr++) {
          const dRow = matrix[dr];
          const hasContent = dRow && dRow.some((c) => c !== null && c !== undefined && String(c).trim() !== '');

          if (!hasContent) {
            emptyRowCount++;
            if (emptyRowCount >= 3) break;
            continue;
          }

          emptyRowCount = 0;

          // Check for summary/footer rows
          const rowStr = dRow.map(normalizeCellText).join(' ');
          if (/\b(total|sub\s*total|grand\s*total|summary|disclaimer|notes|net\s*worth)\b/i.test(rowStr) && dr > dataStart + 1) {
            dataEnd = dr - 1;
            break;
          }

          dataEnd = dr;
        }

        if (dataEnd >= dataStart) {
          verifiedTables.push({
            sheetName,
            tableType: 'HOLDINGS',
            headerRowIndex: r,
            dataStartRowIndex: dataStart,
            dataEndRowIndex: dataEnd,
            columnCount: rawRow.length,
            confidenceScore: mapping.confidenceScore,
            headers: candidateHeaders,
            rawRows: matrix.slice(dataStart, dataEnd + 1),
            warnings: [],
          });

          // Advance r past this table
          r = dataEnd;
        }
      }
    }
  }

  if (verifiedTables.length > 0) {
    return verifiedTables;
  }

  // ── PASS 2: Signal Density Heuristic Fallback ──
  // Runs ONLY if Pass 1 found zero verified tables (e.g. non-standard foreign formats)
  const candidateTables: DetectedTable[] = [];

  for (let r = 0; r < maxScanRows; r++) {
    const rawRow = matrix[r];
    if (!rawRow || rawRow.length < 2) continue;

    const normalizedCells = rawRow.map(normalizeCellText);
    const nonBlankCount = normalizedCells.filter((c) => c.length > 0).length;
    if (nonBlankCount < 2) continue;
    if (isMetadataRow(rawRow)) continue;

    let holdingsScore = 0;
    let txScore = 0;

    for (const cell of normalizedCells) {
      if (!cell) continue;
      for (const rgx of HOLDINGS_SIGNALS) {
        if (rgx.test(cell)) holdingsScore += 15;
      }
      for (const rgx of TRANSACTION_SIGNALS) {
        if (rgx.test(cell)) txScore += 20;
      }
    }

    if (holdingsScore < 20 && txScore < 20) continue;

    const tableType: TableType =
      txScore > holdingsScore ? 'TRANSACTIONS' : holdingsScore >= 20 ? 'HOLDINGS' : 'ACCOUNT_SUMMARY';

    const confidence = Math.min(100, Math.max(holdingsScore, txScore));

    let dataStart = r + 1;
    let dataEnd = dataStart;
    let emptyRowCount = 0;

    for (let dr = dataStart; dr < matrix.length; dr++) {
      const dRow = matrix[dr];
      const hasContent = dRow && dRow.some((c) => c !== null && c !== undefined && String(c).trim() !== '');

      if (!hasContent) {
        emptyRowCount++;
        if (emptyRowCount >= 3) break;
        continue;
      }

      emptyRowCount = 0;

      const rowStr = dRow.map(normalizeCellText).join(' ');
      if (/\b(total|sub\s*total|grand\s*total|summary|disclaimer|notes|net\s*worth)\b/i.test(rowStr) && dr > dataStart + 1) {
        dataEnd = dr - 1;
        break;
      }

      dataEnd = dr;
    }

    if (dataEnd >= dataStart) {
      candidateTables.push({
        sheetName,
        tableType,
        headerRowIndex: r,
        dataStartRowIndex: dataStart,
        dataEndRowIndex: dataEnd,
        columnCount: rawRow.length,
        confidenceScore: confidence,
        headers: rawRow.map((c) => String(c ?? '').trim()),
        rawRows: matrix.slice(dataStart, dataEnd + 1),
        warnings: tableType === 'TRANSACTIONS' ? ['Detected historical transaction statement rather than point-in-time holdings.'] : [],
      });

      r = dataEnd;
    }
  }

  return candidateTables;
}

/**
 * Selects the best financial table candidate across all sheets in a document.
 */
export function selectPrimaryTable(
  allTables: DetectedTable[]
): DetectedTable | null {
  if (allTables.length === 0) return null;

  // Prioritize HOLDINGS tables with highest confidence score, then data row count
  const sorted = [...allTables].sort((a, b) => {
    if (a.tableType === 'HOLDINGS' && b.tableType !== 'HOLDINGS') return -1;
    if (a.tableType !== 'HOLDINGS' && b.tableType === 'HOLDINGS') return 1;

    if (b.confidenceScore !== a.confidenceScore) {
      return b.confidenceScore - a.confidenceScore;
    }

    const aRowCount = a.dataEndRowIndex - a.dataStartRowIndex;
    const bRowCount = b.dataEndRowIndex - b.dataStartRowIndex;
    return bRowCount - aRowCount;
  });

  return sorted[0];
}
