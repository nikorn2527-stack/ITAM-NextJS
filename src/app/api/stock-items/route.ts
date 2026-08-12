import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

/** Parse a Float; returns null when missing/invalid. */
function optFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, n)
}

/** Parse an Int; returns 0 when missing/invalid. */
function optInt(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === '') return fallback
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.round(n)
}

/**
 * Generate the next sequential product code: STK-NNNN.
 * Finds existing codes matching STK-\d+, takes the max, +1.
 */
async function nextProductCode(): Promise<string> {
  const items = await db.stockItem.findMany({
    where: { productCode: { startsWith: 'STK-' } },
    select: { productCode: true },
  })
  let max = 0
  for (const it of items) {
    const m = /^STK-(\d+)$/.exec(it.productCode)
    if (m) {
      const n = parseInt(m[1], 10)
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return `STK-${String(max + 1).padStart(4, '0')}`
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.trim() ?? ''
    const category = searchParams.get('category')?.trim() ?? ''
    const lowStock = searchParams.get('lowStock') ?? ''
    const activeOnly = (searchParams.get('activeOnly') ?? '1') === '1'
    const page = Math.max(1, optInt(searchParams.get('page'), 1))
    const pageSize = Math.max(
      1,
      Math.min(200, optInt(searchParams.get('pageSize'), 50)),
    )

    const where: Record<string, unknown> = {}
    if (activeOnly) where.active = true
    if (category) where.category = category
    if (search) {
      where.OR = [
        { productCode: { contains: search } },
        { productName: { contains: search } },
        { brand: { contains: search } },
        { model: { contains: search } },
        { compatibleDevices: { contains: search } },
      ]
    }

    const [total, items] = await Promise.all([
      db.stockItem.count({ where }),
      db.stockItem.findMany({
        where,
        orderBy: [
          { category: 'asc' },
          { productCode: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    // Apply the low-stock rule (quantity <= minQuantity) post-fetch when requested.
    let filtered = items
    if (lowStock === '1') {
      filtered = items.filter((it) => it.quantity <= it.minQuantity)
    }

    // ---- Stats (computed on the full active set, ignoring pagination) ----
    const allActive = await db.stockItem.findMany({
      where: activeOnly ? { active: true } : undefined,
      select: {
        quantity: true,
        unitCost: true,
        minQuantity: true,
        createdAt: true,
      },
    })
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const stats = {
      total: allActive.length,
      lowStock: allActive.filter((it) => it.quantity <= it.minQuantity).length,
      totalValue: allActive.reduce(
        (sum, it) => sum + (it.unitCost ?? 0) * it.quantity,
        0,
      ),
      thisMonth: allActive.filter((it) => it.createdAt >= monthStart).length,
    }

    return NextResponse.json({
      data: filtered,
      pagination: {
        page,
        pageSize,
        total: lowStock === '1' ? filtered.length : total,
        totalPages: Math.max(
          1,
          Math.ceil((lowStock === '1' ? filtered.length : total) / pageSize),
        ),
      },
      stats,
    })
  } catch (err) {
    console.error('GET /api/stock-items', err)
    return NextResponse.json(
      { error: 'Failed to fetch stock items' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.productName || typeof body.productName !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: productName' },
        { status: 400 },
      )
    }

    const productCode = body.productCode
      ? String(body.productCode).trim()
      : await nextProductCode()

    // Ensure uniqueness — if the supplied (or generated) code already exists,
    // surface a clear 400 instead of letting Prisma throw.
    const existing = await db.stockItem.findUnique({
      where: { productCode },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json(
        { error: `รหัสสินค้า ${productCode} มีอยู่แล้ว` },
        { status: 400 },
      )
    }

    const created = await db.stockItem.create({
      data: {
        productCode,
        productName: String(body.productName).trim(),
        category: body.category ? String(body.category).trim() : null,
        brand: body.brand ? String(body.brand).trim() : null,
        model: body.model ? String(body.model).trim() : null,
        unit: body.unit ? String(body.unit).trim() : 'ชิ้น',
        quantity: optInt(body.quantity, 0),
        minQuantity: optInt(body.minQuantity, 0),
        maxQuantity: optInt(body.maxQuantity, 0),
        unitCost: optFloat(body.unitCost),
        location: body.location ? String(body.location).trim() : null,
        site: body.site ? String(body.site).trim() : null,
        compatibleDevices: body.compatibleDevices
          ? String(body.compatibleDevices).trim()
          : null,
        remark: body.remark ? String(body.remark).trim() : null,
        active: body.active !== undefined ? Boolean(body.active) : true,
      },
    })

    await logAudit(
      'CREATE',
      'StockItem',
      created.id,
      `เพิ่มสินค้า ${created.productCode} (${created.productName})`,
      {
        productCode: created.productCode,
        productName: created.productName,
        category: created.category,
        quantity: created.quantity,
      },
    )

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/stock-items', err)
    const message = err instanceof Error ? err.message : 'Failed to create stock item'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
