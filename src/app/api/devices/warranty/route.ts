import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Warranty status endpoint.
 *
 * NOTE: The Device model has NO `assetCode`, `name`, `purchaseDate`, or
 * `warrantyMonths` fields. The real schema (see prisma/schema.prisma) is:
 *   - `assetNo`     (was assetCode)
 *   - `brand` + `model`  (was name)
 *   - `warrantyEnd` (ISO date string — the ACTUAL expiry, not computed)
 *   - `installDate` (the closest thing to a purchase/acquisition date)
 *
 * This route uses `warrantyEnd` directly as the warranty expiry date and
 * computes days-remaining from there. The response shape preserves both the
 * legacy `{ devices, summary }` shape used by the dashboard frontend AND the
 * simplified `{ expiring, expired, counts }` shape from the spec.
 */

type WarrantyStatus = 'active' | 'expiring' | 'expired' | 'unknown'

interface WarrantyEntry {
  id: string
  assetCode: string
  name: string
  brand: string | null
  model: string | null
  site: string | null
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}/

/** Build a display name from brand + model (falls back to assetNo). */
function deviceName(d: {
  brand: string | null
  model: string | null
  assetNo: string
}): string {
  if (d.brand && d.model) return `${d.brand} ${d.model}`.trim()
  if (d.brand) return d.brand
  if (d.model) return d.model
  return d.assetNo
}

/**
 * Compute warranty status from `warrantyEnd` (YYYY-MM-DD).
 *  - days < 0      → 'expired'
 *  - 0 ≤ days ≤ 30 → 'expiring'
 *  - days > 30     → 'active'
 *  - no/invalid date → 'unknown'
 */
function computeStatus(warrantyEnd: string | null): {
  status: WarrantyStatus
  daysUntilExpiry: number | null
  expiryISO: string | null
} {
  if (!warrantyEnd || !DATE_RE.test(warrantyEnd)) {
    return { status: 'unknown', daysUntilExpiry: null, expiryISO: null }
  }
  const expiryISO = warrantyEnd.slice(0, 10)
  const expiry = new Date(expiryISO + 'T00:00:00')
  if (Number.isNaN(expiry.getTime())) {
    return { status: 'unknown', daysUntilExpiry: null, expiryISO: null }
  }
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffMs = expiry.getTime() - today.getTime()
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (days < 0) return { status: 'expired', daysUntilExpiry: days, expiryISO }
  if (days <= 30) return { status: 'expiring', daysUntilExpiry: days, expiryISO }
  return { status: 'active', daysUntilExpiry: days, expiryISO }
}

export async function GET() {
  try {
    const devices = await db.device.findMany({
      select: {
        id: true,
        assetNo: true,
        brand: true,
        model: true,
        site: true,
        installDate: true,
        warrantyEnd: true,
      },
      orderBy: { assetNo: 'asc' },
    })

    const entries: WarrantyEntry[] = devices.map((d) => {
      const { status, daysUntilExpiry, expiryISO } = computeStatus(d.warrantyEnd)
      return {
        id: d.id,
        assetCode: d.assetNo, // keep legacy field name for frontend compat
        name: deviceName(d),
        brand: d.brand,
        model: d.model,
        site: d.site,
        // No `purchaseDate` field on Device — expose `installDate` for the
        // frontend's display column (the type allows null).
        purchaseDate: d.installDate,
        // No `warrantyMonths` field — surface 0 so the legacy type is happy.
        warrantyMonths: 0,
        warrantyExpiry: expiryISO,
        status,
        daysUntilExpiry,
      }
    })

    // Sort: expired → expiring → active → unknown; within a status, soonest
    // expiry first (unknown falls back to assetNo alphabetical).
    entries.sort((a, b) => {
      const p = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]
      if (p !== 0) return p
      if (a.status === 'unknown') return a.assetCode.localeCompare(b.assetCode)
      const ad = a.daysUntilExpiry ?? Number.POSITIVE_INFINITY
      const bd = b.daysUntilExpiry ?? Number.POSITIVE_INFINITY
      return ad - bd
    })

    const expiring = entries.filter((e) => e.status === 'expiring')
    const expired = entries.filter((e) => e.status === 'expired')
    const active = entries.filter((e) => e.status === 'active')
    const unknown = entries.filter((e) => e.status === 'unknown')

    const summary = {
      active: active.length,
      expiring: expiring.length,
      expired: expired.length,
      unknown: unknown.length,
    }

    // Shape: keep the legacy `{ devices, summary }` shape (dashboard frontend
    // reads `summary.expiring` / `summary.expired`) AND add the spec's
    // `{ expiring, expired, counts }` shape for new consumers.
    return NextResponse.json({
      devices: entries,
      summary,
      expiring,
      expired,
      counts: {
        expiring: expiring.length,
        expired: expired.length,
      },
    })
  } catch (err) {
    console.error('GET /api/devices/warranty', err)
    return NextResponse.json(
      { error: 'Failed to fetch warranty status' },
      { status: 500 },
    )
  }
}
