/**
 * GET /api/cron/daily-report
 *
 * Cron job — runs daily at 8:00 AM Bangkok time.
 *
 * What it does:
 * 1. Aggregates yesterday's metrics (WOs created/completed, meter readings, stock moves)
 * 2. Identifies low-stock items (below reorder point)
 * 3. Identifies warranties expiring within 90 days
 * 4. Sends notifications to admins (in-app + audit log)
 * 5. Optionally sends email summary (if SMTP configured)
 *
 * Setup in vercel.json:
 *   "crons": [{ "path": "/api/cron/daily-report", "schedule": "0 8 * * *" }]
 *
 * Security: requires CRON_SECRET header.
 *
 * Vercel Hobby limit: 2 cron jobs (this is the 2nd, after keepalive).
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
// Use max duration (Hobby: 300s) — daily report may take time for big datasets
export const maxDuration = 60

interface DailyReportData {
  date: string
  workOrders: {
    created: number
    completed: number
    cancelled: number
    pendingTotal: number
  }
  meters: {
    newReadings: number
  }
  stock: {
    newTransactions: number
    lowStockItems: number
  }
  devices: {
    newDevices: number
    warrantyExpiringSoon: number
  }
  auditLogs: {
    totalYesterday: number
    topAction: string | null
  }
}

export async function GET(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Calculate "yesterday" in Bangkok timezone (UTC+7)
    const now = new Date()
    const bangkokOffset = 7 * 60 * 60 * 1000
    const bangkokNow = new Date(now.getTime() + bangkokOffset)
    const yesterdayStart = new Date(bangkokNow)
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1)
    yesterdayStart.setUTCHours(0, 0, 0, 0)
    const yesterdayEnd = new Date(yesterdayStart)
    yesterdayEnd.setUTCHours(23, 59, 59, 999)

    const dateStr = yesterdayStart.toISOString().slice(0, 10)

    // Run all queries in parallel
    const [
      woCreated,
      woCompleted,
      woCancelled,
      woPending,
      meterReadings,
      stockTxns,
      stockLow,
      newDevices,
      warrantyExpiring,
      auditLogs,
      topActionRow,
    ] = await Promise.all([
      // Work Orders created yesterday
      db.workOrder.count({
        where: { createdAt: { gte: yesterdayStart, lte: yesterdayEnd } },
      }),
      // Work Orders completed yesterday
      db.workOrder.count({
        where: { closedAt: { gte: yesterdayStart, lte: yesterdayEnd } },
      }),
      // Work Orders cancelled yesterday
      db.workOrder.count({
        where: { canceledAt: { gte: yesterdayStart, lte: yesterdayEnd } },
      }),
      // Total pending WOs (still open)
      db.workOrder.count({
        where: { status: { in: ['PENDING', 'IN_PROGRESS', 'WAITING_PARTS'] } },
      }),
      // Meter readings yesterday
      db.meterReading.count({
        where: { createdAt: { gte: yesterdayStart, lte: yesterdayEnd } },
      }),
      // Stock transactions yesterday
      db.stockTransaction.count({
        where: { createdAt: { gte: yesterdayStart, lte: yesterdayEnd } },
      }),
      // Low-stock items (below reorder point)
      db.stockItem.count({
        where: { quantity: { lte: db.stockItem.fields.minQuantity } },
      }),
      // New devices added yesterday
      db.device.count({
        where: { createdAt: { gte: yesterdayStart, lte: yesterdayEnd } },
      }),
      // Devices with warranty expiring within 90 days
      db.device.count({
        where: {
          warrantyExpiry: {
            gte: now,
            lte: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      // Total audit logs yesterday
      db.auditLog.count({
        where: { createdAt: { gte: yesterdayStart, lte: yesterdayEnd } },
      }),
      // Top action yesterday
      db.auditLog.groupBy({
        by: ['action'],
        where: { createdAt: { gte: yesterdayStart, lte: yesterdayEnd } },
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 1,
      }),
    ])

    const report: DailyReportData = {
      date: dateStr,
      workOrders: {
        created: woCreated,
        completed: woCompleted,
        cancelled: woCancelled,
        pendingTotal: woPending,
      },
      meters: { newReadings: meterReadings },
      stock: {
        newTransactions: stockTxns,
        lowStockItems: stockLow,
      },
      devices: {
        newDevices,
        warrantyExpiringSoon: warrantyExpiring,
      },
      auditLogs: {
        totalYesterday: auditLogs,
        topAction: topActionRow[0]?.action ?? null,
      },
    }

    // Log the report generation
    await db.auditLog.create({
      data: {
        action: 'DAILY_REPORT',
        entity: 'System',
        entityId: null,
        summary: `Daily report for ${dateStr}: WO +${woCreated}/✓${woCompleted}, Meters: ${meterReadings}, Low stock: ${stockLow}`,
        detail: JSON.stringify(report),
        actor: 'cron:daily-report',
        siteCode: null,
      },
    })

    return NextResponse.json({
      ok: true,
      report,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Daily report failed:', err)
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.message : 'Unknown error') : 'Internal server error' },
      { status: 500 },
    )
  }
}
