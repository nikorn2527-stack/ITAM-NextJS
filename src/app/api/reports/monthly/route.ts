// ============================================================
// Monthly Report API (Task ID: PRINT-REPORT — PART 2)
// ============================================================
// GET /api/reports/monthly?month=YYYY-MM&site=&type=work-order|stock|devices|all
//
// Returns a monthly summary aggregating Work Orders, Stock movements,
// and Devices. Designed to feed the MonthlyReport UI component and
// to support CSV export + print.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { moduleUnavailableResponse } from '@/lib/module-gate'
import { db } from '@/lib/db'

type ReportType = 'work-order' | 'stock' | 'devices' | 'all'

const VALID_TYPES = new Set<ReportType>([
  'work-order',
  'stock',
  'devices',
  'all',
])

const PRIORITY_ORDER = ['ปกติ', 'ปานกลาง', 'สูง', 'ด่วน']

/**
 * Validate the `month` query param: must be YYYY-MM. Defaults to the
 * current local month when missing/invalid.
 */
function parseMonth(input: string | null): {
  month: string // YYYY-MM
  startISO: string // YYYY-MM-01
  endISO: string // YYYY-MM-DD (last day)
  start: Date
  end: Date
} {
  const now = new Date()
  const fallbackY = now.getFullYear()
  const fallbackM = now.getMonth() // 0-based

  let y: number
  let m: number // 0-based

  if (input && /^\d{4}-\d{2}$/.test(input)) {
    const [yy, mm] = input.split('-')
    y = parseInt(yy, 10)
    m = parseInt(mm, 10) - 1
    if (
      Number.isNaN(y) ||
      Number.isNaN(m) ||
      m < 0 ||
      m > 11 ||
      y < 1900 ||
      y > 9999
    ) {
      y = fallbackY
      m = fallbackM
    }
  } else {
    y = fallbackY
    m = fallbackM
  }

  const mmStr = String(m + 1).padStart(2, '0')
  const startISO = `${y}-${mmStr}-01`
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const endISO = `${y}-${mmStr}-${String(daysInMonth).padStart(2, '0')}`
  const start = new Date(y, m, 1, 0, 0, 0, 0)
  const end = new Date(y, m, daysInMonth, 23, 59, 59, 999)
  return {
    month: `${y}-${mmStr}`,
    startISO,
    endISO,
    start,
    end,
  }
}

interface WorkOrderSummary {
  total: number
  byStatus: Record<string, number>
  byPriority: Record<string, number>
  bySubject: Array<{ subject: string; count: number }>
  avgResponseTimeMin: number | null
  avgRating: number | null
  byStaff: Array<{
    name: string
    count: number
    completed: number
  }>
}

interface StockSummary {
  totalIn: number
  totalOut: number
  topItems: Array<{
    productName: string
    productCode: string | null
    quantity: number
    type: string
  }>
  lowStockItems: Array<{
    productCode: string
    productName: string
    quantity: number
    minQuantity: number
    unit: string
  }>
  totalValue: number
}

interface DeviceSummary {
  total: number
  newDevices: number
  byStatus: Record<string, number>
}

function buildWhereForSite(siteFilter: string | null) {
  if (!siteFilter) return {}
  return { site: siteFilter }
}

