/**
 * Panam Paaru — Deterministic Table Detection & Classification Engine
 *
 * Scans raw spreadsheet / document matrices across all sheets.
 * Identifies financial tables, scores signal density, detects header rows,
 * and distinguishes HOLDINGS tables from TRANSACTION statements.
 * Zero external AI. 100% deterministic and reproducible.
 */

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
  /\b(holding|portfolio|balance|quantity|qty|units?|shares)\b/i,
  /\b(avg\s*price|buy\s*price|cost\s*price|avg\s*cost|purchase\s*price)\b/i,
  /\b(ltp|cmp|current\s*price|market\s*price|nav|latest\s*nav)\b/i,
  /\b(invested\s*val\w*|invested\s*amount|cost\s*value|purchase\s*value|total\s*cost)\b/i,
  /\b(current\s*val\w*|market\s*val\w*|portfolio\s*val\w*|valuation|present\s*val\w*)\b/i,
  /\b(unrealized|unrealised|profit|loss|p\s*l|returns?)\b/i,
  /\b(isin|symbol|scrip|instrument|scheme\s*name)\b/i,
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

  const candidateTables: DetectedTable[] = [];
  const maxScanRows = Math.min(matrix.length, 120);

  for (let r = 0; r < maxScanRows; r++) {
    const rawRow = matrix[r];
    if (!rawRow || rawRow.length < 2) continue;

    // Check if this row looks like a header row
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

    // Must have minimum financial signal density to be a table header
    if (holdingsScore < 30 && txScore < 30) continue;

    const tableType: TableType =
      txScore > holdingsScore ? 'TRANSACTIONS' : holdingsScore >= 30 ? 'HOLDINGS' : 'ACCOUNT_SUMMARY';

    const confidence = Math.min(100, Math.max(holdingsScore, txScore));

    // Find table end row (look for contiguous data rows)
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

      // Advance search index past this table to avoid duplicate sub-matches
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
