/**
 * meter-logic.ts — Meter reading business logic (aligned with Apps Script MeterService.gs)
 *
 * This module implements the PROTECTED meter reading rules from the original
 * Apps Script MeterService.gs. These rules MUST NOT be changed without
 * consulting the METER_RULES.md documentation.
 *
 * Key protected functions:
 *   1. findValidPrevReading — skips FINAL/SEND_REPAIR + same-month
 *   2. getLifecycleReadingType — RETURN only when wasInactive
 *   3. Per-device lastBW/lastColor (not global)
 *   4. Same-month INITIAL/RESET fallback
 *   5. Mode-switch detection (TOTAL ↔ BW_COLOR)
 *   6. needConfirmReset 2-step flow
 */

import { db } from '@/lib/db'

export type ReadingType =
  | 'MONTHLY'
  | 'INITIAL'
  | 'FINAL'
  | 'RESET'
  | 'CHECKOUT'
  | 'SEND_REPAIR'
  | 'RETURN'

export const USAGE_READING_TYPES: ReadingType[] = ['MONTHLY', 'CHECKOUT', 'RETURN']
export const BASELINE_READING_TYPES: ReadingType[] = ['INITIAL', 'RESET']
/** Reading types that should be SKIPPED when looking for a previous reading */
export const SKIP_AS_PREV_TYPES: ReadingType[] = ['FINAL', 'SEND_REPAIR']

export function isUsageReadingType(type: string | null | undefined): boolean {
  if (!type) return false
  return (USAGE_READING_TYPES as string[]).includes(type.toUpperCase())
}

export function isBaselineReadingType(type: string | null | undefined): boolean {
  if (!type) return false
  return (BASELINE_READING_TYPES as string[]).includes(type.toUpperCase())
}

function shouldSkipAsPrev(type: string | null | undefined): boolean {
  if (!type) return false
  return (SKIP_AS_PREV_TYPES as string[]).includes(type.toUpperCase())
}

/**
 * Normalize a reading month string to YYYY-MM format.
 * Accepts: "2026-01", "2026-01-15", "2026/01", etc.
 */
