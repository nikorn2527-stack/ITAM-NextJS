import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { canAccessSite } from '@/lib/auth'

// GET /api/itam/license-records?assetNo=
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'VIEW_DEVICES')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const { searchParams } = new URL(req.url)
    const assetNo = searchParams.get('assetNo')?.trim() ?? ''
    const where: Record<string, unknown> = {}
    if (assetNo) where.Asset_No = assetNo

    // Site-level filter via device relation when assetNo present
    if (user.role !== 'admin' && user.role !== 'superadmin' && assetNo) {
      const device = await db.device.findUnique({ where: { assetCode: assetNo }, select: { site: true } })
      if (device && !canAccessSite(user, device.site)) {
        return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึงลิขสิทธิ์ของอุปกรณ์ในสาขานี้' }, { status: 403 })
      }
    }

    const records = await db.licenseRecord.findMany({ where, orderBy: { Software: 'asc' } })
    return NextResponse.json({ records })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// POST — create license record (requires DEVICE_EDIT)
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'DEVICE_EDIT')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const body = await req.json()
    if (!body.software) return NextResponse.json({ error: 'software required' }, { status: 400 })

    // If asset-bound, verify site access
    if (body.assetNo) {
      const device = await db.device.findUnique({ where: { assetCode: body.assetNo }, select: { site: true } })
      if (device && !canAccessSite(user, device.site)) {
        return NextResponse.json({ error: 'ไม่มีสิทธิ์ผูกลิขสิทธิ์กับอุปกรณ์ในสาขานี้' }, { status: 403 })
      }
    }

    const created = await db.licenseRecord.create({
      data: {
        License_ID: body.licenseId || null,
        Asset_No: body.assetNo || null,
        Software: body.software,
        LicenseType: body.licenseType || null,
        License_Key: body.licenseKey || null,
        Quantity: body.quantity || 1,
        Expiry_Date: body.expiryDate || null,
        Remark: body.remark || null,
      },
    })

    try {
      await db.auditLog.create({
        data: {
          action: 'LICENSE_CREATE',
          entity: 'LicenseRecord',
          entityId: created.id,
          summary: `เพิ่มลิขสิทธิ์ ${body.software}`,
          actor: user.email,
          detail: JSON.stringify({ software: body.software, assetCode: body.assetNo || null }),
        },
      })
    } catch { /* ignore */ }

    return NextResponse.json({ record: created }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