async function buildWorkOrderSummary(
  month: ReturnType<typeof parseMonth>,
  siteFilter: string | null,
): Promise<WorkOrderSummary> {
  // WorkOrder has no `site` field directly; we filter via building/location
  // if a site filter is provided (kept loose — many WOs may not match).
  // For now we ignore siteFilter for WOs (the spec doesn't require per-site WO
  // filtering beyond what's already in the table).
  void siteFilter

  const where = {
    createdAt: { gte: month.start, lte: month.end },
  }

  const workOrders = await db.workOrder.findMany({
    where,
    select: {
      id: true,
      status: true,
      priority: true,
      subject: true,
      assignedTo: true,
      createdAt: true,
      assignedAt: true,
      workCompletedAt: true,
    },
  })

  const total = workOrders.length

  // ── byStatus ──
  const byStatus: Record<string, number> = {
    PENDING: 0,
    IN_PROGRESS: 0,
    WAITING_PARTS: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  }
  for (const w of workOrders) {
    byStatus[w.status] = (byStatus[w.status] ?? 0) + 1
  }

  // ── byPriority ──
  const byPriority: Record<string, number> = {
    ปกติ: 0,
    ปานกลาง: 0,
    สูง: 0,
    ด่วน: 0,
  }
  for (const w of workOrders) {
    byPriority[w.priority] = (byPriority[w.priority] ?? 0) + 1
  }

  // ── bySubject (top 10) ──
  const subjectMap = new Map<string, number>()
  for (const w of workOrders) {
    const key = w.subject?.trim() || 'ไม่ระบุ'
    subjectMap.set(key, (subjectMap.get(key) ?? 0) + 1)
  }
  const bySubject = Array.from(subjectMap.entries())
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // ── avg response time (assigned - created), in minutes ──
  const responseTimesMin: number[] = []
  for (const w of workOrders) {
    if (w.assignedAt && w.createdAt) {
      const diffMs = w.assignedAt.getTime() - w.createdAt.getTime()
      if (diffMs >= 0) {
        responseTimesMin.push(diffMs / (1000 * 60))
      }
    }
  }
  const avgResponseTimeMin =
    responseTimesMin.length > 0
      ? Math.round(
          responseTimesMin.reduce((s, v) => s + v, 0) /
            responseTimesMin.length,
        )
      : null

  // ── avg rating ──
  const reviews = await db.workOrderReview.findMany({
    where: {
      workOrder: { createdAt: { gte: month.start, lte: month.end } },
    },
    select: { rating: true },
  })
  const avgRating =
    reviews.length > 0
      ? Number(
          (
            reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
          ).toFixed(2),
        )
      : null

  // ── by staff (assignedTo) ──
  const staffMap = new Map<
    string,
    { name: string; count: number; completed: number }
  >()
  for (const w of workOrders) {
    const name = w.assignedTo?.trim() || 'ไม่ได้มอบหมาย'
    const entry = staffMap.get(name) ?? { name, count: 0, completed: 0 }
    entry.count += 1
    if (w.status === 'COMPLETED') entry.completed += 1
    staffMap.set(name, entry)
  }
  const byStaff = Array.from(staffMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  return {
    total,
    byStatus,
    byPriority,
    bySubject,
    avgResponseTimeMin,
    avgRating,
    byStaff,
  }
}

async function buildStockSummary(
  month: ReturnType<typeof parseMonth>,
  siteFilter: string | null,
): Promise<StockSummary> {
  // StockTransaction.txnDate is a string (YYYY-MM-DD). Filter by string range.
  const txnWhere: Record<string, unknown> = {
    txnDate: { gte: month.startISO, lte: month.endISO },
  }

  // Apply site filter on stockItem.site (relation)
  if (siteFilter) {
    txnWhere.stockItem = { site: siteFilter }
  }

  const txns = await db.stockTransaction.findMany({
    where: txnWhere,
    select: {
      id: true,
      type: true,
      quantity: true,
      productName: true,
      productCode: true,
      stockItemId: true,
      stockItem: {
        select: {
          productCode: true,
          productName: true,
          quantity: true,
          minQuantity: true,
          unit: true,
          unitCost: true,
          totalValue: true,
          site: true,
        },
      },
    },
  })

  const totalIn = txns
    .filter((t) => t.type === 'IN')
    .reduce((s, t) => s + t.quantity, 0)
  const totalOut = txns
    .filter((t) => t.type === 'OUT')
    .reduce((s, t) => s + t.quantity, 0)

  // Top items (by total quantity moved, any direction)
  const itemMap = new Map<
    string,
    {
      productName: string
      productCode: string | null
      quantity: number
      type: string
    }
  >()
  for (const t of txns) {
    const productName =
      t.productName ?? t.stockItem?.productName ?? 'ไม่ระบุ'
    const productCode = t.productCode ?? t.stockItem?.productCode ?? null
    const key = `${productCode ?? productName}|${t.type}`
    const entry = itemMap.get(key) ?? {
      productName,
      productCode,
      quantity: 0,
      type: t.type,
    }
    entry.quantity += t.quantity
    itemMap.set(key, entry)
  }
  const topItems = Array.from(itemMap.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10)

  // Low stock items (current state) — read from stockItem table
  const stockItemWhere: Record<string, unknown> = {}
  if (siteFilter) stockItemWhere.site = siteFilter
  const stockItems = await db.stockItem.findMany({
    where: stockItemWhere,
    select: {
      productCode: true,
      productName: true,
      quantity: true,
      minQuantity: true,
      unit: true,
      unitCost: true,
      totalValue: true,
    },
  })
  const lowStockItems = stockItems
    .filter((s) => s.quantity <= s.minQuantity && s.minQuantity > 0)
    .map((s) => ({
      productCode: s.productCode,
      productName: s.productName,
      quantity: s.quantity,
      minQuantity: s.minQuantity,
      unit: s.unit,
    }))
    .sort((a, b) => b.minQuantity - b.quantity - (a.minQuantity - a.quantity))
    .slice(0, 15)

  const totalValue = stockItems.reduce((sum, s) => {
    const v =
      typeof s.totalValue === 'number' && s.totalValue > 0
        ? s.totalValue
        : (s.unitCost ?? 0) * s.quantity
    return sum + v
  }, 0)

  return {
    totalIn,
    totalOut,
    topItems,
    lowStockItems,
    totalValue: Math.round(totalValue * 100) / 100,
  }
}

async function buildDeviceSummary(
  month: ReturnType<typeof parseMonth>,
  siteFilter: string | null,
): Promise<DeviceSummary> {
  const where = buildWhereForSite(siteFilter)
  const devices = await db.device.findMany({
    where,
    select: {
      id: true,
      status: true,
      createdAt: true,
    },
  })

  const total = devices.length
  const newDevices = devices.filter((d) => {
    return (
      d.createdAt >= month.start && d.createdAt <= month.end
    )
  }).length

  const byStatus: Record<string, number> = {}
  for (const d of devices) {
    const key = d.status || 'Unknown'
    byStatus[key] = (byStatus[key] ?? 0) + 1
  }

  return { total, newDevices, byStatus }
}

function formatResponseTime(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes < 60) return `${Math.round(minutes)} นาที`
  const h = minutes / 60
  if (h < 24) return `${h.toFixed(1)} ชม.`
  const d = h / 24
  return `${d.toFixed(1)} วัน`
}

