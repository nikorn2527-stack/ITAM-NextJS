import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { db } from '@/lib/db'
import { demoFilter } from '@/lib/demo-mode'

// Heavy operation — needs longer timeout (Vercel Hobby: max 60s)
export const maxDuration = 60

/**
 * GET /api/devices/depreciation
 *
 * Calculates straight-line depreciation for all devices that have
 * financial fields (purchasePrice, usefulLife).
 *
 * Formula (straight-line):
 *   annualDepreciation = (purchasePrice - salvageValue) / usefulLife
 *   accumulatedDepreciation = annualDepreciation × yearsElapsed
 *   bookValue = purchasePrice - accumulatedDepreciation
 *
 * Devices without financial data are excluded (not errored).
 *
 * Phase 2 will add AssetCategory model so default usefulLife/salvageValue
 * can come from the device's category instead of per-device entry.
 */

interface DepreciationDevice {
  id: string
  assetCode: string
  name: string
  type: string
  site: string
  purchasePrice: number
  salvageValue: number
  usefulLife: number
  purchaseDate: string | null
  annualDepreciation: number
  accumulatedDepreciation: number
  bookValue: number
  depreciationPercent: number
  yearsElapsed: number
  fullyDepreciated: boolean
  status: 'calculated' | 'no_price' | 'no_life' | 'no_date'
}

function calculateYearsElapsed(purchaseDate: string | null): number {
  if (!purchaseDate) return 0
  try {
    const purchase = new Date(purchaseDate.length > 10 ? purchaseDate : purchaseDate + 'T00:00:00')
    const now = new Date()
    const diffMs = now.getTime() - purchase.getTime()
    const years = diffMs / (1000 * 60 * 60 * 24 * 365.25)
    return Math.max(0, years)
  } catch {
    return 0
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DEVICES')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const isDemoUser = auth.isDemo
    const siteFilter = isDemoUser ? { isDemo: true } : {}

    const devices = await db.device.findMany({
      where: {
        ...siteFilter,
        status: { notIn: ['Disposed', 'Retired'] },
      },
      select: {
        id: true,
        assetCode: true,
        name: true,
        type: true,
        site: true,
        purchasePrice: true,
        salvageValue: true,
        usefulLife: true,
        purchaseDate: true,
        isDemo: true,
      },
      orderBy: { assetCode: 'asc' },
    })

    const items: DepreciationDevice[] = []
    let totalOriginal = 0
    let totalBookValue = 0
    let totalDepreciated = 0
    let fullyDepreciatedCount = 0

    for (const d of devices) {
      const price = d.purchasePrice ? Number(d.purchasePrice) : null
      const salvage = d.salvageValue ? Number(d.salvageValue) : 0
      const life = d.usefulLife ?? null

      // Skip devices without purchase price
      if (price == null || price <= 0) {
        items.push({
          id: d.id, assetCode: d.assetCode, name: d.name, type: d.type, site: d.site,
          purchasePrice: 0, salvageValue: 0, usefulLife: 0, purchaseDate: d.purchaseDate,
          annualDepreciation: 0, accumulatedDepreciation: 0, bookValue: 0,
          depreciationPercent: 0, yearsElapsed: 0, fullyDepreciated: false,
          status: 'no_price',
        })
        continue
      }

      // Skip devices without useful life
      if (life == null || life <= 0) {
        items.push({
          id: d.id, assetCode: d.assetCode, name: d.name, type: d.type, site: d.site,
          purchasePrice: price, salvageValue: salvage, usefulLife: 0, purchaseDate: d.purchaseDate,
          annualDepreciation: 0, accumulatedDepreciation: 0, bookValue: price,
          depreciationPercent: 0, yearsElapsed: 0, fullyDepreciated: false,
          status: 'no_life',
        })
        totalOriginal += price
        totalBookValue += price
        continue
      }

      const yearsElapsed = calculateYearsElapsed(d.purchaseDate)
      const depreciableAmount = price - salvage
      const annualDepreciation = depreciableAmount / life
      const accumulatedDepreciation = Math.min(annualDepreciation * yearsElapsed, depreciableAmount)
      const bookValue = Math.max(salvage, price - accumulatedDepreciation)
      const depreciationPercent = price > 0 ? (accumulatedDepreciation / price) * 100 : 0
      const fullyDepreciated = bookValue <= salvage || yearsElapsed >= life

      items.push({
        id: d.id, assetCode: d.assetCode, name: d.name, type: d.type, site: d.site,
        purchasePrice: price, salvageValue: salvage, usefulLife: life, purchaseDate: d.purchaseDate,
        annualDepreciation: Math.round(annualDepreciation * 100) / 100,
        accumulatedDepreciation: Math.round(accumulatedDepreciation * 100) / 100,
        bookValue: Math.round(bookValue * 100) / 100,
        depreciationPercent: Math.round(depreciationPercent * 100) / 100,
        yearsElapsed: Math.round(yearsElapsed * 100) / 100,
        fullyDepreciated,
        status: 'calculated',
      })

      totalOriginal += price
      totalBookValue += bookValue
      totalDepreciated += accumulatedDepreciation
      if (fullyDepreciated) fullyDepreciatedCount++
    }

    const avgDepreciationPercent = totalOriginal > 0
      ? Math.round((totalDepreciated / totalOriginal) * 10000) / 100
      : 0

    const calculatedCount = items.filter((i) => i.status === 'calculated').length

    return NextResponse.json({
      configured: true,
      items,
      devices: items, // backward compat for existing frontend
      summary: {
        totalValue: Math.round(totalBookValue * 100) / 100,
        totalOriginal: Math.round(totalOriginal * 100) / 100,
        totalDepreciated: Math.round(totalDepreciated * 100) / 100,
        avgDepreciationPercent,
        fullyDepreciatedCount,
        deviceCount: items.length,
        calculatedCount,
        noPriceCount: items.filter((i) => i.status === 'no_price').length,
        noLifeCount: items.filter((i) => i.status === 'no_life').length,
      },
    })
  } catch (err) {
    console.error('GET /api/devices/depreciation', err)
    return NextResponse.json(
      { error: 'Failed to calculate depreciation' },
      { status: 500 },
    )
  }
}
