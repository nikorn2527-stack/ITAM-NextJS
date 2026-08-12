// ============================================================
// Dashboard API (Task ID: RBAC-DASHBOARD)
// ============================================================
// GET /api/dashboard
//   คืนข้อมูลจริงรวมจากทั้ง 3 ระบบ (Devices / WorkOrders / Stock)
//   บวก alert lists (low stock / pending WO / expiring warranty)
//
// Response shape (see task spec):
//   {
//     devices:    { total, active, byType[], bySite[] },
//     workOrders: { total, pending, inProgress, waitingParts, completed,
//                   cancelled, byPriority[], recent[], avgRating },
//     stock:      { totalItems, lowStock, totalValue, pendingApprovals,
//                   recentTransactions[] },
//     alerts:     { lowStockItems[], pendingWOs[], expiringWarranties[] }
//   }
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// 30 days from now in ms — for "expiring warranty" + "pending > 24h" alerts
const DAY_MS = 24 * 60 * 60 * 1000

export async function GET(_req: NextRequest) {
  try {
    const now = Date.now()
    const todayISO = new Date().toISOString().slice(0, 10)
    const in30Days = new Date(now + 30 * DAY_MS).toISOString().slice(0, 10)
    const yesterday = new Date(now - DAY_MS)

    // ── Devices ─────────────────────────────────────────────
    const devices = await db.device.findMany({
      select: {
        id: true,
        assetCode: true,
        name: true,
        type: true,
        status: true,
        site: true,
        department: true,
        brand: true,
        model: true,
        purchaseDate: true,
        warrantyEnd: true,
        warrantyMonths: true,
      },
    })

    const devicesTotal = devices.length
    const devicesActive = devices.filter(
      (d) => d.status?.toLowerCase() === 'active',
    ).length

    // byType (top types by count, descending)
    const typeMap = new Map<string, number>()
    for (const d of devices) {
      const key = d.type || 'อื่น ๆ'
      typeMap.set(key, (typeMap.get(key) ?? 0) + 1)
    }
    const devicesByType = Array.from(typeMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    // bySite
    const siteMap = new Map<string, number>()
    for (const d of devices) {
      const key = d.site || 'ไม่ระบุ'
      siteMap.set(key, (siteMap.get(key) ?? 0) + 1)
    }
    const devicesBySite = Array.from(siteMap.entries())
      .map(([site, count]) => ({ site, count }))
      .sort((a, b) => b.count - a.count)

    // Expiring warranties (warrantyEnd within 30 days from today)
    const expiringWarranties = devices
      .map((d) => ({
        id: d.id,
        assetCode: d.assetCode,
        name: d.name,
        site: d.site,
        warrantyEnd: d.warrantyEnd,
      }))
      .filter((d) => {
        if (!d.warrantyEnd) return false
        const we = d.warrantyEnd.slice(0, 10)
        return we >= todayISO && we <= in30Days
      })
      .slice(0, 20)

    // ── Work Orders ─────────────────────────────────────────
    const workOrders = await db.workOrder.findMany({
      select: {
        id: true,
        woNumber: true,
        subject: true,
        status: true,
        priority: true,
        reporterName: true,
        reporterEmail: true,
        building: true,
        location: true,
        assignedTo: true,
        createdAt: true,
        updatedAt: true,
        workCompletedAt: true,
        closedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const woTotal = workOrders.length
    const woPending = workOrders.filter((w) => w.status === 'PENDING').length
    const woInProgress = workOrders.filter(
      (w) => w.status === 'IN_PROGRESS',
    ).length
    const woWaitingParts = workOrders.filter(
      (w) => w.status === 'WAITING_PARTS',
    ).length
    const woCompleted = workOrders.filter(
      (w) => w.status === 'COMPLETED',
    ).length
    const woCancelled = workOrders.filter(
      (w) => w.status === 'CANCELLED',
    ).length

    // byPriority
    const priorityMap = new Map<string, number>()
    for (const w of workOrders) {
      const key = w.priority || 'ปกติ'
      priorityMap.set(key, (priorityMap.get(key) ?? 0) + 1)
    }
    const woByPriority = Array.from(priorityMap.entries())
      .map(([priority, count]) => ({ priority, count }))
      .sort((a, b) => b.count - a.count)

    // Recent 5 work orders (newest first)
    const woRecent = workOrders.slice(0, 5).map((w) => ({
      id: w.id,
      woNumber: w.woNumber,
      subject: w.subject,
      status: w.status,
      priority: w.priority,
      reporterName: w.reporterName,
      reporterEmail: w.reporterEmail,
      building: w.building,
      location: w.location,
      assignedTo: w.assignedTo,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    }))

    // Pending WOs waiting > 24h (PENDING or IN_PROGRESS/WAITING_PARTS
    // with updatedAt older than 24h)
    const pendingWOs = workOrders
      .filter((w) => {
        if (
          w.status === 'COMPLETED' ||
          w.status === 'CANCELLED'
        ) {
          return false
        }
        const ref = w.updatedAt ?? w.createdAt
        return ref.getTime() < yesterday.getTime()
      })
      .slice(0, 20)
      .map((w) => ({
        id: w.id,
        woNumber: w.woNumber,
        subject: w.subject,
        status: w.status,
        priority: w.priority,
        reporterName: w.reporterName,
        building: w.building,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
        waitingHours: Math.floor(
          (now - (w.updatedAt ?? w.createdAt).getTime()) / (1000 * 60 * 60),
        ),
      }))

    // Average rating from WorkOrderReview
    const reviews = await db.workOrderReview.findMany({
      select: { rating: true },
    })
    const avgRating =
      reviews.length > 0
        ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
        : 0

    // ── Stock ───────────────────────────────────────────────
    const stockItems = await db.stockItem.findMany({
      select: {
        id: true,
        productCode: true,
        productName: true,
        category: true,
        brand: true,
        model: true,
        unit: true,
        quantity: true,
        minQuantity: true,
        maxQuantity: true,
        unitCost: true,
        totalValue: true,
        site: true,
        location: true,
        active: true,
      },
    })

    const stockTotalItems = stockItems.length
    const stockLowStock = stockItems.filter(
      (s) => s.quantity <= s.minQuantity,
    ).length
    const stockTotalValue = stockItems.reduce((sum, s) => {
      const v =
        typeof s.totalValue === 'number' && s.totalValue > 0
          ? s.totalValue
          : (s.unitCost ?? 0) * s.quantity
      return sum + v
    }, 0)

    // Pending approvals — StockTransactions with approvalStatus='PENDING'
    const pendingTxns = await db.stockTransaction.findMany({
      where: { approvalStatus: 'PENDING' },
      select: {
        id: true,
        txnNumber: true,
        stockItemId: true,
        productName: true,
        type: true,
        quantity: true,
        requester: true,
        department: true,
        purpose: true,
        approvalStatus: true,
        createdAt: true,
        txnDate: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    const stockPendingApprovals = pendingTxns.length

    // Low stock items list (top 20, by how far below min)
    const lowStockItems = stockItems
      .filter((s) => s.quantity <= s.minQuantity)
      .map((s) => ({
        id: s.id,
        productCode: s.productCode,
        productName: s.productName,
        category: s.category,
        brand: s.brand,
        quantity: s.quantity,
        minQuantity: s.minQuantity,
        unit: s.unit,
        site: s.site,
        shortfall: s.minQuantity - s.quantity,
      }))
      .sort((a, b) => b.shortfall - a.shortfall)
      .slice(0, 20)

    // Recent transactions (latest 5)
    const recentTxns = await db.stockTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        txnNumber: true,
        productName: true,
        type: true,
        quantity: true,
        unit: true,
        requester: true,
        performedBy: true,
        approvalStatus: true,
        createdAt: true,
        txnDate: true,
      },
    })
    const stockRecentTransactions = recentTxns.map((t) => ({
      id: t.id,
      txnNumber: t.txnNumber,
      productName: t.productName,
      type: t.type,
      quantity: t.quantity,
      unit: t.unit,
      requester: t.requester,
      performedBy: t.performedBy,
      approvalStatus: t.approvalStatus,
      createdAt: t.createdAt,
      txnDate: t.txnDate,
    }))

    return NextResponse.json({
      devices: {
        total: devicesTotal,
        active: devicesActive,
        byType: devicesByType,
        bySite: devicesBySite,
      },
      workOrders: {
        total: woTotal,
        pending: woPending,
        inProgress: woInProgress,
        waitingParts: woWaitingParts,
        completed: woCompleted,
        cancelled: woCancelled,
        byPriority: woByPriority,
        recent: woRecent,
        avgRating: Number(avgRating.toFixed(2)),
      },
      stock: {
        totalItems: stockTotalItems,
        lowStock: stockLowStock,
        totalValue: stockTotalValue,
        pendingApprovals: stockPendingApprovals,
        recentTransactions: stockRecentTransactions,
      },
      alerts: {
        lowStockItems,
        pendingWOs,
        expiringWarranties,
      },
      meta: {
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    console.error('GET /api/dashboard', err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Failed to fetch dashboard',
      },
      { status: 500 },
    )
  }
}
