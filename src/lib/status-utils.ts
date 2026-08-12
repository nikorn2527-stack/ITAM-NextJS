/**
 * Shared status normalization for device counts.
 *
 * The Devices sheet uses mixed-case status values like "Active", "Inactive",
 * "In Stock", "Pending Repair", "Retired", "In Repair", etc.
 * Both dashboards (/api/dashboard and /api/itam/dashboard) must use the SAME
 * vocabulary so the KPI cards show consistent numbers.
 *
 * This module is the single source of truth for status → canonical bucket mapping.
 */

export type StatusBucket = 'active' | 'inactive' | 'spare' | 'repair' | 'disposed' | 'other'

/** Canonical buckets that the dashboard KPIs track. */
export const STATUS_BUCKETS = {
  active: ['active', 'in use', 'ใช้งานอยู่'],
  inactive: ['inactive', 'ไม่ใช้งาน', 'retired', 'ตัดของออก', 'disposed', 'returned'],
  spare: ['spare', 'in stock', 'สำรอง', 'in storage'],
  repair: ['repair', 'in repair', 'pending repair', 'ส่งซ่อม', 'temporary'],
} as const

/** Map a raw status string to a canonical bucket. Case-insensitive. */
export function classifyStatus(raw: string | null | undefined): StatusBucket {
  if (!raw) return 'other'
  const s = raw.trim().toLowerCase()
  for (const [bucket, aliases] of Object.entries(STATUS_BUCKETS)) {
    if ((aliases as readonly string[]).includes(s)) return bucket as StatusBucket
  }
  return 'other'
}

/** Thai display label for each bucket. */
export const STATUS_LABELS: Record<StatusBucket, string> = {
  active: 'ใช้งานอยู่',
  inactive: 'ไม่ใช้งาน',
  spare: 'สำรอง',
  repair: 'ส่งซ่อม',
  disposed: 'ตัดของออก',
  other: 'อื่นๆ',
}

/**
 * Given a Prisma `groupBy` result on Device.status, classify each row into
 * canonical buckets and return the 4 KPI counts + the full byStatus array.
 */
export function bucketizeStatusGroups(
  groups: { status: string; _count: { status: number } }[],
): {
  total: number
  active: number
  inactive: number
  spare: number
  repair: number
  byStatus: { name: string; raw: string; value: number }[]
} {
  const bucketCounts: Record<StatusBucket, number> = {
    active: 0,
    inactive: 0,
    spare: 0,
    repair: 0,
    disposed: 0,
    other: 0,
  }
  let total = 0
  // Track raw statuses for the "other" bucket so we can show them individually
  const otherRaw: { name: string; raw: string; value: number }[] = []

  for (const g of groups) {
    const count = g._count.status
    total += count
    const bucket = classifyStatus(g.status)
    bucketCounts[bucket] += count
    if (bucket === 'other') {
      otherRaw.push({
        name: g.status,
        raw: g.status.toLowerCase(),
        value: count,
      })
    }
  }

  const byStatus: { name: string; raw: string; value: number }[] = [
    { name: STATUS_LABELS.active, raw: 'active', value: bucketCounts.active },
    { name: STATUS_LABELS.inactive, raw: 'inactive', value: bucketCounts.inactive },
    { name: STATUS_LABELS.spare, raw: 'spare', value: bucketCounts.spare },
    { name: STATUS_LABELS.repair, raw: 'repair', value: bucketCounts.repair },
    ...otherRaw,
  ].filter((r) => r.value > 0)

  return {
    total,
    active: bucketCounts.active,
    inactive: bucketCounts.inactive,
    spare: bucketCounts.spare,
    repair: bucketCounts.repair,
    byStatus,
  }
}

/**
 * Calculate paper usage delta following the Apps Script formula:
 *   Pages_BW    = max(0, Meter_BW - Prev_Meter_BW)
 *   Pages_Color = max(0, Meter_Color - Prev_Meter_Color)
 *
 * For INITIAL readings (brand-new device), pages = meter (prev = 0).
 * For RESET readings, pages = 0 (prev = meter, new baseline).
 * For TRANSFER INITIAL, pages = 0 (prev = meter, no usage attributed).
 *
 * In our DB, pagesBw/pagesColor are pre-computed at insert time, so this
 * function is mainly for validation and for computing totals from raw meter
 * values when needed.
 */
export function calcPagesDelta(
  currentMeter: number,
  prevMeter: number,
  readingType?: string | null,
): number {
  const type = (readingType ?? '').toUpperCase()
  // INITIAL (transfer) and RESET → pages = 0 (new baseline, no usage)
  if (type === 'RESET') return 0
  // INITIAL (brand-new) → pages = meter (prev = 0, so delta = meter)
  // INITIAL (transfer) → pages = 0 (prev = meter, so delta = 0)
  // Both cases are handled by max(0, current - prev):
  //   brand-new: max(0, meter - 0) = meter ✓
  //   transfer:  max(0, meter - meter) = 0 ✓
  return Math.max(0, currentMeter - prevMeter)
}

/**
 * Sum pages from a reading, using pre-computed pagesBw/pagesColor fields.
 * Falls back to 0 if both are null/undefined.
 */
export function readingPages(r: { pagesBw: number | null; pagesColor: number | null }): number {
  return (r.pagesBw ?? 0) + (r.pagesColor ?? 0)
}