export async function GET(req: NextRequest) {
  const unavailable = moduleUnavailableResponse('reports')
  if (unavailable) return unavailable
  try {
    const { searchParams } = new URL(req.url)
    const monthParam = searchParams.get('month')?.trim() || null
    const siteParam = searchParams.get('site')?.trim() || null
    const typeParam = (searchParams.get('type')?.trim() ||
      'all') as ReportType

    if (!VALID_TYPES.has(typeParam)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: work-order, stock, devices, all` },
        { status: 400 },
      )
    }

    const month = parseMonth(monthParam)

    const includeWO = typeParam === 'all' || typeParam === 'work-order'
    const includeStock = typeParam === 'all' || typeParam === 'stock'
    const includeDevices = typeParam === 'all' || typeParam === 'devices'

    const [workOrders, stock, devices] = await Promise.all([
      includeWO ? buildWorkOrderSummary(month, siteParam) : null,
      includeStock ? buildStockSummary(month, siteParam) : null,
      includeDevices ? buildDeviceSummary(month, siteParam) : null,
    ])

    return NextResponse.json({
      month: month.month,
      range: {
        start: month.startISO,
        end: month.endISO,
      },
      generatedAt: new Date().toISOString(),
      filters: {
        site: siteParam || null,
        type: typeParam,
      },
      workOrders,
      stock,
      devices,
      // Convenience for UI: response time as a Thai-formatted string
      meta: {
        avgResponseTimeLabel: workOrders
          ? formatResponseTime(workOrders.avgResponseTimeMin)
          : '—',
      },
    })
  } catch (err) {
    console.error('GET /api/reports/monthly', err)
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to fetch monthly report',
      },
      { status: 500 },
    )
  }
}
