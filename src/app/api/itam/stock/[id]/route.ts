import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { canAccessSite } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

interface Params {
  params: Promise<{ id: string }>
}

// GET /api/itam/stock/[id] — single item + last 10 transactions
//   Returns: { item, transactions }
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'VIEW_DEVICES')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const { id } = await params
    const item = await db.stockItem.findUnique({ where: { id } })
    if (!item) return NextResponse.json({ error: 'ไม่พบสินค้า' }, { status: 404 })
    if (!canAccessSite(user, item.site)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึงสินค้าในสาขานี้' }, { status: 403 })
    }

    const transactions = await db.stockTransaction.findMany({
      where: { stockItemId: id },
      orderBy: { txnDate: 'desc' },
      take: 10,
    })

    return NextResponse.json({ item, transactions })
  } catch (err) {
    console.error('GET /api/itam/stock/[id]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// PUT /api/itam/stock/[id] — update item fields
//   Body: any subset of StockItem fields (except id/itemId/createdAt/updatedAt)
//   Returns: { item }
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'DEVICE_EDIT')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const { id } = await params
    const existing = await db.stockItem.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'ไม่พบสินค้า' }, { status: 404 })
    if (!canAccessSite(user, existing.site)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขสินค้าในสาขานี้' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>

    // Build update payload — only fields that are present
    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (typeof body.category === 'string') data.category = body.category.trim() || null
    if (typeof body.brand === 'string') data.brand = body.brand.trim() || null
    if (typeof body.model === 'string') data.model = body.model.trim() || null
    if (typeof body.unit === 'string' && body.unit.trim()) data.unit = body.unit.trim()
    if (body.quantity != null && body.quantity !== '' && Number.isFinite(Number(body.quantity))) {
      data.quantity = Number(body.quantity)
    }
    if (body.minQuantity != null && body.minQuantity !== '' && Number.isFinite(Number(body.minQuantity))) {
      data.minQuantity = Number(body.minQuantity)
    }
    if (body.maxQuantity != null && body.maxQuantity !== '' && Number.isFinite(Number(body.maxQuantity))) {
      data.maxQuantity = Number(body.maxQuantity)
    }
    if (body.unitCost != null && body.unitCost !== '' && Number.isFinite(Number(body.unitCost))) {
      data.unitCost = Number(body.unitCost)
    } else if (body.unitCost === '' || body.unitCost === null) {
      data.unitCost = null
    }
    if (typeof body.location === 'string') data.location = body.location.trim() || null
    if (typeof body.site === 'string') data.site = body.site.trim() || null
    if (typeof body.compatibleDevices === 'string') data.compatibleDevices = body.compatibleDevices.trim() || null
    if (typeof body.remark === 'string') data.remark = body.remark.trim() || null
    if (typeof body.active === 'boolean') data.active = body.active

    const updated = await db.stockItem.update({ where: { id }, data })

    await logAudit(
      'STOCK_UPDATE',
      'StockItem',
      id,
      `แก้ไขสินค้าสต๊อก "${updated.name}"`,
      { itemId: updated.itemId, fields: Object.keys(data) },
      user.email,
    )

    return NextResponse.json({ item: updated })
  } catch (err) {
    console.error('PUT /api/itam/stock/[id]', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

// DELETE /api/itam/stock/[id]
//   - Soft delete (active=false) if the item has transactions.
//   - Hard delete if it has no transactions.
//   Returns: { ok: true, hard: boolean }
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'DEVICE_EDIT')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const { id } = await params
    const existing = await db.stockItem.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'ไม่พบสินค้า' }, { status: 404 })
    if (!canAccessSite(user, existing.site)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ลบสินค้าในสาขานี้' }, { status: 403 })
    }

    const txnCount = await db.stockTransaction.count({ where: { stockItemId: id } })
    let hard = false
    if (txnCount === 0) {
      await db.stockItem.delete({ where: { id } })
      hard = true
    } else {
      await db.stockItem.update({ where: { id }, data: { active: false } })
    }

    await logAudit(
      'STOCK_DELETE',
      'StockItem',
      id,
      hard
        ? `ลบสินค้าสต๊อก "${existing.name}" (ลบถาวร)`
        : `ปิดใช้งานสินค้าสต๊อก "${existing.name}" (มีรายการเข้า-ออก)`,
      { itemId: existing.itemId, name: existing.name, hard, txnCount },
      user.email,
    )

    return NextResponse.json({ ok: true, hard })
  } catch (err) {
    console.error('DELETE /api/itam/stock/[id]', err)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
