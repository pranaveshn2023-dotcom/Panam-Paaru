/**
 * Panam Paaru — Validation & Reconciliation Engine
 *
 * Enforces financial correctness across imported holding rows:
 * - Distinguishes 3 severity levels: ERROR (blocking), WARNING (actionable limitation), INFO (detail).
 * - Detects impossible/inconsistent numbers (zero units with positive cost, negative values).
 * - Performs deterministic arithmetic checks:
 *     Calculated cost = quantity × avgCost (with configurable tolerance)
 *     Calculated market value = quantity × price (with configurable tolerance)
 *     Unrealized P&L = current value − invested amount
 *     Unrealized return % = (P&L / invested amount) × 100
 * - Detects price drift between statement historical price and live market quotes.
 * - Guards against asset type cross-contamination (e.g. mutual fund with stock ticker).
 * - Identifies duplicates idempotently using ISIN, Scheme Code, or Symbol+Exchange.
 * - Reconciles extracted holdings against statement summary totals where available.
 * - NEVER invents quantities, prices, or NAVs.
 */

import { ParsedHolding, cleanCurrency } from './investmentParser';
import { ResolutionConfidence } from './securityResolver';

export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface ValidationFinding {
  code: string;
  severity: ValidationSeverity;
  field?: string;
  message: string;
}

export interface ArithmeticValidationSummary {
  calculatedCost?: number;
  reportedCost?: number;
  costDiscrepancy?: number;
  calculatedValue?: number;
  reportedValue?: number;
  valueDiscrepancy?: number;
  unrealizedPnl?: number;
  unrealizedReturnPct?: number;
  isCostConsistent: boolean;
  isValueConsistent: boolean;
}

export interface RowValidationResult {
  isValid: boolean;
  requiresReview: boolean;
  status: ResolutionConfidence;
  errors: string[];
  warnings: string[];
  info: string[];
  findings: ValidationFinding[];
  dedupeKey: string;
  arithmeticCheck?: ArithmeticValidationSummary;
}

export interface SummaryReconciliationResult {
  isReconciled: boolean;
  reportedTotalInvested?: number;
  calculatedTotalInvested: number;
  investedDiscrepancy?: number;
  reportedTotalCurrent?: number;
  calculatedTotalCurrent: number;
  currentDiscrepancy?: number;
  holdingsCount: number;
  findings: ValidationFinding[];
}

/**
 * Validates a single holding record prior to preview or import
 */
