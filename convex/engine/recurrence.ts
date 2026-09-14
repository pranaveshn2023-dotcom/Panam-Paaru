/**
 * Calendar-Aware Recurring Budget Engine
 * 
 * Provides deterministic, leap-year and month-end safe period calculations.
 * Ensures zero drift across months with variable day counts (28, 29, 30, 31).
 */

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'one_time';

export interface BudgetPeriod {
  startDate: string; // ISO string YYYY-MM-DD
  endDate: string;   // ISO string YYYY-MM-DD
  nextOccurrenceDate: string; // ISO string YYYY-MM-DD
  periodIndex: number;
}

/**
 * Checks if a given year is a leap year
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Returns the maximum number of days in a specific year and month (0-indexed month)
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Helper to clamp day number to max valid day of target month
 */
export function clampDay(year: number, month: number, targetDay: number): number {
  const maxDays = getDaysInMonth(year, month);
  return Math.min(targetDay, maxDays);
}

/**
 * Formats a Date object to YYYY-MM-DD
 */
export function formatISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses YYYY-MM-DD string into a local Date object at start of day (00:00:00)
 */
export function parseISODate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * Calculates the active budget cycle containing targetDate
 */
export function getActiveBudgetPeriod(
  anchorStartDateStr: string,
  recurrence: RecurrenceFrequency,
  targetDate: Date = new Date()
): BudgetPeriod {
  const anchorDate = parseISODate(anchorStartDateStr.slice(0, 10));
  const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);

  // If target is before anchor, period is the initial period
  if (target < anchorDate) {
    const nextStart = getNextPeriodStartDate(anchorDate, anchorDate.getDate(), recurrence, 1);
    const end = new Date(nextStart.getTime() - 86400000); // 1 day before next start
    return {
      startDate: formatISODate(anchorDate),
      endDate: formatISODate(end),
      nextOccurrenceDate: formatISODate(nextStart),
      periodIndex: 0,
    };
  }

  const anchorDay = anchorDate.getDate();

  switch (recurrence) {
    case 'daily': {
      const diffMs = target.getTime() - anchorDate.getTime();
      const days = Math.floor(diffMs / 86400000);
      const currentStart = new Date(anchorDate.getTime() + days * 86400000);
      const nextStart = new Date(currentStart.getTime() + 86400000);
      return {
        startDate: formatISODate(currentStart),
        endDate: formatISODate(currentStart),
        nextOccurrenceDate: formatISODate(nextStart),
        periodIndex: days,
      };
    }

    case 'weekly': {
      const diffMs = target.getTime() - anchorDate.getTime();
      const weeks = Math.floor(diffMs / (7 * 86400000));
      const currentStart = new Date(anchorDate.getTime() + weeks * 7 * 86400000);
      const nextStart = new Date(currentStart.getTime() + 7 * 86400000);
      const currentEnd = new Date(nextStart.getTime() - 86400000);
      return {
        startDate: formatISODate(currentStart),
        endDate: formatISODate(currentEnd),
        nextOccurrenceDate: formatISODate(nextStart),
        periodIndex: weeks,
      };
    }

    case 'monthly': {
      let candidateMonthOffset =
        (target.getFullYear() - anchorDate.getFullYear()) * 12 +
        (target.getMonth() - anchorDate.getMonth());

      let currentStart = computeMonthlyDate(anchorDate.getFullYear(), anchorDate.getMonth(), candidateMonthOffset, anchorDay);

      // If target is before this month's anchor boundary, step back 1 month
      if (target < currentStart) {
        candidateMonthOffset--;
        currentStart = computeMonthlyDate(anchorDate.getFullYear(), anchorDate.getMonth(), candidateMonthOffset, anchorDay);
      }

      const nextStart = computeMonthlyDate(anchorDate.getFullYear(), anchorDate.getMonth(), candidateMonthOffset + 1, anchorDay);
      const currentEnd = new Date(nextStart.getTime() - 86400000);

      return {
        startDate: formatISODate(currentStart),
        endDate: formatISODate(currentEnd),
        nextOccurrenceDate: formatISODate(nextStart),
        periodIndex: Math.max(0, candidateMonthOffset),
      };
    }

    case 'quarterly': {
      const totalMonths =
        (target.getFullYear() - anchorDate.getFullYear()) * 12 +
        (target.getMonth() - anchorDate.getMonth());
      let quarterIndex = Math.floor(totalMonths / 3);

      let currentStart = computeMonthlyDate(anchorDate.getFullYear(), anchorDate.getMonth(), quarterIndex * 3, anchorDay);
      if (target < currentStart) {
        quarterIndex--;
        currentStart = computeMonthlyDate(anchorDate.getFullYear(), anchorDate.getMonth(), quarterIndex * 3, anchorDay);
      }

      const nextStart = computeMonthlyDate(anchorDate.getFullYear(), anchorDate.getMonth(), (quarterIndex + 1) * 3, anchorDay);
      const currentEnd = new Date(nextStart.getTime() - 86400000);

      return {
        startDate: formatISODate(currentStart),
        endDate: formatISODate(currentEnd),
        nextOccurrenceDate: formatISODate(nextStart),
        periodIndex: Math.max(0, quarterIndex),
      };
    }

    case 'yearly': {
      let yearOffset = target.getFullYear() - anchorDate.getFullYear();
      let currentStart = computeYearlyDate(anchorDate.getFullYear() + yearOffset, anchorDate.getMonth(), anchorDay);

      if (target < currentStart) {
        yearOffset--;
        currentStart = computeYearlyDate(anchorDate.getFullYear() + yearOffset, anchorDate.getMonth(), anchorDay);
      }

      const nextStart = computeYearlyDate(anchorDate.getFullYear() + yearOffset + 1, anchorDate.getMonth(), anchorDay);
      const currentEnd = new Date(nextStart.getTime() - 86400000);

      return {
        startDate: formatISODate(currentStart),
        endDate: formatISODate(currentEnd),
        nextOccurrenceDate: formatISODate(nextStart),
        periodIndex: Math.max(0, yearOffset),
      };
    }

    case 'one_time': {
      // One-time setup budget with automatic monthly reset
      const monthOffset =
        (target.getFullYear() - anchorDate.getFullYear()) * 12 +
        (target.getMonth() - anchorDate.getMonth());

      const isAnchorMonth =
        target.getFullYear() === anchorDate.getFullYear() &&
        target.getMonth() === anchorDate.getMonth();

      // In the initial anchor month, starts from anchorDate; in subsequent months, starts from 1st of month
      const currentStart = isAnchorMonth
        ? anchorDate
        : new Date(target.getFullYear(), target.getMonth(), 1, 0, 0, 0, 0);

      // Current month ends on the last day of target month
      const currentEnd = new Date(target.getFullYear(), target.getMonth() + 1, 0, 0, 0, 0, 0);

      // Automatically resets on the 1st of next month
      const nextReset = new Date(target.getFullYear(), target.getMonth() + 1, 1, 0, 0, 0, 0);

      return {
        startDate: formatISODate(currentStart),
        endDate: formatISODate(currentEnd),
        nextOccurrenceDate: formatISODate(nextReset),
        periodIndex: Math.max(0, monthOffset),
      };
    }
  }
}

