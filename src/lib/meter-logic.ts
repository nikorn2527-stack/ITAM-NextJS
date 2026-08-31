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
  | 'TRANSFER' // Cross-site or in-site move while staying ACTIVE (NEW — distinct from MONTHLY)

// USAGE_READING_TYPES now includes 'TRANSFER' so transfer readings contribute
// to usage totals. Previously transfer readings were stamped 'MONTHLY', which
// caused the canonical writer to upsert-overwrite them at end of month — double
// counting earlier transfer deltas. 'TRANSFER' is excluded from upsert lookup
// (see findExistingMonthlyReading) so end-of-month MONTHLY save always INSERTs
// a new row chaining off the most recent in-month reading (transfer or monthly).
export const USAGE_READING_TYPES: ReadingType[] = ['MONTHLY', 'CHECKOUT', 'RETURN', 'TRANSFER']
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
  optionsOrExclusive: boolean | { chainWithinMonth?: boolean } = { chainWithinMonth: true },
): Promise<{
  id: string
  meterBw: number
  meterColor: number
  readingMonth: string | null
  readingDate: string
  readingType: string | null
  meterMode: string | null
  prevMeterMode: string | null
} | null> {
  // Accept both the legacy boolean and the new options shape.
  const opts =
    typeof optionsOrExclusive === 'boolean'
      ? { chainWithinMonth: !optionsOrExclusive } // legacy: exclusive=true → chain=false
      : optionsOrExclusive
  const chainWithinMonth = opts.chainWithinMonth ?? true

  const targetMonth = normalizeReadingMonth(readingMonth)
  if (!targetMonth) return null

  // Fetch all readings for this device (ordered by date desc, then id desc)
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
      meterMode: true,
      prevMeterMode: true,
    },
    orderBy: [{ readingDate: 'desc' }, { id: 'desc' }],
  })

  const candidates: Array<{
    id: string
    meterBw: number
    meterColor: number
    readingMonth: string | null
    readingDate: string
    readingType: string | null
    meterMode: string | null
    prevMeterMode: string | null
  }> = []
  for (const row of readings) {
    const rowMonth = normalizeReadingMonth(row.readingMonth || row.readingDate)
    if (!rowMonth) continue
    if (chainWithinMonth) {
      // New behavior: skip FUTURE months only (allow same month).
      if (rowMonth > targetMonth) continue
    } else {
      // Legacy behavior: skip same month + future.
      if (rowMonth >= targetMonth) continue
    }
    // Rule: skip FINAL/SEND_REPAIR
    if (shouldSkipAsPrev(row.readingType)) continue
    candidates.push(row)
  }

  if (candidates.length === 0) return null
  // Already sorted by date desc, then id desc from the query
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
 * Rules (revised — METER-REDESIGN):
 *   • DISPOSED/RETIRED/RETURNED → FINAL
 *   • IN REPAIR → SEND_REPAIR
 *   • INACTIVE/IN STOCK → CHECKOUT
 *   • ACTIVE → RETURN only if wasInactive (fromStatus was repair/inactive/stock/etc.)
 *   • ACTIVE → TRANSFER if fromStatus was ACTIVE (i.e. cross-site or in-site move)
 *              — was previously returning MONTHLY, which caused the canonical
 *              writer to upsert-overwrite the transfer reading at end of month.
 *              Returning TRANSFER ensures transfer readings are NEVER picked up
 *              by findExistingMonthlyReading (which only matches MONTHLY), so
 *              end-of-month saves always INSERT a new MONTHLY row chaining off
 *              the latest transfer reading.
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
    if (wasInactive) return 'RETURN'
    // Active→Active move (cross-site or in-site transfer while staying active):
    // use 'TRANSFER' so this reading is distinct from end-of-month MONTHLY and
    // will not be picked up for upsert at month end.
    if (f === 'ACTIVE' || f === '') return 'TRANSFER'
    return 'TRANSFER'
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
export type MeterModeTransition =
  | 'NONE'
  | 'TOTAL_TO_BW_COLOR'
  | 'BW_COLOR_TO_TOTAL'

/**
 * ⚠️ PROTECTED #5 (revised — METER-REDESIGN): Detect mode-switch (TOTAL ↔ BW_COLOR).
 *
 * Two transitions:
 *   1. `TOTAL → BW_COLOR`: device previously had only `meterBw` (TOTAL mode),
 *      now reports `meterColor > 0`. The color channel is a NEW baseline — set
 *      `prevMeterColor = currentMeterColor` so `pagesColor = 0` for this reading.
 *      BW channel continues chaining normally.
 *   2. `BW_COLOR → TOTAL`: device previously had separate BW+Color, now reports
 *      only `meterBw` (TOTAL mode, color folded into BW). The color channel
 *      stops accumulating — `pagesColor = 0`. BW channel continues chaining.
 *
 * The snapshots `meterMode` / `prevMeterMode` are persisted on each MeterReading
 * row so future reads can reconstruct the chain even when device.meterMode has
 * since changed.
 *
 * @returns { prevMeterColor, modeSwitched, transition }
 */
export function detectModeSwitch(
  currentMeterMode: string | null | undefined,
  prevHasColor: boolean,
  currentHasColor: boolean,
  prevMeterColor: number,
  currentMeterColor: number,
): {
  prevMeterColor: number
  modeSwitched: boolean
  transition: MeterModeTransition
} {
  const mode = (currentMeterMode ?? '').toUpperCase()
  // If prev had no color but current does → mode switched to BW_COLOR
  if (!prevHasColor && currentHasColor && mode === 'BW_COLOR') {
    return {
      prevMeterColor: currentMeterColor, // baseline — pagesColor = 0
      modeSwitched: true,
      transition: 'TOTAL_TO_BW_COLOR',
    }
  }
  // If prev had color but current doesn't → mode switched to TOTAL
  if (prevHasColor && !currentHasColor && mode === 'TOTAL') {
    return {
      prevMeterColor: 0, // no color channel to compare — pagesColor = 0
      modeSwitched: true,
      transition: 'BW_COLOR_TO_TOTAL',
    }
  }
  return { prevMeterColor, modeSwitched: false, transition: 'NONE' }
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
 *
 * NOTE (METER-REDESIGN): only `readingType='MONTHLY'` is matched here.
 * Transfer readings (created by transfer-with-meter route) are stamped
 * `'TRANSFER'` and will NOT be picked up — so the end-of-month MONTHLY
 * save always INSERTs a new row, even when transfer readings exist in
 * the same month. The new row chains off the most recent in-month
 * reading via `findValidPrevReading({ chainWithinMonth: true })`.
 */
export async function findExistingMonthlyReading(
  assetCode: string,
  readingMonth: string,
): Promise<{ id: string; readingDate: string; readingId: string | null } | null> {
  const targetMonth = normalizeReadingMonth(readingMonth)
  if (!targetMonth) return null

  return db.meterReading.findFirst({
    where: {
      assetCode,
      readingMonth: targetMonth,
      readingType: 'MONTHLY',
    },
    select: { id: true, readingDate: true, readingId: true },
    orderBy: { id: 'desc' },
  })
}
