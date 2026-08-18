/**
 * Lifecycle reading-type derivation (aligned with Apps Script MeterService.gs commit 67f8e54).
 *
 * When a device changes status (Active → Inactive, Disposed, Retired, Returned, etc.),
 * the system must decide what readingType to assign to the meter reading taken
 * at the moment of transfer. This module centralizes that decision so both the
 * transfer route and the meter-reading route use the same logic.
 *
 * Rules (from Apps Script getLifecycleReadingType):
 *   • Active → Active (location move only)           → MONTHLY
 *   • Active → Disposed/Retired/Returned (checkout)  → CHECKOUT
 *   • Disposed/Retired/Returned → Active (return)    → RETURN
 *   • Active → Send Repair                           → SEND_REPAIR
 *   • In Repair → Active (return from repair)        → RETURN
 *   • Any → Inactive (final)                         → FINAL
 *   • TEMPORARY status                               → CHECKOUT
 */

export type ReadingType =
  | 'MONTHLY'
  | 'INITIAL'
  | 'FINAL'
  | 'RESET'
  | 'CHECKOUT'
  | 'SEND_REPAIR'
  | 'RETURN'

const INACTIVE_STATUSES = ['inactive', 'disposed', 'retired', 'returned', 'cancelled']
const REPAIR_STATUSES = ['in repair', 'pending repair', 'repair', 'temporary']

/**
 * Determine the readingType for a lifecycle transfer based on from/to status.
 *
 * @param fromStatus - the device's status BEFORE the transfer
 * @param toStatus   - the device's status AFTER the transfer
 * @returns the readingType to assign to any meter reading taken at transfer time
 */
export function getLifecycleReadingType(
  fromStatus: string | null | undefined,
  toStatus: string | null | undefined,
): ReadingType {
  const from = (fromStatus ?? '').trim().toLowerCase()
  const to = (toStatus ?? '').trim().toLowerCase()

  // Moving TO an inactive/disposed/retired/returned state = CHECKOUT (closing reading)
  if (INACTIVE_STATUSES.includes(to) && !INACTIVE_STATUSES.includes(from)) {
    return 'CHECKOUT'
  }

  // Moving FROM inactive/disposed/retired/returned BACK to active = RETURN (new baseline)
  if (INACTIVE_STATUSES.includes(from) && !INACTIVE_STATUSES.includes(to)) {
    return 'RETURN'
  }

  // Moving TO a repair state = SEND_REPAIR
  if (REPAIR_STATUSES.includes(to) && !REPAIR_STATUSES.includes(from)) {
    return 'SEND_REPAIR'
  }

  // Moving FROM repair state BACK to active = RETURN
  if (REPAIR_STATUSES.includes(from) && !REPAIR_STATUSES.includes(to)) {
    return 'RETURN'
  }

  // TEMPORARY status (short-term checkout) = CHECKOUT
  if (to === 'temporary') {
    return 'CHECKOUT'
  }

  // Default: Active → Active (location move) = MONTHLY
  return 'MONTHLY'
}

/**
 * Check if a readingType is a "usage" type that should be counted in
 * monthly analytics totals. Aligned with Apps Script AnalyticsService.gs:
 *   INCLUDE: MONTHLY, CHECKOUT, RETURN (these represent actual usage)
 *   EXCLUDE: INITIAL, RESET, FINAL, SEND_REPAIR (baselines / non-usage)
 */
export const USAGE_READING_TYPES: ReadingType[] = ['MONTHLY', 'CHECKOUT', 'RETURN']

export function isUsageReadingType(type: string | null | undefined): boolean {
  if (!type) return false
  return (USAGE_READING_TYPES as string[]).includes(type.toUpperCase())
}

/**
 * Check if a readingType is a baseline type (contributes 0 usage pages).
 */
export const BASELINE_READING_TYPES: ReadingType[] = ['INITIAL', 'RESET']

export function isBaselineReadingType(type: string | null | undefined): boolean {
  if (!type) return false
  return (BASELINE_READING_TYPES as string[]).includes(type.toUpperCase())
}

/**
 * Page-delta calculation aligned with Apps Script MeterService.gs (commit 67f8e54).
 *
 * Rules:
 *   • INITIAL (brand-new): pages = 0 (baseline — was over-counting as pages=meter)
 *   • INITIAL (transfer):  pages = 0 (prev = meter, delta = 0)
 *   • RESET:                pages = 0 (new baseline)
 *   • MONTHLY/CHECKOUT/FINAL/RETURN/SEND_REPAIR: pages = max(0, current - prev)
 */
export function calcPagesBw(
  meterBw: number,
  prevMeterBw: number,
  readingType: string | null | undefined,
): number {
  if (isBaselineReadingType(readingType)) return 0
  return Math.max(0, meterBw - prevMeterBw)
}

export function calcPagesColor(
  meterColor: number,
  prevMeterColor: number,
  readingType: string | null | undefined,
): number {
  if (isBaselineReadingType(readingType)) return 0
  return Math.max(0, meterColor - prevMeterColor)
}
