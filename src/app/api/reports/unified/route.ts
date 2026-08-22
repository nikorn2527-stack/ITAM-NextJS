/**
 * GET /api/reports/unified?group=<group>&month=YYYY-MM&site=CODE|all
 *
 * Unified reports endpoint that returns pre-aggregated data for the
 * Reports Hub UI (5 report groups + 1 approvals group).
 *
 * Groups:
 *   • devices      — status / type / site / warranty / depreciation
 *   • meters       — paper usage / cost by site & dept / unmetered / monthly compare
 *   • workorders   — status / staff / subject / 50-baht special fee / ratings
 *   • stock        — summary / low & out-of-stock / recent txns / pending approvals
 *   • maintenance  — repair history per device / cost by month & site / top parts
 *   • approvals    — pending counts across stock/WO/special fee + approval history
 *
 * All sections return JSON shaped for direct consumption by charts/tables
 * in the frontend `reports-hub.tsx` component.
 *
 * Task ID: REPORTS-HUB-5GROUPS
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { logAudit } from '@/lib/audit'
import { buildAuthorizationContext } from '@/lib/authorization-context'

export type ReportGroup =
  | 'devices'
  | 'meters'
  | 'workorders'
  | 'stock'
  | 'maintenance'
  | 'approvals'

const VALID_GROUPS: ReportGroup[] = [
  'devices',
  'meters',
  'workorders',
  'stock',
  'maintenance',
  'approvals',
]

// ── Helpers ────────────────────────────────────────────
function parseMonth(monthStr: string | null): { start: string; end: string; label: string } | null {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return null
  const [y, m] = monthStr.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return null
  const start = `${monthStr}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${monthStr}-${String(lastDay).padStart(2, '0')}`
  const label = new Date(y, m - 1, 1).toLocaleDateString('th-TH', {
    month: 'long',
    year: 'numeric',
  })
  return { start, end, label }
}

function currentMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function previousMonthStr(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 2, 1) // m-2 because month is 1-indexed, and we want prev month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const STATUS_LABELS_DEV: Record<string, string> = {
  Active: 'ใช้งานอยู่',
  'In Repair': 'ส่งซ่อม',
  Retired: 'ปลดระวาง',
  Spare: 'สำรอง',
  Inactive: 'ไม่ใช้งาน',
}

const STATUS_LABELS_WO: Record<string, string> = {
  PENDING: 'รอดำเนินการ',
  IN_PROGRESS: 'กำลังซ่อม',
  WAITING_PARTS: 'รออะไหล่',
  COMPLETED: 'เสร็จแล้ว',
  CANCELLED: 'ยกเลิก',
}

const DEVICE_TYPE_LABELS: Record<string, string> = {
  PRINTER: 'เครื่องพิมพ์',
  SCANNER: 'สแกนเนอร์',
  COMPUTER: 'คอมพิวเตอร์',
  NETWORK: 'อุปกรณ์เครือข่าย',
  OTHER: 'อื่น ๆ',
}

// ── Group builders ────────────────────────────────────

async function buildDevicesReport(siteCodes: string[] | null) {
  const where: Record<string, unknown> = {}
  if (siteCodes !== null) where.site = { in: siteCodes }

  const devices = await db.device.findMany({
    where,
    select: {
      id: true,
      assetCode: true,
      name: true,
      brand: true,
      model: true,
      type: true,
      status: true,
      site: true,
      department: true,
      purchaseDate: true,
      purchasePrice: true,
      salvageValue: true,
      usefulLife: true,
      warrantyEnd: true,
      warrantyMonths: true,
    },
    orderBy: { assetCode: 'asc' },
  })

  const total = devices.length

  // by status
  const statusMap = new Map<string, number>()
  for (const d of devices) {
    statusMap.set(d.status, (statusMap.get(d.status) ?? 0) + 1)
  }
  const byStatus = Array.from(statusMap.entries())
    .map(([name, value]) => ({
      name: STATUS_LABELS_DEV[name] ?? name,
      raw: name,
      value,
    }))
    .sort((a, b) => b.value - a.value)

  // by type
  const typeMap = new Map<string, number>()
  for (const d of devices) {
    typeMap.set(d.type, (typeMap.get(d.type) ?? 0) + 1)
  }
  const byType = Array.from(typeMap.entries())
    .map(([name, value]) => ({
      name: DEVICE_TYPE_LABELS[name] ?? name,
      raw: name,
      value,
    }))
    .sort((a, b) => b.value - a.value)

  // by site
  const siteMap = new Map<string, number>()
  for (const d of devices) {
    siteMap.set(d.site, (siteMap.get(d.site) ?? 0) + 1)
  }
  const bySite = Array.from(siteMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  // warranty analysis
  const today = new Date()
  const todayISO = today.toISOString().slice(0, 10)
  const ninetyDaysLater = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const warrantyExpiringSoon = devices
    .filter((d) => {
      if (!d.warrantyEnd) return false
      return d.warrantyEnd >= todayISO && d.warrantyEnd <= ninetyDaysLater
    })
    .map((d) => {
      const daysLeft = Math.ceil(
        (new Date(d.warrantyEnd!).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      )
      return {
        assetCode: d.assetCode,
        name: d.name,
        site: d.site,
        warrantyEnd: d.warrantyEnd,
        daysLeft,
      }
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 50)

  const warrantyExpired = devices
    .filter((d) => d.warrantyEnd && d.warrantyEnd < todayISO)
    .map((d) => ({
      assetCode: d.assetCode,
      name: d.name,
      site: d.site,
      warrantyEnd: d.warrantyEnd,
    }))
    .sort((a, b) => (a.warrantyEnd ?? '').localeCompare(b.warrantyEnd ?? ''))
    .slice(0, 50)

  // depreciation (straight-line)
  const depreciation = devices
    .filter((d) => d.purchasePrice && d.usefulLife && d.purchasePrice > 0)
    .map((d) => {
      const purchasePrice = d.purchasePrice ?? 0
      const salvageValue = d.salvageValue ?? 0
      const usefulLife = d.usefulLife ?? 1
      const purchaseDate = d.purchaseDate ? new Date(d.purchaseDate) : null
      const ageYears = purchaseDate
        ? (today.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
        : 0
      const annualDepreciation = (purchasePrice - salvageValue) / usefulLife
      const accumulatedDepreciation = Math.min(
        purchasePrice - salvageValue,
        annualDepreciation * ageYears,
      )
      const bookValue = Math.max(salvageValue, purchasePrice - accumulatedDepreciation)
      return {
        assetCode: d.assetCode,
        name: d.name,
        site: d.site,
        type: d.type,
        purchasePrice,
        salvageValue,
        usefulLife,
        ageYears: Number(ageYears.toFixed(2)),
        annualDepreciation: Number(annualDepreciation.toFixed(2)),
        accumulatedDepreciation: Number(accumulatedDepreciation.toFixed(2)),
        bookValue: Number(bookValue.toFixed(2)),
      }
    })
    .sort((a, b) => b.accumulatedDepreciation - a.accumulatedDepreciation)
    .slice(0, 100)

  const totalPurchaseValue = devices.reduce(
    (s, d) => s + (d.purchasePrice ?? 0),
    0,
  )
  const totalBookValue = depreciation.reduce((s, d) => s + d.bookValue, 0)
  const totalAccumDepreciation = depreciation.reduce(
    (s, d) => s + d.accumulatedDepreciation,
    0,
  )

  return {
    group: 'devices',
    generatedAt: new Date().toISOString(),
    site: siteCodes === null ? 'all' : siteCodes.join(','),
    summary: {
      total,
      active: statusMap.get('Active') ?? 0,
      repair: statusMap.get('In Repair') ?? 0,
      retired: statusMap.get('Retired') ?? 0,
      spare: statusMap.get('Spare') ?? 0,
      inactive: statusMap.get('Inactive') ?? 0,
      totalPurchaseValue: Number(totalPurchaseValue.toFixed(2)),
      totalBookValue: Number(totalBookValue.toFixed(2)),
      totalAccumDepreciation: Number(totalAccumDepreciation.toFixed(2)),
      warrantyExpiringCount: warrantyExpiringSoon.length,
      warrantyExpiredCount: warrantyExpired.length,
    },
    byStatus,
    byType,
    bySite,
    warrantyExpiringSoon,
    warrantyExpired,
    depreciation,
  }
}

async function buildMetersReport(month: string, siteCodes: string[] | null) {
  const monthInfo = parseMonth(month)!
  const previousMonth = previousMonthStr(month)

  // Current month readings
  const deviceWhere: Record<string, unknown> = {}
  if (siteCodes !== null) deviceWhere.site = { in: siteCodes }

  const devices = await db.device.findMany({
    where: deviceWhere,
    select: {
      id: true,
      assetCode: true,
      name: true,
      site: true,
      department: true,
      meterRequired: true,
      lastMeterBw: true,
      lastMeterColor: true,
    },
  })

  const deviceIds = devices.map((d) => d.id)

  const currentReadings = await db.meterReading.findMany({
    where: {
      readingMonth: month,
      deviceId: { in: deviceIds },
    },
    select: {
      deviceId: true,
      pagesBw: true,
      pagesColor: true,
      readingDate: true,
    },
  })

  const prevReadings = await db.meterReading.findMany({
    where: {
      readingMonth: previousMonth,
      deviceId: { in: deviceIds },
    },
    select: {
      deviceId: true,
      pagesBw: true,
      pagesColor: true,
    },
  })

  // Aggregate per device for current month
  const currByDevice = new Map<
    string,
    { bw: number; color: number; lastDate: string | null }
  >()
  for (const r of currentReadings) {
    const entry = currByDevice.get(r.deviceId) ?? {
      bw: 0,
      color: 0,
      lastDate: null,
    }
    entry.bw += r.pagesBw ?? 0
    entry.color += r.pagesColor ?? 0
    if (!entry.lastDate || r.readingDate > entry.lastDate) {
      entry.lastDate = r.readingDate
    }
    currByDevice.set(r.deviceId, entry)
  }

  const prevByDevice = new Map<string, { bw: number; color: number }>()
  for (const r of prevReadings) {
    const entry = prevByDevice.get(r.deviceId) ?? { bw: 0, color: 0 }
    entry.bw += r.pagesBw ?? 0
    entry.color += r.pagesColor ?? 0
    prevByDevice.set(r.deviceId, entry)
  }

  // Paper usage per device
  const paperUsageByDevice = devices
    .map((d) => {
      const cur = currByDevice.get(d.id) ?? { bw: 0, color: 0, lastDate: null }
      return {
        assetCode: d.assetCode,
        name: d.name,
        site: d.site,
        department: d.department ?? '-',
        bw: cur.bw,
        color: cur.color,
        total: cur.bw + cur.color,
        lastReadingDate: cur.lastDate,
      }
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 50)

  // Cost by site
  const costBySiteMap = new Map<string, { bw: number; color: number }>()
  for (const d of devices) {
    const cur = currByDevice.get(d.id) ?? { bw: 0, color: 0, lastDate: null }
    const entry = costBySiteMap.get(d.site) ?? { bw: 0, color: 0 }
    entry.bw += cur.bw
    entry.color += cur.color
    costBySiteMap.set(d.site, entry)
  }
  // Assumed rates (configurable later)
  const BW_RATE = 0.5 // ฿/page
  const COLOR_RATE = 5 // ฿/page
  const costBySite = Array.from(costBySiteMap.entries())
    .map(([site, v]) => ({
      site,
      bw: v.bw,
      color: v.color,
      total: v.bw + v.color,
      cost: Number((v.bw * BW_RATE + v.color * COLOR_RATE).toFixed(2)),
    }))
    .sort((a, b) => b.cost - a.cost)

  // Cost by department
  const costByDeptMap = new Map<string, { bw: number; color: number }>()
  for (const d of devices) {
    const dept = d.department ?? '-'
    const cur = currByDevice.get(d.id) ?? { bw: 0, color: 0, lastDate: null }
    const entry = costByDeptMap.get(dept) ?? { bw: 0, color: 0 }
    entry.bw += cur.bw
    entry.color += cur.color
    costByDeptMap.set(dept, entry)
  }
  const costByDepartment = Array.from(costByDeptMap.entries())
    .map(([department, v]) => ({
      department,
      bw: v.bw,
      color: v.color,
      total: v.bw + v.color,
      cost: Number((v.bw * BW_RATE + v.color * COLOR_RATE).toFixed(2)),
    }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 30)

  // Unmetered devices (meterRequired=true but no reading this month)
  const unmeteredDevices = devices
    .filter((d) => d.meterRequired && !currByDevice.has(d.id))
    .map((d) => ({
      assetCode: d.assetCode,
      name: d.name,
      site: d.site,
      department: d.department ?? '-',
      lastMeterBw: d.lastMeterBw,
      lastMeterColor: d.lastMeterColor,
    }))
    .sort((a, b) => a.site.localeCompare(b.site))

  // Monthly comparison (current vs previous)
  let prevBw = 0
  let prevColor = 0
  for (const v of prevByDevice.values()) {
    prevBw += v.bw
    prevColor += v.color
  }
  let curBw = 0
  let curColor = 0
  for (const v of currByDevice.values()) {
    curBw += v.bw
    curColor += v.color
  }

  const monthlyComparison = [
    {
      month: previousMonth,
      label: new Date(previousMonth + '-01').toLocaleDateString('th-TH', {
        month: 'short',
        year: 'numeric',
      }),
      bw: prevBw,
      color: prevColor,
      total: prevBw + prevColor,
    },
    {
      month,
      label: monthInfo.label,
      bw: curBw,
      color: curColor,
      total: curBw + curColor,
    },
  ]

  return {
    group: 'meters',
    generatedAt: new Date().toISOString(),
    month,
    monthLabel: monthInfo.label,
    site: siteCodes === null ? 'all' : siteCodes.join(','),
    rates: { bwRate: BW_RATE, colorRate: COLOR_RATE },
    summary: {
      totalBw: curBw,
      totalColor: curColor,
      totalSheets: curBw + curColor,
      deviceCount: devices.length,
      meterRequiredCount: devices.filter((d) => d.meterRequired).length,
      unmeteredCount: unmeteredDevices.length,
      totalCost: Number((curBw * BW_RATE + curColor * COLOR_RATE).toFixed(2)),
      prevMonthTotal: prevBw + prevColor,
      growthPct:
        prevBw + prevColor > 0
          ? Number(
              (
                ((curBw + curColor - (prevBw + prevColor)) /
                  (prevBw + prevColor)) *
                100
              ).toFixed(1),
            )
          : 0,
    },
    paperUsageByDevice,
    costBySite,
    costByDepartment,
    unmeteredDevices,
    monthlyComparison,
  }
}

async function buildWorkOrdersReport(month: string, siteCodes: string[] | null) {
  const monthInfo = parseMonth(month)!

  const where: Record<string, unknown> = {
    createdAt: {
      gte: new Date(monthInfo.start + 'T00:00:00'),
      lte: new Date(monthInfo.end + 'T23:59:59'),
    },
  }
  // Apply Site scope via siteCode OR device.site (legacy rows where
  // siteCode was never backfilled fall back to the linked device's site).
  if (siteCodes !== null) {
    where.OR = [
      { siteCode: { in: siteCodes } },
      { siteCode: null, device: { site: { in: siteCodes } } },
    ]
  }

  const workOrders = await db.workOrder.findMany({
    where,
    select: {
      id: true,
      woNumber: true,
      subject: true,
      status: true,
      priority: true,
      assignedTo: true,
      building: true,
      location: true,
      isSpecialFee: true,
      createdAt: true,
      closedAt: true,
      workCompletedAt: true,
      device: { select: { site: true } },
      reviews: { select: { rating: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // All filtering is now done in the DB query (no post-filter needed).
  const filtered = workOrders

  const total = filtered.length

  // by status
  const statusMap = new Map<string, number>()
  for (const w of filtered) {
    statusMap.set(w.status, (statusMap.get(w.status) ?? 0) + 1)
  }
  const byStatus = Array.from(statusMap.entries())
    .map(([name, value]) => ({
      name: STATUS_LABELS_WO[name] ?? name,
      raw: name,
      value,
    }))
    .sort((a, b) => b.value - a.value)

  // by staff
  const staffMap = new Map<
    string,
    { count: number; completed: number; ratings: number[] }
  >()
  for (const w of filtered) {
    const staff = w.assignedTo?.trim() || '— ยังไม่มอบหมาย'
    const entry = staffMap.get(staff) ?? {
      count: 0,
      completed: 0,
      ratings: [],
    }
    entry.count += 1
    if (w.status === 'COMPLETED') entry.completed += 1
    for (const r of w.reviews) entry.ratings.push(r.rating)
    staffMap.set(staff, entry)
  }
  const byStaff = Array.from(staffMap.entries())
    .map(([name, v]) => ({
      name,
      count: v.count,
      completed: v.completed,
      avgRating:
        v.ratings.length > 0
          ? Number(
              (v.ratings.reduce((s, r) => s + r, 0) / v.ratings.length).toFixed(2),
            )
          : null,
    }))
    .sort((a, b) => b.count - a.count)

  // by subject
  const subjectMap = new Map<string, number>()
  for (const w of filtered) {
    const subj = w.subject || '— ไม่ระบุ'
    subjectMap.set(subj, (subjectMap.get(subj) ?? 0) + 1)
  }
  const bySubject = Array.from(subjectMap.entries())
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  // 50-baht special fee cases
  const specialFeeCases = filtered
    .filter((w) => w.isSpecialFee)
    .map((w) => ({
      id: w.id,
      woNumber: w.woNumber,
      subject: w.subject,
      status: w.status,
      statusLabel: STATUS_LABELS_WO[w.status] ?? w.status,
      assignedTo: w.assignedTo ?? '— ยังไม่มอบหมาย',
      building: w.building ?? '-',
      createdAt: w.createdAt.toISOString(),
      closedAt: w.closedAt?.toISOString() ?? null,
    }))

  // ratings distribution
  const allRatings: number[] = []
  for (const w of filtered) {
    for (const r of w.reviews) allRatings.push(r.rating)
  }
  const ratingBuckets = [1, 2, 3, 4, 5].map((star) => ({
    star,
    count: allRatings.filter((r) => r === star).length,
  }))
  const avgRating =
    allRatings.length > 0
      ? Number(
          (allRatings.reduce((s, r) => s + r, 0) / allRatings.length).toFixed(2),
        )
      : null

  return {
    group: 'workorders',
    generatedAt: new Date().toISOString(),
    month,
    monthLabel: monthInfo.label,
    site: siteCodes === null ? 'all' : siteCodes.join(','),
    summary: {
      total,
      pending: statusMap.get('PENDING') ?? 0,
      inProgress: statusMap.get('IN_PROGRESS') ?? 0,
      waitingParts: statusMap.get('WAITING_PARTS') ?? 0,
      completed: statusMap.get('COMPLETED') ?? 0,
      cancelled: statusMap.get('CANCELLED') ?? 0,
      specialFeeCount: specialFeeCases.length,
      avgRating,
      reviewCount: allRatings.length,
    },
    byStatus,
    byStaff,
    bySubject,
    specialFeeCases,
    ratingBuckets,
  }
}

async function buildStockReport(siteCodes: string[] | null) {
  const itemWhere: Record<string, unknown> = {}
  if (siteCodes !== null) itemWhere.site = { in: siteCodes }

  const items = await db.stockItem.findMany({
    where: itemWhere,
    select: {
      id: true,
      productCode: true,
      productName: true,
      category: true,
      quantity: true,
      minQuantity: true,
      unit: true,
      unitCost: true,
      site: true,
    },
    orderBy: { productName: 'asc' },
  })

  const totalItems = items.length
  const totalQuantity = items.reduce((s, i) => s + i.quantity, 0)
  const totalValue = items.reduce(
    (s, i) => s + (i.quantity * (i.unitCost ?? 0)),
    0,
  )

  const lowStock = items
    .filter((i) => i.minQuantity > 0 && i.quantity > 0 && i.quantity <= i.minQuantity)
    .map((i) => ({
      productCode: i.productCode ?? '-',
      productName: i.productName,
      category: i.category ?? '-',
      quantity: i.quantity,
      minQuantity: i.minQuantity,
      unit: i.unit ?? '',
      site: i.site ?? '-',
      shortage: i.minQuantity - i.quantity,
    }))
    .sort((a, b) => a.shortage - b.shortage)

  const outOfStock = items
    .filter((i) => i.quantity === 0)
    .map((i) => ({
      productCode: i.productCode ?? '-',
      productName: i.productName,
      category: i.category ?? '-',
      minQuantity: i.minQuantity,
      unit: i.unit ?? '',
      site: i.site ?? '-',
    }))

  // recent transactions (last 30 days)
  // StockTransaction has no direct `site` foreign key — we filter via
  // the related StockItem.site field (canonical Site predicate), NOT
  // via remark/department contains (which was unreliable: a remark
  // like "รับเข้า UDH/NKP" would match both Sites).
  // When siteCodes is null (superadmin all-sites), no filter is applied.
  // When siteCodes is an empty array (fail-closed), `in: []` matches
  // nothing — see route handler for the empty-array guard.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const txnWhere: Record<string, unknown> = {
    txnDate: { gte: thirtyDaysAgo },
  }
  if (siteCodes !== null) {
    txnWhere.stockItem = { site: { in: siteCodes } }
  }

  const recentTxns = await db.stockTransaction.findMany({
    where: txnWhere,
    select: {
      id: true,
      txnNumber: true,
      type: true,
      productName: true,
      productCode: true,
      quantity: true,
      unit: true,
      txnDate: true,
      requester: true,
      approver: true,
      approvalStatus: true,
      workOrderNo: true,
      cost: true,
    },
    orderBy: { txnDate: 'desc' },
    take: 100,
  })

  const recentTransactions = recentTxns.map((t) => ({
    id: t.id,
    txnNumber: t.txnNumber ?? '-',
    type: t.type,
    typeLabel: t.type === 'IN' ? 'รับเข้า' : t.type === 'OUT' ? 'เบิกออก' : 'ปรับปรุง',
    productName: t.productName ?? '-',
    productCode: t.productCode ?? '-',
    quantity: t.quantity,
    unit: t.unit ?? '',
    txnDate: t.txnDate,
    requester: t.requester ?? '-',
    approver: t.approver ?? '-',
    approvalStatus: t.approvalStatus ?? '-',
    workOrderNo: t.workOrderNo ?? '-',
    cost: t.cost ?? null,
  }))

  // pending approvals — scoped via canonical stockItem.site predicate
  // (see comment above on the recentTxns filter).
  const pendingWhere: Record<string, unknown> = { approvalStatus: 'PENDING' }
  if (siteCodes !== null) {
    pendingWhere.stockItem = { site: { in: siteCodes } }
  }
  const pendingApprovals = await db.stockTransaction.findMany({
    where: pendingWhere,
    select: {
      id: true,
      txnNumber: true,
      productName: true,
      productCode: true,
      quantity: true,
      unit: true,
      type: true,
      requester: true,
      department: true,
      createdAt: true,
      txnDate: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return {
    group: 'stock',
    generatedAt: new Date().toISOString(),
    site: siteCodes === null ? 'all' : siteCodes.join(','),
    summary: {
      totalItems,
      totalQuantity,
      totalValue: Number(totalValue.toFixed(2)),
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      pendingCount: pendingApprovals.length,
      recentTxnCount: recentTransactions.length,
    },
    lowStock,
    outOfStock,
    recentTransactions,
    pendingApprovals: pendingApprovals.map((t) => ({
      id: t.id,
      txnNumber: t.txnNumber ?? '-',
      productName: t.productName ?? '-',
      productCode: t.productCode ?? '-',
      quantity: t.quantity,
      unit: t.unit ?? '',
      type: t.type,
      requester: t.requester ?? '-',
      department: t.department ?? '-',
      createdAt: t.createdAt.toISOString(),
      txnDate: t.txnDate,
    })),
  }
}

async function buildMaintenanceReport(month: string, siteCodes: string[] | null) {
  const monthInfo = parseMonth(month)!

  // Maintenance logs (all-time, but filter for cost analysis)
  const deviceWhere: Record<string, unknown> = {}
  if (siteCodes !== null) deviceWhere.site = { in: siteCodes }

  const devices = await db.device.findMany({
    where: deviceWhere,
    select: { id: true, assetCode: true, name: true, site: true, type: true },
  })
  const deviceMap = new Map(devices.map((d) => [d.id, d]))
  const deviceIds = devices.map((d) => d.id)

  const logs = await db.maintenanceLog.findMany({
    where: { deviceId: { in: deviceIds } },
    select: {
      id: true,
      deviceId: true,
      type: true,
      status: true,
      startDate: true,
      endDate: true,
      cost: true,
      vendor: true,
      description: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  // by device
  const byDeviceMap = new Map<
    string,
    { repairCount: number; totalCost: number; lastRepairDate: string | null }
  >()
  for (const l of logs) {
    const entry = byDeviceMap.get(l.deviceId) ?? {
      repairCount: 0,
      totalCost: 0,
      lastRepairDate: null,
    }
    entry.repairCount += 1
    entry.totalCost += l.cost ?? 0
    if (!entry.lastRepairDate || l.startDate > entry.lastRepairDate) {
      entry.lastRepairDate = l.startDate
    }
    byDeviceMap.set(l.deviceId, entry)
  }
  const byDevice = Array.from(byDeviceMap.entries())
    .map(([deviceId, v]) => {
      const d = deviceMap.get(deviceId)
      return {
        assetCode: d?.assetCode ?? '-',
        name: d?.name ?? '-',
        site: d?.site ?? '-',
        type: d?.type ?? '-',
        repairCount: v.repairCount,
        totalCost: Number(v.totalCost.toFixed(2)),
        lastRepairDate: v.lastRepairDate,
      }
    })
    .sort((a, b) => b.repairCount - a.repairCount || b.totalCost - a.totalCost)
    .slice(0, 50)

  // cost by month (last 6 months including current)
  const monthBuckets: Array<{ month: string; cost: number; count: number }> = []
  const [cy, cm] = month.split('-').map(Number)
  for (let i = 5; i >= 0; i--) {
    const d = new Date(cy, cm - 1 - i, 1)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthBuckets.push({ month: m, cost: 0, count: 0 })
  }
  for (const l of logs) {
    const logMonth = (l.startDate ?? '').slice(0, 7)
    const bucket = monthBuckets.find((b) => b.month === logMonth)
    if (bucket) {
      bucket.cost += l.cost ?? 0
      bucket.count += 1
    }
  }
  const costByMonth = monthBuckets.map((b) => ({
    month: b.month,
    label: new Date(b.month + '-01').toLocaleDateString('th-TH', {
      month: 'short',
      year: 'numeric',
    }),
    cost: Number(b.cost.toFixed(2)),
    count: b.count,
  }))

  // cost by site
  const costBySiteMap = new Map<string, { cost: number; count: number }>()
  for (const l of logs) {
    const d = deviceMap.get(l.deviceId)
    const siteName = d?.site ?? '-'
    const entry = costBySiteMap.get(siteName) ?? { cost: 0, count: 0 }
    entry.cost += l.cost ?? 0
    entry.count += 1
    costBySiteMap.set(siteName, entry)
  }
  const costBySite = Array.from(costBySiteMap.entries())
    .map(([site, v]) => ({
      site,
      cost: Number(v.cost.toFixed(2)),
      count: v.count,
    }))
    .sort((a, b) => b.cost - a.cost)

  // Top parts used (from stock transactions linked to work orders).
  // Filter via canonical stockItem.site predicate (same pattern as
  // buildStockReport's recentTxns). When siteCodes is null (superadmin
  // all-sites), no Site filter is applied.
  const partTxnsWhere: Record<string, unknown> = {
    type: 'OUT',
    workOrderNo: { not: null },
  }
  if (siteCodes !== null) {
    partTxnsWhere.stockItem = { site: { in: siteCodes } }
  }
  const partTxns = await db.stockTransaction.findMany({
    where: partTxnsWhere,
    select: {
      productName: true,
      productCode: true,
      quantity: true,
      cost: true,
      unit: true,
    },
    take: 500,
  })
  const partMap = new Map<
    string,
    { productName: string; productCode: string; quantity: number; totalCost: number }
  >()
  for (const t of partTxns) {
    const key = t.productCode ?? t.productName ?? '-'
    const entry = partMap.get(key) ?? {
      productName: t.productName ?? '-',
      productCode: t.productCode ?? '-',
      quantity: 0,
      totalCost: 0,
    }
    entry.quantity += t.quantity
    entry.totalCost += t.cost ?? 0
    partMap.set(key, entry)
  }
  const topParts = Array.from(partMap.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10)

  // Summary
  const totalCost = logs.reduce((s, l) => s + (l.cost ?? 0), 0)
  const openCount = logs.filter((l) => l.status === 'open').length
  const completedCount = logs.filter((l) => l.status === 'completed').length

  // Current month cost
  const currentMonthCost = logs
    .filter((l) => (l.startDate ?? '').startsWith(month))
    .reduce((s, l) => s + (l.cost ?? 0), 0)

  return {
    group: 'maintenance',
    generatedAt: new Date().toISOString(),
    month,
    monthLabel: monthInfo.label,
    site: siteCodes === null ? 'all' : siteCodes.join(','),
    summary: {
      totalLogs: logs.length,
      totalCost: Number(totalCost.toFixed(2)),
      avgCostPerRepair:
        logs.length > 0 ? Number((totalCost / logs.length).toFixed(2)) : 0,
      openCount,
      completedCount,
      currentMonthCost: Number(currentMonthCost.toFixed(2)),
      deviceWithRepairCount: byDeviceMap.size,
    },
    byDevice,
    costByMonth,
    costBySite,
    topParts,
  }
}

async function buildApprovalsReport(month: string, siteCodes: string[] | null) {
  const monthInfo = parseMonth(month)!

  // Pending stock approvals — scoped via canonical stockItem.site
  // predicate. (StockTransaction has no direct site FK, but it has a
  // required `stockItem` relation whose `site` field is the canonical
  // Site of the transaction.)
  const pendingStockWhere: Record<string, unknown> = { approvalStatus: 'PENDING' }
  if (siteCodes !== null) {
    pendingStockWhere.stockItem = { site: { in: siteCodes } }
  }
  const pendingStock = await db.stockTransaction.findMany({
    where: pendingStockWhere,
    select: {
      id: true,
      txnNumber: true,
      productName: true,
      productCode: true,
      quantity: true,
      unit: true,
      type: true,
      requester: true,
      department: true,
      createdAt: true,
      txnDate: true,
      workOrderNo: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  // Approved/rejected in current month — scoped via canonical
  // stockItem.site predicate (same pattern as pendingStock above).
  const monthStart = new Date(monthInfo.start + 'T00:00:00')
  const monthEnd = new Date(monthInfo.end + 'T23:59:59')
  const approvedTxnsWhere: Record<string, unknown> = {
    approvalStatus: { in: ['APPROVED', 'REJECTED'] },
    approvedAt: { gte: monthInfo.start, lte: monthInfo.end },
  }
  if (siteCodes !== null) {
    approvedTxnsWhere.stockItem = { site: { in: siteCodes } }
  }
  const approvedTxns = await db.stockTransaction.findMany({
    where: approvedTxnsWhere,
    select: {
      id: true,
      txnNumber: true,
      productName: true,
      quantity: true,
      type: true,
      approvalStatus: true,
      approver: true,
      approvedAt: true,
      requester: true,
      rejectReason: true,
    },
    orderBy: { approvedAt: 'desc' },
    take: 100,
  })

  // Pending work orders (status PENDING or WAITING_PARTS)
  const woWhere: Record<string, unknown> = {
    status: { in: ['PENDING', 'WAITING_PARTS'] },
  }
  if (siteCodes !== null) {
    woWhere.OR = [
      { siteCode: { in: siteCodes } },
      { siteCode: null, device: { site: { in: siteCodes } } },
    ]
  }
  const pendingWO = await db.workOrder.findMany({
    where: woWhere,
    select: {
      id: true,
      woNumber: true,
      subject: true,
      status: true,
      priority: true,
      assignedTo: true,
      building: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  // Special fee cases in current month — also scoped by Site
  const specialFeeWhere: Record<string, unknown> = {
    isSpecialFee: true,
    createdAt: { gte: monthStart, lte: monthEnd },
  }
  if (siteCodes !== null) {
    specialFeeWhere.OR = [
      { siteCode: { in: siteCodes } },
      { siteCode: null, device: { site: { in: siteCodes } } },
    ]
  }
  const specialFeeCases = await db.workOrder.findMany({
    where: specialFeeWhere,
    select: {
      id: true,
      woNumber: true,
      subject: true,
      status: true,
      assignedTo: true,
      building: true,
      createdAt: true,
      closedAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  // B5/NF-1/NF-2 FIX: Use AuditLog.siteCode column directly (set-based SQL).
  // Filters by siteCode in the DB query — no entity resolution loop (N+1).
  // Legacy entries (siteCode=null) are excluded for Site-scoped users (fail-closed).
  // A backfill script should populate siteCode for existing entries.
  const APPROVAL_ACTIONS = [
    'STOCK_PENDING_APPROVE',
    'STOCK_PENDING_REJECT',
    'WO_PARTS_APPROVE',
    'GRANT_CREATE',
    'GRANT_UPDATE',
    'GRANT_DELETE',
  ]
  const approvalHistoryWhere: Record<string, unknown> = {
    action: { in: APPROVAL_ACTIONS },
    createdAt: { gte: monthStart, lte: monthEnd },
  }
  if (siteCodes !== null) {
    // Site-scoped user: filter by AuditLog.siteCode directly
    if (siteCodes.length > 0) {
      approvalHistoryWhere.siteCode = { in: siteCodes }
    } else {
      approvalHistoryWhere.siteCode = { equals: '__NO_MATCH__' }
    }
  }
  // superadmin (siteCodes === null) → no siteCode filter → all entries
  const approvalHistory = await db.auditLog.findMany({
    where: approvalHistoryWhere,
    select: {
      id: true,
      action: true,
      entity: true,
      entityId: true,
      summary: true,
      actor: true,
      siteCode: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const approvedCount = approvedTxns.filter((t) => t.approvalStatus === 'APPROVED').length
  const rejectedCount = approvedTxns.filter((t) => t.approvalStatus === 'REJECTED').length

  return {
    group: 'approvals',
    generatedAt: new Date().toISOString(),
    month,
    monthLabel: monthInfo.label,
    site: siteCodes === null ? 'all' : siteCodes.join(','),
    summary: {
      pendingStockCount: pendingStock.length,
      pendingWOCount: pendingWO.length,
      specialFeeCount: specialFeeCases.length,
      approvedCount,
      rejectedCount,
      approvalHistoryCount: approvalHistory.length,
      totalPending:
        pendingStock.length + pendingWO.length + specialFeeCases.length,
    },
    pendingStock: pendingStock.map((t) => ({
      id: t.id,
      txnNumber: t.txnNumber ?? '-',
      productName: t.productName ?? '-',
      productCode: t.productCode ?? '-',
      quantity: t.quantity,
      unit: t.unit ?? '',
      type: t.type,
      requester: t.requester ?? '-',
      department: t.department ?? '-',
      workOrderNo: t.workOrderNo ?? '-',
      createdAt: t.createdAt.toISOString(),
      txnDate: t.txnDate,
    })),
    pendingWO: pendingWO.map((w) => ({
      id: w.id,
      woNumber: w.woNumber ?? '-',
      subject: w.subject,
      status: w.status,
      statusLabel: STATUS_LABELS_WO[w.status] ?? w.status,
      priority: w.priority,
      assignedTo: w.assignedTo ?? '— ยังไม่มอบหมาย',
      building: w.building ?? '-',
      createdAt: w.createdAt.toISOString(),
    })),
    specialFeeCases: specialFeeCases.map((w) => ({
      id: w.id,
      woNumber: w.woNumber ?? '-',
      subject: w.subject,
      status: w.status,
      statusLabel: STATUS_LABELS_WO[w.status] ?? w.status,
      assignedTo: w.assignedTo ?? '— ยังไม่มอบหมาย',
      building: w.building ?? '-',
      createdAt: w.createdAt.toISOString(),
      closedAt: w.closedAt?.toISOString() ?? null,
    })),
    approvalHistory: approvalHistory.map((l) => ({
      id: l.id,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId ?? '-',
      summary: l.summary,
      actor: l.actor,
      createdAt: l.createdAt.toISOString(),
    })),
    approvedTransactions: approvedTxns.map((t) => ({
      id: t.id,
      txnNumber: t.txnNumber ?? '-',
      productName: t.productName ?? '-',
      quantity: t.quantity,
      type: t.type,
      approvalStatus: t.approvalStatus,
      approver: t.approver ?? '-',
      requester: t.requester ?? '-',
      approvedAt: t.approvedAt,
      rejectReason: t.rejectReason,
    })),
  }
}

// ── Route handler ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DEVICES')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  // ── Build authorization context for Site scope ──
  // Previously this route treated site=all as "no filter" for ALL users,
  // meaning a non-admin with VIEW_DEVICES could see cross-Site aggregate
  // data. Now we enforce Site scope: non-superadmin users can only see
  // their authorized Sites, and explicit site=CODE requests are validated
  // against the user's scope.
  const ctx = await buildAuthorizationContext(
    auth.user,
    auth.row.id,
    auth.row.allowedSites,
  )

  try {
    const { searchParams } = new URL(req.url)
    const group = String(searchParams.get('group') ?? '') as ReportGroup
    const monthParam = searchParams.get('month') ?? currentMonthStr()
    const siteParam = searchParams.get('site') ?? 'all'

    if (!VALID_GROUPS.includes(group)) {
      return NextResponse.json(
        { error: `Invalid group. Must be one of: ${VALID_GROUPS.join(', ')}` },
        { status: 400 },
      )
    }

    const monthInfo = parseMonth(monthParam)
    if (!monthInfo && group !== 'devices' && group !== 'stock') {
      return NextResponse.json(
        { error: 'Invalid month format. Use YYYY-MM.' },
        { status: 400 },
      )
    }

    // ── Resolve effective Site scope as siteCodes[] ──
    //
    // Previously this route resolved a single `site: string | null`
    // (null = all sites). For multi-Site non-superadmin users, that
    // forced us to pick the FIRST Site and silently drop the others —
    // a scope leak when those other Sites had data the caller was
    // entitled to see (but didn't), and an availability bug when the
    // caller expected an aggregate across all their Sites.
    //
    // Now we resolve `siteCodes: string[] | null`:
    //   • null           → no filter (superadmin or legacy ALL fallback
    //                      only). Means "all Sites in the system".
    //   • string[]       → restrict to those Sites. Empty array means
    //                      "no Sites" (fail-closed).
    //
    // Mapping rules:
    //   • superadmin + site=all   → null
    //   • superadmin + site=CODE  → [CODE]
    //   • non-superadmin + site=all → ctx.siteScope.siteCodes (ALL of
    //                                 their Sites, not just the first)
    //   • non-superadmin + site=CODE → validate CODE in scope → [CODE]
    //   • non-superadmin + no grants → empty list (handled below as
    //                                 a fail-closed return).
    let siteCodes: string[] | null
    if (ctx.isSuperAdmin) {
      siteCodes = siteParam === 'all' ? null : [siteParam.toUpperCase()]
    } else if (ctx.siteScope.kind === 'none') {
      // No grants at all — return empty (fail-closed).
      return NextResponse.json({
        group,
        generatedAt: new Date().toISOString(),
        month: monthParam,
        site: siteParam,
        summary: {},
        error: 'ไม่มี Site ที่ได้รับอนุญาต — ติดต่อผู้ดูแลเพื่อขอสิทธิ์เข้าถึง',
      })
    } else if (ctx.siteScope.kind === 'sites') {
      const allowed = ctx.siteScope.siteCodes
      if (siteParam === 'all') {
        // Multi-Site aggregate across ALL of the user's Sites.
        siteCodes = allowed.length > 0 ? allowed : []
      } else {
        // Explicit site=CODE — validate against scope
        const requested = siteParam.toUpperCase()
        if (!allowed.includes(requested)) {
          // Return 404 to avoid revealing the existence of out-of-scope Sites
          return NextResponse.json(
            { error: 'ไม่พบรายการที่ระบุ หรือคุณไม่มีสิทธิ์เข้าถึง' },
            { status: 404 },
          )
        }
        siteCodes = [requested]
      }
    } else {
      // siteScope.kind === 'all' (legacy ALL fallback for non-superadmin)
      // This is the dual-read fallback. We treat it the same as superadmin
      // for now, but this path should disappear after migration.
      siteCodes = siteParam === 'all' ? null : [siteParam.toUpperCase()]
    }

    // Fail-closed: if non-superadmin ended up with an empty siteCodes
    // array (no grants resolved to a Sites list), don't fall through to
    // a null filter (which would mean "all Sites").
    if (!ctx.isSuperAdmin && siteCodes !== null && siteCodes.length === 0) {
      return NextResponse.json({
        group,
        generatedAt: new Date().toISOString(),
        month: monthParam,
        site: siteParam,
        summary: {},
        error: 'ไม่มี Site ที่ได้รับอนุญาต — ติดต่อผู้ดูแลเพื่อขอสิทธิ์เข้าถึง',
      })
    }

    let data: unknown
    switch (group) {
      case 'devices':
        data = await buildDevicesReport(siteCodes)
        break
      case 'meters':
        data = await buildMetersReport(monthParam, siteCodes)
        break
      case 'workorders':
        data = await buildWorkOrdersReport(monthParam, siteCodes)
        break
      case 'stock':
        data = await buildStockReport(siteCodes)
        break
      case 'maintenance':
        data = await buildMaintenanceReport(monthParam, siteCodes)
        break
      case 'approvals':
        data = await buildApprovalsReport(monthParam, siteCodes)
        break
      default:
        return NextResponse.json({ error: 'Unknown group' }, { status: 400 })
    }

    // Log report access (audit) — non-blocking
    void logAudit(
      'GENERATE',
      'Report',
      group,
      `ดูรายงาน ${group} (${monthParam}${siteCodes ? '/' + siteCodes.join(',') : ''})`,
      { group, month: monthParam, site: siteParam },
    )

    return NextResponse.json(data)
  } catch (err) {
    console.error('GET /api/reports/unified', err)
    const message = err instanceof Error ? err.message : 'Failed to build report'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