export function normalizeReadingMonth(value: string | null | undefined): string | null {
  if (!value) return null
  const s = String(value).trim()
  // YYYY-MM-DD → YYYY-MM
  const m = s.match(/^(\d{4})[-/](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`
  return null
}

/**
 * ⚠️ PROTECTED #1-3: Find the valid previous reading for a device.
 *
 * Rules (from Apps Script MeterService.gs findValidPrevReading):
 *   1. Skip readings where readingMonth >= targetMonth (same month + future)
 *   2. Skip FINAL and SEND_REPAIR readings (disposed/repaired devices)
 *   3. RETURN is allowed (it's a new baseline after reactivation)
 *   4. Sort by month desc, then by row id desc (latest first)
 *
 * @param assetCode - device assetCode (was assetNo in old schema)
 * @param readingMonth - target month in YYYY-MM format
 * @param exclusiveCurrentMonth - if true (default), skip same-month readings
 * @returns the previous reading row, or null if none found
 */
export async function findValidPrevReading(
  assetCode: string,
  readingMonth: string,
  exclusiveCurrentMonth = true,
): Promise<{
  id: string
  meterBw: number
  meterColor: number
  readingMonth: string | null
  readingDate: string
  readingType: string | null
} | null> {
  const targetMonth = normalizeReadingMonth(readingMonth)
  if (!targetMonth) return null

  // Fetch all readings for this device (ordered by month desc, then id desc)
  const readings = await db.meterReading.findMany({
    where: {
      assetCode,
      readingMonth: { not: null },
    },
    select: {
      id: true,
      meterBw: true,
      meterColor: true,
      readingMonth: true,
      readingDate: true,
      readingType: true,
    },
    orderBy: [{ readingMonth: 'desc' }, { id: 'desc' }],
  })

  const candidates = []
  for (const row of readings) {
    const rowMonth = normalizeReadingMonth(row.readingMonth || row.readingDate)
    if (!rowMonth) continue
    // Rule 1: skip same month + future (if exclusiveCurrentMonth)
    if (exclusiveCurrentMonth && rowMonth >= targetMonth) continue
    if (!exclusiveCurrentMonth && rowMonth > targetMonth) continue
    // Rule 2: skip FINAL/SEND_REPAIR
    if (shouldSkipAsPrev(row.readingType)) continue
    candidates.push(row)
  }

  if (candidates.length === 0) return null
  // Already sorted by month desc, then id desc from the query
  return candidates[0]
}

/**
 * Find a same-month INITIAL or RESET reading for fallback.
 * Used when no prev reading exists before the target month, but there's
 * a baseline reading in the same month (Apps Script lines 619-633).
 */
export async function findSameMonthBaseline(
  assetCode: string,
  readingMonth: string,
): Promise<{
  id: string
  meterBw: number
  meterColor: number
  readingType: string | null
} | null> {
  const targetMonth = normalizeReadingMonth(readingMonth)
  if (!targetMonth) return null

  const baseline = await db.meterReading.findFirst({
    where: {
      assetCode,
      readingMonth: targetMonth,
      readingType: { in: ['INITIAL', 'RESET'] },
    },
    select: { id: true, meterBw: true, meterColor: true, readingType: true },
    orderBy: { id: 'desc' },
  })

  return baseline
}

/**
 * ⚠️ PROTECTED #6: Determine readingType for a lifecycle status change.
 *
 * Rules (from Apps Script getLifecycleReadingType):
 *   • DISPOSED/RETIRED/RETURNED → FINAL
 *   • IN REPAIR → SEND_REPAIR
 *   • INACTIVE/IN STOCK → CHECKOUT
 *   • ACTIVE → RETURN only if wasInactive (fromStatus was repair/inactive/stock/etc.)
 *             otherwise MONTHLY (Active→Active+move must be MONTHLY, not RETURN)
 */
export function getLifecycleReadingType(
  toStatus: string | null | undefined,
  fromStatus: string | null | undefined,
): ReadingType {
  const s = (toStatus ?? '').trim().toUpperCase()
  const f = (fromStatus ?? '').trim().toUpperCase()

  if (s === 'DISPOSED' || s === 'RETIRED' || s === 'RETURNED') return 'FINAL'
  if (s === 'IN REPAIR') return 'SEND_REPAIR'
  if (s === 'INACTIVE' || s === 'IN STOCK') return 'CHECKOUT'

  if (s === 'ACTIVE') {
    const wasInactive =
      f.includes('REPAIR') ||
      f === 'INACTIVE' ||
      f === 'IN STOCK' ||
      f === 'PENDING REPAIR' ||
      f === 'TEMPORARY' ||
      f === 'DISPOSED' ||
      f === 'RETIRED' ||
      f === 'RETURNED'
    return wasInactive ? 'RETURN' : 'MONTHLY'
  }

  return 'CHECKOUT'
}

/**
 * Page-delta calculation aligned with Apps Script MeterService.gs.
 *
 * Rules:
 *   • INITIAL (brand-new): pages = 0 (baseline)
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

/**
 * Detect mode-switch (TOTAL ↔ BW_COLOR).
 *
 * When a device switches meter mode, the prev reading might not have color
 * data. In that case, we set prevColor = current meterColor so that pages=0
 * for color (baseline), and flag modeSwitched = true.
 *
 * @returns { prevMeterColor, modeSwitched }
 */
export function detectModeSwitch(
  currentMeterMode: string | null | undefined,
  prevHasColor: boolean,
  currentHasColor: boolean,
  prevMeterColor: number,
  currentMeterColor: number,
): { prevMeterColor: number; modeSwitched: boolean } {
  const mode = (currentMeterMode ?? '').toUpperCase()
  // If prev had no color but current does → mode switched to BW_COLOR
  if (!prevHasColor && currentHasColor && mode === 'BW_COLOR') {
    return { prevMeterColor: currentMeterColor, modeSwitched: true }
  }
  // If prev had color but current doesn't → mode switched to TOTAL
  if (prevHasColor && !currentHasColor && mode === 'TOTAL') {
    return { prevMeterColor: 0, modeSwitched: true }
  }
  return { prevMeterColor, modeSwitched: false }
}

/**
 * Check if a device requires meter readings based on its type.
 * Falls back to type-based detection if meterRequired flag is null.
 *
 * Types that require meters: PRINTER, COPIER, MFP
 * Types that don't: THERMAL, LABEL, BARCODE, SLIP, POS
 */
export function isMeterRequiredDevice(device: {
  meterRequired: boolean | null
  type: string
}): boolean {
  if (device.meterRequired !== null) return device.meterRequired
  const type = (device.type || '').toUpperCase()
  if (type.includes('PRINTER') || type.includes('COPIER') || type.includes('MFP')) return true
  if (
    type.includes('THERMAL') ||
    type.includes('LABEL') ||
    type.includes('BARCODE') ||
    type.includes('SLIP') ||
    type.includes('POS')
  ) {
    return false
  }
  return false
}

/**
 * Check if a meter reading represents a decrease (RESET condition).
 * Used to trigger the needConfirmReset 2-step flow.
 */
export function isMeterDecreased(
  meterBw: number,
  prevMeterBw: number,
  meterColor: number,
  prevMeterColor: number,
  isInitial: boolean,
): boolean {
  if (isInitial) return false
  return meterBw < prevMeterBw || meterColor < prevMeterColor
}

/**
 * Check if a device already has a MONTHLY reading for the target month.
 * Used to decide whether to update in-place or insert new.
 */
export async function findExistingMonthlyReading(
  assetCode: string,
  readingMonth: string,
): Promise<{ id: string } | null> {
  const targetMonth = normalizeReadingMonth(readingMonth)
  if (!targetMonth) return null

  return db.meterReading.findFirst({
    where: {
      assetCode,
      readingMonth: targetMonth,
      readingType: 'MONTHLY',
    },
    select: { id: true },
    orderBy: { id: 'desc' },
  })
}
