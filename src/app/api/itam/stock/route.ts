import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { siteFilterForUser } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

// GET /api/itam/stock?category=&site=&lowStock=1&q=search
//   Returns: { items: StockItem[] }
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'VIEW_DEVICES')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')?.trim() ?? ''
    const site = searchParams.get('site')?.trim() ?? ''
    const lowStock = searchParams.get('lowStock') === '1'
    const q = searchParams.get('q')?.trim() ?? ''

    const where: Record<string, unknown> = { AND: [] as unknown[] }

    // Site filter — StockItem has its own `site` field directly
    const sf = siteFilterForUser(user)
    if (Object.keys(sf).length) (where.AND as unknown[]).push(sf)
    // Explicit ?site= filter (additional)
    if (site) (where.AND as unknown[]).push({ site })

    if (category) (where.AND as unknown[]).push({ category })
    if (lowStock) {
      ;(where.AND as unknown[]).push({ minQuantity: { gt: 0 } })
      // quantity <= minQuantity — Prisma doesn't have a cross-field compare,
      // so we filter that part in memory after fetch.
    }
    if (q) {
      ;(where.AND as unknown[]).push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { brand: { contains: q, mode: 'insensitive' } },
          { model: { contains: q, mode: 'insensitive' } },
          { itemId: { contains: q, mode: 'insensitive' } },
        ],
      })
    }
    if (Array.isArray(where.AND) && where.AND.length === 0) delete where.AND

    const rows = await db.stockItem.findMany({
      where,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    })

    // Apply cross-field lowStock filter in memory
    let items = rows
    if (lowStock) {
      items = rows.filter((r) => r.quantity <= r.minQuantity)
    }

    // KPI stat — count of transactions this month (server-side, single query).
    // Returned alongside items as an additive `stats` field; does not change
    // the `{ items }` contract.
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const txnThisMonth = await db.stockTransaction.count({
      where: { txnDate: { gte: monthStart } },
    })

    return NextResponse.json({ items, stats: { txnThisMonth } })
  } catch (err) {
    console.error('GET /api/itam/stock', err)
    return NextResponse.json({ error: 'Failed to load stock items' }, { status: 500 })
  }
}

// POST /api/itam/stock — create a new stock item
//   Body: { name, category?, brand?, model?, unit?, quantity?, minQuantity?,
//           maxQuantity?, unitCost?, location?, site?, compatibleDevices?, remark? }
//   Returns: { item }
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'DEVICE_EDIT')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'กรุณาระบุชื่อสินค้า' }, { status: 400 })
    }

    // Auto-generate itemId: STK-XXXX
    const count = await db.stockItem.count()
    const itemId = `STK-${String(count + 1).padStart(4, '0')}`

    const created = await db.stockItem.create({
      data: {
        itemId,
        name,
        category: typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null,
        brand: typeof body.brand === 'string' && body.brand.trim() ? body.brand.trim() : null,
        model: typeof body.model === 'string' && body.model.trim() ? body.model.trim() : null,
        unit: typeof body.unit === 'string' && body.unit.trim() ? body.unit.trim() : 'ชิ้น',
        quantity: Number.isFinite(body.quantity) ? Number(body.quantity) : 0,
        minQuantity: Number.isFinite(body.minQuantity) ? Number(body.minQuantity) : 0,
        maxQuantity: Number.isFinite(body.maxQuantity) ? Number(body.maxQuantity) : 0,
        unitCost: body.unitCost != null && body.unitCost !== '' ? Number(body.unitCost) : null,
        location: typeof body.location === 'string' && body.location.trim() ? body.location.trim() : null,
        site: typeof body.site === 'string' && body.site.trim() ? body.site.trim() : null,
        compatibleDevices: typeof body.compatibleDevices === 'string' && body.compatibleDevices.trim() ? body.compatibleDevices.trim() : null,
        remark: typeof body.remark === 'string' && body.remark.trim() ? body.remark.trim() : null,
        active: true,
      },
    })

    await logAudit(
      'STOCK_CREATE',
      'StockItem',
      created.id,
      `สร้างสินค้าสต๊อก "${created.name}" (${itemId})`,
      { itemId, name: created.name, category: created.category, quantity: created.quantity },
      user.email,
    )

    return NextResponse.json({ item: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/itam/stock', err)
    return NextResponse.json({ error: 'Failed to create stock item' }, { status: 500 })
  }
}
