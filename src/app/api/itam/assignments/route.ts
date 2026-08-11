import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { siteFilterForUser, canAccessSite } from '@/lib/auth'

// GET /api/itam/assignments?assetNo=&status=
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'VIEW_DEVICES')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const { searchParams } = new URL(req.url)
    const assetNo = searchParams.get('assetNo')?.trim() ?? ''
    const status = searchParams.get('status')?.trim() ?? ''
    const where: Record<string, unknown> = { AND: [] as unknown[] }
    if (assetNo) (where.AND as unknown[]).push({ assetNo })
    if (status) (where.AND as unknown[]).push({ status })

    // Site-level filter via device relation
    const sf = siteFilterForUser(user)
    if (Object.keys(sf).length) (where.AND as unknown[]).push({ device: sf })
    if (Array.isArray(where.AND) && where.AND.length === 0) delete where.AND

    const assignments = await db.assignment.findMany({
      where,
      orderBy: { checkoutDate: 'desc' },
      include: { device: { select: { assetNo: true, brand: true, model: true, site: true } } },
    })
    return NextResponse.json({ assignments })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// POST — checkout device (requires DEVICE_TRANSFER)
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'DEVICE_TRANSFER')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const body = await req.json()
    if (!body.assetNo || !body.assignee || !body.checkoutDate) {
      return NextResponse.json({ error: 'assetNo, assignee, checkoutDate required' }, { status: 400 })
    }
    // Site access check
    const device = await db.device.findUnique({ where: { assetNo: body.assetNo } })
    if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    if (!canAccessSite(user, device.site)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์มอบหมายอุปกรณ์ในสาขานี้' }, { status: 403 })
    }

    const existing = await db.assignment.findFirst({
      where: { assetNo: body.assetNo, status: 'active' },
    })
    if (existing) {
      return NextResponse.json({ error: 'อุปกรณ์นี้ถูกมอบหมายแล้ว' }, { status: 409 })
    }
    const created = await db.assignment.create({
      data: {
        assetNo: body.assetNo,
        assignee: body.assignee,
        assigneeRole: body.assigneeRole || null,
        department: body.department || null,
        checkoutDate: body.checkoutDate,
        expectedReturnDate: body.expectedReturnDate || null,
        status: 'active',
        notes: body.notes || null,
      },
    })

    try {
      await db.auditLog.create({
        data: {
          timestamp: new Date().toISOString(),
          action: 'ASSIGN',
          user: user.email,
          details: JSON.stringify({ assetNo: body.assetNo, assignee: body.assignee }),
        },
      })
    } catch { /* ignore */ }

    return NextResponse.json({ assignment: created }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
