import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

type WarrantyStatus = 'active' | 'expiring' | 'expired' | 'unknown'

interface WarrantyEntry {
  id: string
  assetCode: string
  name: string
  brand: string
  model: string
  site: string
  purchaseDate: string | null
  warrantyMonths: number
  warrantyExpiry: string | null
  status: WarrantyStatus
  daysUntilExpiry: number | null
}

const STATUS_PRIORITY: Record<WarrantyStatus, number> = {
  expired: 0,
  expiring: 1,
  active: 2,
  unknown: 3,
}

function computeStatus(expiry: Date | null): {
  status: WarrantyStatus
  daysUntilExpiry: number | null
} {
  if (!expiry) return { status: 'unknown', daysUntilExpiry: null }
  const now = new Date()
  // zero out time for day-precision diff
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffMs = expiry.getTime() - today.getTime()
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (days < 0) return { status: 'expired', daysUntilExpiry: days }
  if (days <= 30) return { status: 'expiring', daysUntilExpiry: days }
  return { status: 'active', daysUntilExpiry: days }
}

function addMonthsISO(iso: string, months: number): Date {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return new Date(NaN)
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  // handle month overflow (e.g. Jan 31 + 1 month = Mar 3) by clamping to last day
  if (d.getDate() < day) d.setDate(0)
  return d
}

export async function GET() {
  try {
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
      },
      orderBy: { assetCode: 'asc' },
    })

    const entries: WarrantyEntry[] = devices.map((d) => {
      const expiryDate =
        d.purchaseDate && /^\d{4}-\d{2}-\d{2}/.test(d.purchaseDate)
          ? addMonthsISO(d.purchaseDate.slice(0, 10), d.warrantyMonths)
          : null
      const expiryISO = expiryDate && !Number.isNaN(expiryDate.getTime())
        ? expiryDate.toISOString().slice(0, 10)
        : null
      const { status, daysUntilExpiry } = computeStatus(expiryDate)
      return {
        id: d.id,
        assetCode: d.assetCode,
        name: d.name,
        brand: d.brand,
        model: d.model,
        site: d.site,
        purchaseDate: d.purchaseDate,
        warrantyMonths: d.warrantyMonths,
        warrantyExpiry: expiryISO,
        status,
        daysUntilExpiry,
      }
    })

    entries.sort((a, b) => {
      const p = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]
      if (p !== 0) return p
      // Within same status, soonest expiry first (unknown last)
      if (a.status === 'unknown') return a.assetCode.localeCompare(b.assetCode)
      const ad = a.daysUntilExpiry ?? Number.POSITIVE_INFINITY
      const bd = b.daysUntilExpiry ?? Number.POSITIVE_INFINITY
      return ad - bd
    })

    const summary = {
      active: entries.filter((e) => e.status === 'active').length,
      expiring: entries.filter((e) => e.status === 'expiring').length,
      expired: entries.filter((e) => e.status === 'expired').length,
      unknown: entries.filter((e) => e.status === 'unknown').length,
    }

    return NextResponse.json({ devices: entries, summary })
  } catch (err) {
    console.error('GET /api/devices/warranty', err)
    return NextResponse.json(
      { error: 'Failed to fetch warranty status' },
      { status: 500 },
    )
  }
}
