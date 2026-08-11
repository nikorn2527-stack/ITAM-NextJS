import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// --- Types ---
type Severity = 'expired' | 'expiring' | 'warning' | 'info'

interface BaseNotif {
  id: string
  type: 'warranty' | 'meter' | 'cycle' | 'audit'
  severity: Severity
  title: string
  subtitle: string
  /** ISO date used for "newer than lastReadAt" comparison on the client. */
  timestamp: string
  /** Where clicking should take the user. */
  action?:
    | { page: 'devices'; deviceId?: string; warrantyFilter?: 'expiring' | 'expired' }
    | { page: 'meter'; meterAction?: string }
    | { page: 'settings'; settingsTab?: string }
}

interface WarrantyNotif extends BaseNotif {
  type: 'warranty'
  deviceId: string
  assetCode: string
  name: string
  expiryDate: string | null
  daysOverdue: number | null
}

interface MeterNotif extends BaseNotif {
  type: 'meter'
  deviceId: string
  assetCode: string
  name: string
  daysSinceLastReading: number | null
}

interface CycleNotif extends BaseNotif {
  type: 'cycle'
  cycleName: string
  endDate: string
  daysRemaining: number
}

interface AuditNotif extends BaseNotif {
  type: 'audit'
  summary: string
}

type Notif = WarrantyNotif | MeterNotif | CycleNotif | AuditNotif

// --- Constants ---
const METERABLE_TYPES = new Set(['PRINTER', 'COPIER', 'MFP'])
const SEVERITY_PRIORITY: Record<Severity, number> = {
  expired: 0,
  expiring: 1,
  warning: 2,
  info: 3,
}

function addMonthsISO(iso: string, months: number): Date {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return new Date(NaN)
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  if (d.getDate() < day) d.setDate(0)
  return d
}

