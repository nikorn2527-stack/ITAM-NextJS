import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { db } from '@/lib/db'
import {
  buildStockItemMap,
  calcMonthlyMaterialCost,
  type MaterialCostReport,
} from '@/lib/material-cost'

/**
 * GET /api/cost-analytics/material?month=YYYY-MM&site=all
 *
 * Spec: upload/COST-ANALYTICS-SPEC.md (Phase 3)
 *
 * Computes material cost report for a given month:
 *   - Ink (consumable) — totalBottles, totalCost, avgCostPerPage
 *   - Spare parts — totalItems, totalCost, monthlyDepreciation
 *   - Service — totalCost
 *   - Reconciliation — ink coverage vs actual printed pages from meter
 *
 * Auth: VIEW_DASHBOARD (read-only analytics).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DASHBOARD')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { searchParams } = new URL(req.url)
    const now = new Date()
    const monthParam = searchParams.get('month')?.trim() ?? ''
    // Default to current month if not provided
    const month = monthParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const siteFilter = searchParams.get('site')?.trim() ?? 'all'

    // Validate month format YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: 'Invalid month format. Use YYYY-MM (e.g. 2026-08).' },
        { status: 400 },
      )
    }

    // Compute month range
    const [yearStr, monthStr] = month.split('-')
    const year = Number(yearStr)
    const monthIdx = Number(monthStr) - 1
    const startDate = `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()
    const endDate = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    // ── Fetch all OUT transactions in the month ──
    // StockTransaction.txnDate is ISO string (YYYY-MM-DD), so we filter by string range.
    const where: Record<string, unknown> = {
      type: 'OUT',
      txnDate: { gte: startDate, lte: endDate },
    }
    if (siteFilter !== 'all') {
      // Filter by StockItem.site via relation — we need a nested where.
      // Prisma: where: { stockItem: { site: siteFilter } }
      where.stockItem = { site: siteFilter }
    }

    const [outTxns, stockItems, readings, siteRates] = await Promise.all([
      db.stockTransaction.findMany({
        where,
        select: {
          id: true,
          stockItemId: true,
          productCode: true,
          productName: true,
          quantity: true,
          unitCost: true,
          cost: true,
        },
        orderBy: { txnDate: 'asc' },
      }),
      db.stockItem.findMany({
        select: {
          id: true,
          productCode: true,
          productName: true,
          category: true,
          unitCost: true,
          costType: true,
          yieldPerPage: true,
          depreciationMethod: true,
          usefulLifeMonths: true,
          usefulLifePages: true,
          unit: true,
        },
      }),
      // Actual printed pages from meter for the same month
      db.meterReading.findMany({
        where: {
          readingDate: { gte: startDate, lte: endDate },
        },
        select: { pagesBw: true, pagesColor: true },
      }),
      db.siteRate.findMany(),
    ])

    const stockItemMap = buildStockItemMap(stockItems as never)

    // Actual printed pages = Σ(pagesBw + pagesColor)
    const actualPrintedPages = readings.reduce(
      (s, r) => s + (r.pagesBw ?? 0) + (r.pagesColor ?? 0),
      0,
    )

    // Compute average paper rate (฿/แผ่น) across sites
    // If site filter is set, use only that site's rate; else use mean of all sites.
    let meterCostPerPage: number | null = null
    if (siteFilter !== 'all') {
      const siteRate = siteRates.find((r) => r.siteCode === siteFilter)
      meterCostPerPage = siteRate?.bwRate ?? null
    } else if (siteRates.length > 0) {
      const sum = siteRates.reduce((s, r) => s + (r.bwRate ?? 0), 0)
      meterCostPerPage = Math.round((sum / siteRates.length) * 100) / 100
    }
    // Fallback default rate
    if (meterCostPerPage == null) meterCostPerPage = 0.5

    const report: MaterialCostReport = calcMonthlyMaterialCost(
      outTxns,
      stockItemMap,
      actualPrintedPages,
      meterCostPerPage,
      month,
    )

    return NextResponse.json(report)
  } catch (err) {
    console.error('GET /api/cost-analytics/material', err)
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.message : 'Failed to compute material cost') : 'Internal server error',
      },
      { status: 500 },
    )
  }
}
