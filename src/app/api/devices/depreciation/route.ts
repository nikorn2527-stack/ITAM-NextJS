import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

type DepreciationStatus = 'depreciated' | 'depreciating' | 'new'

interface DepreciationDevice {
  id: string
  assetCode: string
  name: string
  brand: string
  model: string
  site: string
  purchasePrice: number
  salvageValue: number
  usefulLife: number
  purchaseDate: string | null
  ageInMonths: number
  annualDepreciation: number
  accumulatedDepreciation: number
  currentValue: number
  depreciationPercent: number
  status: DepreciationStatus
}

function computeAgeInMonths(purchaseDate: string | null): number {
  if (!purchaseDate || !/^\d{4}-\d{2}-\d{2}/.test(purchaseDate)) return 0
  const start = new Date(purchaseDate.slice(0, 10) + 'T00:00:00')
  if (Number.isNaN(start.getTime())) return 0
  const now = new Date()
  let months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth())
  if (now.getDate() < start.getDate()) months -= 1
  return Math.max(0, months)
}

export async function GET() {
  try {
    const devices = await db.device.findMany({
      where: { purchasePrice: { not: null } },
      select: {
        id: true,
        assetCode: true,
        name: true,
        brand: true,
        model: true,
        site: true,
        purchasePrice: true,
        salvageValue: true,
        usefulLife: true,
        purchaseDate: true,
      },
      orderBy: { assetCode: 'asc' },
    })

    const entries: DepreciationDevice[] = devices.map((d) => {
      const purchasePrice = d.purchasePrice ?? 0
      const salvageValue = Math.min(d.salvageValue ?? 0, purchasePrice)
      const usefulLife = Math.max(1, d.usefulLife ?? 60)
      const ageInMonths = computeAgeInMonths(d.purchaseDate)

      // Straight-line: monthly depreciation = (cost - salvage) / usefulLifeMonths
      const monthlyDepreciation =
        (purchasePrice - salvageValue) / usefulLife
      const annualDepreciation = monthlyDepreciation * 12
      const accumulatedDepreciation = Math.min(
        Math.max(0, monthlyDepreciation * ageInMonths),
        Math.max(0, purchasePrice - salvageValue),
      )
      const currentValue = Math.max(
        salvageValue,
        purchasePrice - accumulatedDepreciation,
      )
      const depreciationPercent =
        purchasePrice > 0
          ? Math.round(
              (accumulatedDepreciation / purchasePrice) * 100,
            )
          : 0

      let status: DepreciationStatus = 'depreciating'
      if (currentValue <= salvageValue) status = 'depreciated'
      else if (ageInMonths < 1) status = 'new'

      return {
        id: d.id,
        assetCode: d.assetCode,
        name: d.name,
        brand: d.brand,
        model: d.model,
        site: d.site,
        purchasePrice,
        salvageValue,
        usefulLife,
        purchaseDate: d.purchaseDate,
        ageInMonths,
        annualDepreciation,
        accumulatedDepreciation,
        currentValue,
        depreciationPercent,
        status,
      }
    })

    entries.sort((a, b) => b.currentValue - a.currentValue)

    const totalValue = entries.reduce((s, e) => s + e.currentValue, 0)
    const totalOriginal = entries.reduce((s, e) => s + e.purchasePrice, 0)
    const totalDepreciated = entries.reduce(
      (s, e) => s + e.accumulatedDepreciation,
      0,
    )
    const fullyDepreciatedCount = entries.filter(
      (e) => e.status === 'depreciated',
    ).length
    const avgDepreciationPercent =
      entries.length === 0
        ? 0
        : Math.round(
            entries.reduce((s, e) => s + e.depreciationPercent, 0) /
              entries.length,
          )

    return NextResponse.json({
      devices: entries,
      summary: {
        totalValue,
        totalOriginal,
        totalDepreciated,
        avgDepreciationPercent,
        fullyDepreciatedCount,
        deviceCount: entries.length,
      },
    })
  } catch (err) {
    console.error('GET /api/devices/depreciation', err)
    return NextResponse.json(
      { error: 'Failed to fetch depreciation data' },
      { status: 500 },
    )
  }
}