export async function GET() {
  try {
    const notifications: Notif[] = []

    // --- 1. Warranty alerts ---
    const devices = await db.device.findMany({
      select: {
        id: true,
        assetCode: true,
        name: true,
        brand: true,
        model: true,
        site: true,
        purchaseDate: true,
        warrantyMonths: true,
        type: true,
        updatedAt: true,
      },
      orderBy: { assetCode: 'asc' },
    })

    for (const d of devices) {
      if (!d.purchaseDate || !/^\d{4}-\d{2}-\d{2}/.test(d.purchaseDate)) continue
      const expiry = addMonthsISO(d.purchaseDate.slice(0, 10), d.warrantyMonths)
      if (Number.isNaN(expiry.getTime())) continue
      const today = new Date()
      const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const diffMs = expiry.getTime() - todayMid.getTime()
      const days = Math.round(diffMs / (1000 * 60 * 60 * 24))
      const expiryISO = expiry.toISOString().slice(0, 10)

      if (days < 0) {
        notifications.push({
          id: `warranty-expired-${d.id}`,
          type: 'warranty',
          severity: 'expired',
          title: `รับประกันหมดแล้ว — ${d.name}`,
          subtitle: `${d.assetCode} · หมด ${expiryISO} (${Math.abs(days)} วันที่แล้ว)`,
          timestamp: d.updatedAt.toISOString(),
          deviceId: d.id,
          assetCode: d.assetCode,
          name: d.name,
          expiryDate: expiryISO,
          daysOverdue: Math.abs(days),
          action: { page: 'devices', deviceId: d.id, warrantyFilter: 'expired' },
        })
      } else if (days <= 30) {
        notifications.push({
          id: `warranty-expiring-${d.id}`,
          type: 'warranty',
          severity: 'expiring',
          title: `รับประกันใกล้หมด — ${d.name}`,
          subtitle: `${d.assetCode} · จะหมดใน ${days} วัน (${expiryISO})`,
          timestamp: d.updatedAt.toISOString(),
          deviceId: d.id,
          assetCode: d.assetCode,
          name: d.name,
          expiryDate: expiryISO,
          daysOverdue: days,
          action: { page: 'devices', deviceId: d.id, warrantyFilter: 'expiring' },
        })
      }
    }

    // --- 2. Meter reminders (unread meterable devices in active cycle) ---
    const activeCycle = await db.cycle.findFirst({
      where: { status: 'active' },
      orderBy: { startDate: 'desc' },
    })

    if (activeCycle) {
      const meterableDevices = devices.filter((d) =>
        METERABLE_TYPES.has(d.type.toUpperCase()),
      )

      // Readings in this cycle, grouped by deviceId
      const readings = await db.meterReading.findMany({
        where: { cycleId: activeCycle.id },
        select: { deviceId: true, date: true, createdAt: true },
        orderBy: { date: 'desc' },
      })
      const readDeviceMap = new Map<string, { date: string; createdAt: Date }>()
      for (const r of readings) {
        if (!readDeviceMap.has(r.deviceId)) {
          readDeviceMap.set(r.deviceId, { date: r.date, createdAt: r.createdAt })
        }
      }

      const todayISO = new Date().toISOString().slice(0, 10)
      for (const d of meterableDevices) {
        if (readDeviceMap.has(d.id)) continue
        const referenceDate = d.purchaseDate ?? d.updatedAt.toISOString().slice(0, 10)
        const daysSince = Math.max(
          0,
          Math.round(
            (new Date(todayISO).getTime() - new Date(referenceDate).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
        notifications.push({
          id: `meter-unread-${d.id}`,
          type: 'meter',
          severity: 'info',
          title: `ยังไม่ได้จดมิเตอร์ — ${d.name}`,
          subtitle: `${d.assetCode} · รอบ "${activeCycle.name}" · ${daysSince} วัน`,
          timestamp: d.updatedAt.toISOString(),
          deviceId: d.id,
          assetCode: d.assetCode,
          name: d.name,
          daysSinceLastReading: daysSince,
          action: { page: 'meter', meterAction: 'open-cycle' },
        })
      }

      // --- 3. Cycle ending soon (within 7 days) ---
      const end = new Date(activeCycle.endDate + 'T00:00:00')
      const now = new Date()
      const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const diffMs = end.getTime() - todayMid.getTime()
      const daysRemaining = Math.round(diffMs / (1000 * 60 * 60 * 24))
      if (daysRemaining >= 0 && daysRemaining <= 7) {
        notifications.push({
          id: `cycle-ending-${activeCycle.id}`,
          type: 'cycle',
          severity: 'warning',
          title: `รอบจดมิเตอร์ใกล้จบ — ${activeCycle.name}`,
          subtitle: `จะสิ้นสุดใน ${daysRemaining} วัน (${activeCycle.endDate})`,
          timestamp: activeCycle.updatedAt.toISOString(),
          cycleName: activeCycle.name,
          endDate: activeCycle.endDate,
          daysRemaining,
          action: { page: 'meter', meterAction: 'open-cycle' },
        })
      }
    }

    // --- 4. Recent audit activity (last 3 CREATE/DELETE/BULK_*) ---
    const recentAudit = await db.auditLog.findMany({
      where: {
        OR: [
          { action: 'CREATE' },
          { action: 'DELETE' },
          { action: { startsWith: 'BULK_' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    })
    for (const a of recentAudit) {
      notifications.push({
        id: `audit-${a.id}`,
        type: 'audit',
        severity: 'info',
        title: a.summary,
        subtitle: `${a.action} · ${a.entity} · ${a.createdAt.toLocaleString('th-TH', {
          dateStyle: 'short',
          timeStyle: 'short',
        })}`,
        timestamp: a.createdAt.toISOString(),
        summary: a.summary,
        action: { page: 'settings', settingsTab: 'audit' },
      })
    }

    // Sort by severity priority, then by timestamp desc
    notifications.sort((a, b) => {
      const p = SEVERITY_PRIORITY[a.severity] - SEVERITY_PRIORITY[b.severity]
      if (p !== 0) return p
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    })

    const counts = {
      total: notifications.length,
      expired: notifications.filter((n) => n.severity === 'expired').length,
      expiring: notifications.filter((n) => n.severity === 'expiring').length,
      warning: notifications.filter((n) => n.severity === 'warning').length,
      info: notifications.filter((n) => n.severity === 'info').length,
    }

    return NextResponse.json({ notifications, counts })
  } catch (err) {
    console.error('GET /api/notifications', err)
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 },
    )
  }
}
