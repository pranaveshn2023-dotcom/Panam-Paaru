/**
 * Panam Paaru — Validation & Reconciliation Engine
 *
 * Enforces financial correctness across imported holding rows:
 * - Detects impossible/inconsistent numbers (zero units with positive cost, negative values)
 * - Detects price drift between statement and live market quotes
 * - Guards against asset type cross-contamination (e.g. mutual fund with stock ticker)
 * - Identifies duplicates idempotently using ISIN, Scheme Code, or Symbol+Exchange
 * - NEVER invents quantities or prices.
 */

import { ParsedHolding } from './investmentParser';
import { ResolutionConfidence } from './securityResolver';

export interface RowValidationResult {
  isValid: boolean;
  requiresReview: boolean;
  status: ResolutionConfidence;
  errors: string[];
  warnings: string[];
  dedupeKey: string;
}

/**
 * Validates a single holding record prior to preview or import
 */
export function validateHoldingRow(
  holding: ParsedHolding,
  existingKeys?: Set<string>
): RowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Mandatory Identity Check
  if (!holding.name || holding.name.trim().length === 0) {
    errors.push('Security name is missing.');
  }

  // 2. Financial Amount Checks
  const invested = holding.investedAmount ?? 0;
  const current = holding.currentValue ?? 0;
  const units = holding.units;

  if (invested < 0) {
    errors.push('Invested amount cannot be negative in a holdings statement.');
  }
  if (current < 0) {
    errors.push('Current value cannot be negative in a holdings statement.');
  }
  if (invested === 0 && current === 0 && (!units || units === 0)) {
    errors.push('Zero financial value and zero units recorded.');
  }

  // 3. Units Integrity Check
  if (units !== undefined) {
    if (units < 0) {
      errors.push('Units cannot be negative in a holdings statement.');
    } else if (units === 0 && (invested > 0 || current > 0)) {
      warnings.push('Units are zero while invested/current value is positive.');
    }
  }

  // 4. Asset Type & Identifier Consistency
  if (holding.assetType === 'mutual_fund') {
    if (holding.ticker && (holding.ticker.endsWith('.NS') || holding.ticker.endsWith('.BO'))) {
      errors.push(`Stock exchange ticker (${holding.ticker}) assigned to mutual fund.`);
    }
    if (holding.isin && !holding.isin.startsWith('INF')) {
      warnings.push(`Mutual fund has non-INF ISIN: ${holding.isin}`);
    }
  } else if (holding.assetType === 'stocks') {
    if (holding.isin && holding.isin.startsWith('INF')) {
      errors.push(`Mutual fund ISIN (${holding.isin}) assigned to stock.`);
    }
  }

  // 5. Duplicate Detection Key (Deterministic)
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
    warnings.push('Potential duplicate holding detected with identical security identifier.');
  }

  // 6. Overall Review Requirement Determination
  const requiresReview = warnings.length > 0 || errors.length > 0 || !holding.isin;
  const status: ResolutionConfidence =
    errors.length > 0
      ? 'UNRESOLVED'
      : holding.isin
      ? 'MATCHED_BY_ISIN'
      : requiresReview
      ? 'REVIEW_REQUIRED'
      : 'HIGH_CONFIDENCE';

  return {
    isValid: errors.length === 0,
    requiresReview,
    status,
    errors,
    warnings,
    dedupeKey,
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
  const maxAllowedRatio = holding.assetType === 'mutual_fund' ? 2.5 : 5.0;
  const minAllowedRatio = holding.assetType === 'mutual_fund' ? 0.4 : 0.15;

  if (ratio > maxAllowedRatio || ratio < minAllowedRatio) {
    return {
      isAcceptable: false,
      reason: `Market price drift anomaly (${ratio.toFixed(2)}x baseline ${baseline}).`,
    };
  }

  return { isAcceptable: true };
}
