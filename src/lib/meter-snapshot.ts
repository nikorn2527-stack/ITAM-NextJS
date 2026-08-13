/**
 * Meter Snapshot Service (aligned with Apps Script MeterSnapshotService.gs).
 *
 * Creates immutable, SHA-256-hashed snapshots of meter readings when a cycle
 * is CLOSED. This prevents retroactive edits from silently changing historical
 * billing data.
 *
 * Lifecycle:
 *   1. Cycle OPEN → readings can be added/edited freely
 *   2. Cycle CLOSE → createMeterReportSnapshot(month) is called BEFORE writing
 *      Status='CLOSED'. If snapshot creation fails, the cycle stays OPEN.
 *   3. CLOSED month → readings are read-only (enforced by assertMeterMonthWritable)
 *   4. Amendment → if a correction is needed, a NEW snapshot revision is created
 *      (the original is never overwritten, only marked SUPERSEDED)
 *
 * Storage:
 *   • MeterReportSnapshot — metadata (1 row per snapshot)
 *   • MeterReportSnapshotRow — frozen reading data (N rows per snapshot)
 *   • MeterReportAmendment — audit trail for corrections
 */

import { db } from '@/lib/db'
import crypto from 'crypto'

const RULE_VERSION = 'v2-initial-baseline'

/**
 * Generate a snapshot ID: MRS-<YYYYMM>-R<revision>-<yyyyMMddHHmmss>
 */
function generateSnapshotId(cycleMonth: string, revision: number): string {
  const now = new Date()
  const ts =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0')
  return `MRS-${cycleMonth.replace('-', '')}-R${revision}-${ts}`
}

/**
 * Generate an amendment ID: MRA-<YYYYMM>-<yyyyMMddHHmmss>
 */
function generateAmendmentId(cycleMonth: string): string {
  const now = new Date()
  const ts =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0')
  return `MRA-${cycleMonth.replace('-', '')}-${ts}`
}

/**
 * Compute a SHA-256 content hash over a set of reading rows.
 * Each row is canonicalized as a pipe-delimited string; rows joined by \n.
 * This detects any tampering with snapshot data after creation.
 */
