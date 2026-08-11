import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

type WarrantyStatus = 'active' | 'expiring' | 'expired' | 'unknown'
type Recommendation = 'replace' | 'monitor' | 'ok'

interface LifecycleDevice {
  id: string
  assetCode: string
  name: string
  brand: string
  model: string
  site: string
  status: string
  purchaseDate: string | null
  ageInMonths: number
  warrantyStatus: WarrantyStatus
  warrantyExpiry: string | null
  replacementScore: number
  recommendation: Recommendation
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

function computeWarrantyStatus(
  expiryDate: Date | null,
): { status: WarrantyStatus } {
  if (!expiryDate || Number.isNaN(expiryDate.getTime())) {
    return { status: 'unknown' }
  }
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffMs = expiryDate.getTime() - today.getTime()
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (days < 0) return { status: 'expired' }
  if (days <= 30) return { status: 'expiring' }
  return { status: 'active' }
}

function computeAgeInMonths(purchaseDate: string | null): number {
  if (!purchaseDate || !/^\d{4}-\d{2}-\d{2}/.test(purchaseDate)) return 0
  const start = new Date(purchaseDate.slice(0, 10) + 'T00:00:00')
  if (Number.isNaN(start.getTime())) return 0
  const now = new Date()
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth())
  // subtract 1 if we haven't hit the day-of-month yet this month
  if (now.getDate() < start.getDate()) {
    return Math.max(0, months - 1)
  }
  return Math.max(0, months)
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
        status: true,
        purchaseDate: true,
        warrantyMonths: true,
      },
      orderBy: { assetCode: 'asc' },
    })

    const entries: LifecycleDevice[] = devices.map((d) => {
      const expiryDate =
        d.purchaseDate && /^\d{4}-\d{2}-\d{2}/.test(d.purchaseDate)
          ? addMonthsISO(d.purchaseDate.slice(0, 10), d.warrantyMonths)
          : null
      const expiryISO =
        expiryDate && !Number.isNaN(expiryDate.getTime())
          ? expiryDate.toISOString().slice(0, 10)
          : null
      const { status: warrantyStatus } = computeWarrantyStatus(expiryDate)
      const ageInMonths = computeAgeInMonths(d.purchaseDate)

      // Replacement score (0-100):
      //   - base by age: ramps from 0 at 0 months → 60 at 60 months (5y).
      //     +1.0 per month up to 60 months; beyond 60 months adds 0.4/mo.
      //   - +20 if warranty expired
      //   - +10 if warranty expiring
      //   - +15 if status=repair
      //   - clamp 0..100
      let score = 0
      if (ageInMonths > 0) {
        if (ageInMonths <= 60) {
          score += ageInMonths * 1.0
        } else {
          score += 60 + (ageInMonths - 60) * 0.4
        }
      }
      if (warrantyStatus === 'expired') score += 20
      else if (warrantyStatus === 'expiring') score += 10
      if (d.status === 'repair') score += 15
      score = Math.max(0, Math.min(100, Math.round(score)))

      const recommendation: Recommendation =
        score >= 70 ? 'replace' : score >= 40 ? 'monitor' : 'ok'

      return {
        id: d.id,
        assetCode: d.assetCode,
        name: d.name,
        brand: d.brand,
        model: d.model,
        site: d.site,
        status: d.status,
        purchaseDate: d.purchaseDate,
        ageInMonths,
        warrantyStatus,
        warrantyExpiry: expiryISO,
        replacementScore: score,
        recommendation,
      }
    })

    entries.sort((a, b) => b.replacementScore - a.replacementScore)

    const total = entries.length
    const replaceCount = entries.filter(
      (e) => e.recommendation === 'replace',
    ).length
    const monitorCount = entries.filter(
      (e) => e.recommendation === 'monitor',
    ).length
    const okCount = entries.filter((e) => e.recommendation === 'ok').length
    const avgAge =
      total === 0
        ? 0
        : Math.round(
            entries.reduce((s, e) => s + e.ageInMonths, 0) / total,
          )

    return NextResponse.json({
      devices: entries,
      summary: {
        total,
        replace: replaceCount,
        monitor: monitorCount,
        ok: okCount,
        avgAge,
      },
    })
  } catch (err) {
    console.error('GET /api/devices/lifecycle', err)
    return NextResponse.json(
      { error: 'Failed to fetch lifecycle data' },
      { status: 500 },
    )
  }
}