/**
 * Computes date with month offset from anchor, preserving anchor day with month clamping
 */
function computeMonthlyDate(baseYear: number, baseMonth: number, monthOffset: number, anchorDay: number): Date {
  const totalMonths = baseMonth + monthOffset;
  const targetYear = baseYear + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const clampedDay = clampDay(targetYear, targetMonth, anchorDay);
  return new Date(targetYear, targetMonth, clampedDay, 0, 0, 0, 0);
}

/**
 * Computes yearly date with leap year clamping (Feb 29 -> Feb 28 on non-leap years)
 */
function computeYearlyDate(targetYear: number, anchorMonth: number, anchorDay: number): Date {
  const clampedDay = clampDay(targetYear, anchorMonth, anchorDay);
  return new Date(targetYear, anchorMonth, clampedDay, 0, 0, 0, 0);
}

function getNextPeriodStartDate(startDate: Date, anchorDay: number, recurrence: RecurrenceFrequency, offset: number): Date {
  switch (recurrence) {
    case 'daily':
      return new Date(startDate.getTime() + offset * 86400000);
    case 'weekly':
      return new Date(startDate.getTime() + offset * 7 * 86400000);
    case 'monthly':
      return computeMonthlyDate(startDate.getFullYear(), startDate.getMonth(), offset, anchorDay);
    case 'quarterly':
      return computeMonthlyDate(startDate.getFullYear(), startDate.getMonth(), offset * 3, anchorDay);
    case 'yearly':
      return computeYearlyDate(startDate.getFullYear() + offset, startDate.getMonth(), anchorDay);
    case 'one_time':
      return computeMonthlyDate(startDate.getFullYear(), startDate.getMonth(), offset, anchorDay);
  }
}