function computeContentHash(
  rows: Array<{
    assetCode: string
    readingDate: string | null
    meterBw: number
    meterColor: number
    pagesBw: number
    pagesColor: number
    prevMeterBw: number
    prevMeterColor: number
    readingType: string | null
  }>,
): string {
  const canonical = rows
    .map((r) =>
      [
        r.assetCode,
        r.readingDate ?? '',
        r.meterBw,
        r.meterColor,
        r.pagesBw,
        r.pagesColor,
        r.prevMeterBw,
        r.prevMeterColor,
        r.readingType ?? '',
      ].join('|'),
    )
    .join('\n')
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/**
 * Create an immutable snapshot of all meter readings for a given cycle month.
 * Called automatically by the cycle-close flow BEFORE writing Status='CLOSED'.
 *
 * @param cycleMonth - e.g. "2026-08"
 * @param createdBy  - user email
 * @returns the created snapshot record (with snapshotId + contentHash)
 */
export async function createMeterReportSnapshot(
  cycleMonth: string,
  createdBy: string,
): Promise<{
  snapshotId: string
  contentHash: string
  rowCount: number
  totalPagesBw: number
  totalPagesColor: number
  totalCost: number
  revision: number
} | null> {
  try {
    // TODO: meterReportSnapshot table removed — feature disabled
    // Find the highest existing revision for this month (for amendments)
    const existing = await db.meterReportSnapshot.findFirst({
      where: { cycleMonth },
      orderBy: { revision: 'desc' },
      select: { revision: true },
    })
    const revision = (existing?.revision ?? 0) + 1

    // Fetch all readings for this cycle month (by readingMonth)
    const readings = await db.meterReading.findMany({
      where: { readingMonth: cycleMonth },
      include: {
        device: {
          select: { brand: true, model: true, site: true, building: true, floor: true, department: true },
        },
      },
      orderBy: { assetCode: 'asc' },
    })

    // Fetch site rates for cost calculation
    const sites = await db.siteAttribute.findMany()
    const siteRateMap = new Map<string, { bw: number; color: number }>()
    for (const s of sites) {
      siteRateMap.set(s.SiteName || '', {
        bw: s.PaperRateBW ?? 0.5,
        color: s.PaperRateColor ?? 2.0,
      })
    }

    // Build frozen rows
    const frozenRows = readings.map((r) => {
      const siteName = r.siteAtReading || r.device.site || ''
      const rates = siteRateMap.get(siteName) ?? { bw: 0.5, color: 2.0 }
      return {
        assetCode: r.assetCode ?? '',
        readingDate: r.readingDate,
        readingMonth: r.readingMonth,
        meterBw: r.meterBw,
        meterColor: r.meterColor,
        pagesBw: r.pagesBw,
        pagesColor: r.pagesColor,
        prevMeterBw: r.prevMeterBw,
        prevMeterColor: r.prevMeterColor,
        readingType: r.readingType,
        brand: r.device.brand,
        model: r.device.model,
        siteAtReading: r.siteAtReading,
        buildingAtReading: r.buildingAtReading,
        floorAtReading: r.floorAtReading,
        departmentAtReading: r.departmentAtReading,
        rateBw: rates.bw,
        rateColor: rates.color,
        costBw: r.pagesBw * rates.bw,
        costColor: r.pagesColor * rates.color,
        readBy: r.readBy,
        remark: r.remark,
      }
    })

    // Compute totals + hash
    const totalPagesBw = frozenRows.reduce((sum, r) => sum + r.pagesBw, 0)
    const totalPagesColor = frozenRows.reduce((sum, r) => sum + r.pagesColor, 0)
    const totalCost = frozenRows.reduce((sum, r) => sum + r.costBw + r.costColor, 0)
    const contentHash = computeContentHash(frozenRows)

    // Mark previous ACTIVE snapshot as SUPERSEDED (if any)
    if (existing) {
      await db.meterReportSnapshot.updateMany({
        where: { cycleMonth, status: 'ACTIVE' },
        data: { status: 'SUPERSEDED' },
      })
    }

    const snapshotId = generateSnapshotId(cycleMonth, revision)

    // Create the snapshot + all frozen rows in a transaction
    await db.$transaction([
      db.meterReportSnapshot.create({
        data: {
          snapshotId,
          cycleMonth,
          revision,
          status: 'ACTIVE',
          ruleVersion: RULE_VERSION,
          rowCount: frozenRows.length,
          totalPagesBw,
          totalPagesColor,
          totalCost,
          contentHash,
          createdBy,
        },
      }),
      // Insert all frozen rows
      db.meterReportSnapshotRow.createMany({
        data: frozenRows.map((r) => ({
          snapshotId,
          assetCode: r.assetCode,
          readingDate: r.readingDate,
          readingMonth: r.readingMonth,
          meterBw: r.meterBw,
          meterColor: r.meterColor,
          pagesBw: r.pagesBw,
          pagesColor: r.pagesColor,
          prevMeterBw: r.prevMeterBw,
          prevMeterColor: r.prevMeterColor,
          readingType: r.readingType,
          brand: r.brand,
          model: r.model,
          siteAtReading: r.siteAtReading,
          buildingAtReading: r.buildingAtReading,
          floorAtReading: r.floorAtReading,
          departmentAtReading: r.departmentAtReading,
          rateBw: r.rateBw,
          rateColor: r.rateColor,
          costBw: r.costBw,
          costColor: r.costColor,
          readBy: r.readBy,
          remark: r.remark,
        })),
      }),
    ])

    return {
      snapshotId,
      contentHash,
      rowCount: frozenRows.length,
      totalPagesBw,
      totalPagesColor,
      totalCost,
      revision,
    }
  } catch {
    // TODO: meterReportSnapshot table removed — feature disabled
    return null
  }
}

/**
 * Verify a snapshot's integrity by re-computing its content hash and
 * comparing against the stored hash. Returns true if the snapshot data
 * is unchanged since creation.
 */
export async function verifyMeterReportSnapshot(
  cycleMonth: string,
): Promise<{ verified: boolean; snapshotId: string; storedHash: string; computedHash: string } | null> {
  try {
    // TODO: meterReportSnapshot table removed — feature disabled
    const snapshot = await db.meterReportSnapshot.findFirst({
      where: { cycleMonth, status: 'ACTIVE' },
      orderBy: { revision: 'desc' },
    })
    if (!snapshot) {
      throw new Error(`No active snapshot found for cycle month ${cycleMonth}`)
    }

    const rows = await db.meterReportSnapshotRow.findMany({
      where: { snapshotId: snapshot.snapshotId },
      orderBy: { assetCode: 'asc' },
    })

    const computedHash = computeContentHash(
      rows.map((r) => ({
        assetCode: r.assetCode,
        readingDate: r.readingDate,
        meterBw: r.meterBw,
        meterColor: r.meterColor,
        pagesBw: r.pagesBw,
        pagesColor: r.pagesColor,
        prevMeterBw: r.prevMeterBw,
        prevMeterColor: r.prevMeterColor,
        readingType: r.readingType,
      })),
    )

    return {
      verified: computedHash === snapshot.contentHash,
      snapshotId: snapshot.snapshotId,
      storedHash: snapshot.contentHash,
      computedHash,
    }
  } catch {
    // TODO: meterReportSnapshot table removed — feature disabled
    return null
  }
}

/**
 * Assert that a meter-reading month is writable (cycle is OPEN).
 * Throws if the cycle for the given month is CLOSED — preventing retroactive
 * edits to frozen billing data.
 *
 * Aligned with Apps Script assertMeterMonthWritable (commit 67f8e54).
 *
 * @param month - e.g. "2026-08"
 * @param actionLabel - description of the attempted action (for error message)
 */
export async function assertMeterMonthWritable(
  month: string,
  actionLabel: string,
): Promise<void> {
  // Find the cycle whose date range contains this month
  const cycles = await db.cycle.findMany({
    where: {
      OR: [
        { status: 'CLOSED' },
        { status: 'closed' },
      ],
    },
  })

  // Check if any CLOSED cycle's date range overlaps this month
  const monthStart = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const monthEnd = `${month}-${String(daysInMonth).padStart(2, '0')}`

  for (const c of cycles) {
    // Cycle range overlaps month range?
    if (c.startDate <= monthEnd && c.endDate >= monthStart) {
      throw new Error(
        `ไม่สามารถ${actionLabel}ได้: รอบจดมิเตอร์ ${c.name} (${c.startDate} → ${c.endDate}) ถูกปิดและสร้าง snapshot แล้ว — ข้อมูลถูกล็อกเพื่อความถูกต้องของการเรียกเก็บเงิน`,
      )
    }
  }
}
