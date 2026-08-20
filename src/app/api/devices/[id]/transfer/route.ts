import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

type TransferRow = {
  fromDepartment: string | null
  toDepartment: string | null
  fromDepartmentCode: string | null
  toDepartmentCode: string | null
  [key: string]: unknown
}

/** Keep legacy response aliases while persisting canonical Prisma field names. */
function toLegacyTransferShape<T extends TransferRow>(transfer: T) {
  return {
    ...transfer,
    fromDept: transfer.fromDepartment,
    toDept: transfer.toDepartment,
    fromDeptCode: transfer.fromDepartmentCode,
    toDeptCode: transfer.toDepartmentCode,
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const transfers = await db.deviceTransfer.findMany({
      where: { deviceId: id },
      orderBy: [{ transferDate: 'desc' }, { createdAt: 'desc' }],
    })
    return NextResponse.json({
      transfers: transfers.map((transfer) => toLegacyTransferShape(transfer)),
    })
  } catch (err) {
    console.error('GET /api/devices/[id]/transfer', err)
    return NextResponse.json(
      { error: 'Failed to fetch transfers' },
      { status: 500 },
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { toSite, toDept, toDeptCode, reason, transferDate } = body as {
      toSite?: string
      toDept?: string
      toDeptCode?: string
      reason?: string
      transferDate?: string
    }

    if (!toSite || !toSite.trim()) {
      return NextResponse.json(
        { error: 'ต้องระบุสาขาปลายทาง (toSite)' },
        { status: 400 },
      )
    }

    const device = await db.device.findUnique({ where: { id } })
    if (!device) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const fromSite = device.site || null
    const fromDept = device.department ?? null
    const fromDeptCode = device.departmentCode ?? null
    const dateStr = transferDate?.trim() || new Date().toISOString().slice(0, 10)

    const updated = await db.device.update({
      where: { id },
      data: {
        site: String(toSite).trim(),
        department: toDept ? String(toDept).trim() : null,
        departmentCode: toDeptCode ? String(toDeptCode).trim() : null,
      },
    })

    const transfer = await db.deviceTransfer.create({
      data: {
        deviceId: id,
        fromSite,
        toSite: String(toSite).trim(),
        fromDepartment: fromDept,
        toDepartment: toDept ? String(toDept).trim() : null,
        fromDepartmentCode: fromDeptCode,
        toDepartmentCode: toDeptCode ? String(toDeptCode).trim() : null,
        reason: reason ? String(reason).trim() : null,
        transferDate: dateStr,
      },
    })

    await logAudit(
      'TRANSFER',
      'Device',
      id,
      `ย้ายอุปกรณ์ ${updated.assetCode}: ${fromSite ?? '—'}→${toSite}`,
      {
        fromSite,
        toSite,
        fromDept,
        toDept: toDept ?? null,
        fromDeptCode,
        toDeptCode: toDeptCode ?? null,
        reason: reason ?? null,
        transferDate: dateStr,
      },
    )

    return NextResponse.json(
      { device: updated, transfer: toLegacyTransferShape(transfer) },
      { status: 201 },
    )
  } catch (err) {
    console.error('POST /api/devices/[id]/transfer', err)
    const message = err instanceof Error ? err.message : 'Failed to transfer'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