export function validateHoldingRow(
  holding: ParsedHolding,
  existingKeys?: Set<string>
): RowValidationResult {
  const findings: ValidationFinding[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  const addFinding = (code: string, severity: ValidationSeverity, message: string, field?: string) => {
    findings.push({ code, severity, field, message });
    if (severity === 'ERROR') errors.push(message);
    else if (severity === 'WARNING') warnings.push(message);
    else info.push(message);
  };

  // 1. Mandatory Identity Check
  if (!holding.name || holding.name.trim().length === 0) {
    addFinding('MISSING_NAME', 'ERROR', 'Security name is missing.', 'name');
  }

  // 2. Financial Amount Checks
  const invested = holding.investedAmount ?? 0;
  const current = holding.currentValue ?? 0;
  const units = holding.units;
  const buyPrice = holding.buyPrice;
  const currentPrice = holding.currentPrice;

  if (invested < 0) {
    addFinding('NEGATIVE_INVESTED', 'ERROR', 'Invested amount cannot be negative in a holdings statement.', 'investedAmount');
  }
  if (current < 0) {
    addFinding('NEGATIVE_CURRENT', 'ERROR', 'Current value cannot be negative in a holdings statement.', 'currentValue');
  }
  if (invested === 0 && current === 0 && (!units || units === 0)) {
    addFinding('ZERO_VALUATION', 'ERROR', 'Zero financial value and zero units recorded.', 'investedAmount');
  }

  // 3. Units Integrity Check
  if (units !== undefined) {
    if (units < 0) {
      addFinding('NEGATIVE_UNITS', 'ERROR', 'Units cannot be negative in a holdings statement.', 'units');
    } else if (units === 0 && (invested > 0 || current > 0)) {
      addFinding('ZERO_UNITS_POSITIVE_VALUE', 'WARNING', 'Units are zero while invested/current value is positive.', 'units');
    }
  }

  // 4. Arithmetic Consistency Checks (Quantity × Rate vs Value)
  let arithmeticSummary: ArithmeticValidationSummary | undefined;
  const isCostConsistent = true;
  const isValueConsistent = true;

  if (units && units > 0) {
    let calcCost: number | undefined;
    let costDisc: number | undefined;
    let costOk = true;

    if (buyPrice && buyPrice > 0 && invested > 0) {
      calcCost = cleanCurrency(units * buyPrice);
      costDisc = Math.abs(calcCost - invested);
      // Allow minor rounding tolerance: ₹2.0 or 0.5%
      const tolerance = Math.max(2.0, invested * 0.005);
      if (costDisc > tolerance) {
        costOk = false;
        addFinding(
          'ARITHMETIC_COST_DISCREPANCY',
          'INFO',
          `Calculated cost (units × avg price = ₹${calcCost.toFixed(2)}) differs from reported invested value (₹${invested.toFixed(2)}) by ₹${costDisc.toFixed(2)}.`,
          'investedAmount'
        );
      }
    }

    let calcVal: number | undefined;
    let valDisc: number | undefined;
    let valOk = true;

    if (currentPrice && currentPrice > 0 && current > 0) {
      calcVal = cleanCurrency(units * currentPrice);
      valDisc = Math.abs(calcVal - current);
      const tolerance = Math.max(2.0, current * 0.005);
      if (valDisc > tolerance) {
        valOk = false;
        addFinding(
          'ARITHMETIC_VALUE_DISCREPANCY',
          'INFO',
          `Calculated value (units × current price = ₹${calcVal.toFixed(2)}) differs from reported current value (₹${current.toFixed(2)}) by ₹${valDisc.toFixed(2)}.`,
          'currentValue'
        );
      }
    }

    const unrealizedPnl = cleanCurrency(current - invested);
    const unrealizedReturnPct = invested > 0 ? parseFloat(((unrealizedPnl / invested) * 100).toFixed(2)) : undefined;

    arithmeticSummary = {
      calculatedCost: calcCost,
      reportedCost: invested > 0 ? invested : undefined,
      costDiscrepancy: costDisc,
      calculatedValue: calcVal,
      reportedValue: current > 0 ? current : undefined,
      valueDiscrepancy: valDisc,
      unrealizedPnl,
      unrealizedReturnPct,
      isCostConsistent: costOk,
      isValueConsistent: valOk,
    };
  }

  // 5. Asset Type & Identifier Consistency (Self-healing)
  if (holding.isin && holding.isin.startsWith('INF')) {
    if (holding.assetType !== 'mutual_fund') {
      holding.assetType = 'mutual_fund';
      holding.subType = holding.subType || 'Mutual Fund';
      addFinding('TYPE_NORMALIZED_MF', 'INFO', 'Asset type adjusted to Mutual Fund based on INF ISIN.', 'assetType');
    }
    if (holding.ticker && (holding.ticker.endsWith('.NS') || holding.ticker.endsWith('.BO'))) {
      holding.ticker = undefined; // clear accidental stock ticker on mutual fund
    }
  } else if (holding.isin && holding.isin.startsWith('INE')) {
    if (holding.assetType === 'mutual_fund') {
      holding.assetType = 'stocks';
      holding.subType = 'Stock / Equity';
      addFinding('TYPE_NORMALIZED_STOCK', 'INFO', 'Asset type adjusted to Stock based on INE ISIN.', 'assetType');
    }
  } else if (holding.assetType === 'mutual_fund') {
    if (holding.ticker && (holding.ticker.endsWith('.NS') || holding.ticker.endsWith('.BO'))) {
      holding.ticker = undefined;
    }
    if (holding.isin && !holding.isin.startsWith('INF')) {
      addFinding('NON_INF_MF_ISIN', 'WARNING', `Mutual fund has non-INF ISIN: ${holding.isin}`, 'isin');
    }
  }

  // 6. Duplicate Detection Key (Deterministic)
  let dedupeKey = '';
  if (holding.isin) {
    dedupeKey = `isin_${holding.isin.toUpperCase()}`;
  } else if (holding.schemeCode) {
    dedupeKey = `scheme_${holding.schemeCode}`;
  } else if (holding.ticker) {
    dedupeKey = `ticker_${holding.ticker.toUpperCase()}`;
  } else {
    dedupeKey = `name_${holding.name.toLowerCase().replace(/[^a-z0-9]/g, '')}_${holding.folioNo || ''}`;
  }

  if (existingKeys && existingKeys.has(dedupeKey)) {
    addFinding('DUPLICATE_IDENTIFIER', 'WARNING', 'Potential duplicate holding detected with identical security identifier.', 'dedupeKey');
  }

  // 7. Overall Review Requirement Determination
  const requiresReview = warnings.length > 0 || errors.length > 0 || !holding.isin;
  const status: ResolutionConfidence =
    errors.length > 0
      ? 'UNRESOLVED'
      : holding.isin
      ? 'MATCHED_BY_ISIN'
      : requiresReview
      ? 'REVIEW_REQUIRED'
      : 'EXACT';

  return {
    isValid: errors.length === 0,
    requiresReview,
    status,
    errors,
    warnings,
    info,
    findings,
    dedupeKey,
    arithmeticCheck: arithmeticSummary,
  };
}

/**
 * Validates price drift between statement historical price and live market quote
 */
export function validateMarketPriceDrift(
  holding: ParsedHolding,
  livePrice: number
): { isAcceptable: boolean; reason?: string } {
  if (!livePrice || livePrice <= 0 || isNaN(livePrice)) {
    return { isAcceptable: false, reason: 'Invalid or zero market price.' };
  }

  const baseline = holding.statementPrice || holding.currentPrice;
  if (!baseline || baseline <= 0) {
    return { isAcceptable: true };
  }

  const ratio = livePrice / baseline;
  const maxAllowedRatio = holding.assetType === 'mutual_fund' ? 3.5 : 8.0;
  const minAllowedRatio = holding.assetType === 'mutual_fund' ? 0.25 : 0.1;

  if (ratio > maxAllowedRatio || ratio < minAllowedRatio) {
    return {
      isAcceptable: false,
      reason: `Market price drift anomaly (${ratio.toFixed(2)}x baseline ${baseline}).`,
    };
  }

  return { isAcceptable: true };
}

/**
 * Reconciles the sum of extracted holdings against statement summary totals
 */
export function reconcileStatementSummary(
  holdings: ParsedHolding[],
  reportedTotalInvested?: number,
  reportedTotalCurrent?: number
): SummaryReconciliationResult {
  const calculatedTotalInvested = cleanCurrency(
    holdings.filter((h) => h.isValid && h.selected).reduce((s, h) => s + (h.investedAmount || 0), 0)
  );
  const calculatedTotalCurrent = cleanCurrency(
    holdings.filter((h) => h.isValid && h.selected).reduce((s, h) => s + (h.currentValue || 0), 0)
  );

  const findings: ValidationFinding[] = [];
  let isReconciled = true;

  let investedDiscrepancy: number | undefined;
  if (reportedTotalInvested !== undefined && reportedTotalInvested > 0) {
    investedDiscrepancy = cleanCurrency(Math.abs(calculatedTotalInvested - reportedTotalInvested));
    const tolerance = Math.max(5.0, reportedTotalInvested * 0.002);
    if (investedDiscrepancy > tolerance) {
      isReconciled = false;
      findings.push({
        code: 'INVESTED_RECONCILIATION_DISCREPANCY',
        severity: 'WARNING',
        message: `Total invested sum (₹${calculatedTotalInvested}) differs from statement summary (₹${reportedTotalInvested}) by ₹${investedDiscrepancy}.`,
      });
    }
  }

  let currentDiscrepancy: number | undefined;
  if (reportedTotalCurrent !== undefined && reportedTotalCurrent > 0) {
    currentDiscrepancy = cleanCurrency(Math.abs(calculatedTotalCurrent - reportedTotalCurrent));
    const tolerance = Math.max(5.0, reportedTotalCurrent * 0.002);
    if (currentDiscrepancy > tolerance) {
      isReconciled = false;
      findings.push({
        code: 'CURRENT_RECONCILIATION_DISCREPANCY',
        severity: 'WARNING',
        message: `Total current value sum (₹${calculatedTotalCurrent}) differs from statement summary (₹${reportedTotalCurrent}) by ₹${currentDiscrepancy}.`,
      });
    }
  }

  return {
    isReconciled,
    reportedTotalInvested,
    calculatedTotalInvested,
    investedDiscrepancy,
    reportedTotalCurrent,
    calculatedTotalCurrent,
    currentDiscrepancy,
    holdingsCount: holdings.length,
    findings,
  };
}
