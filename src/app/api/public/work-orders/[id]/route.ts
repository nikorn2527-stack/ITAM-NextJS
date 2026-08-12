import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Public QR tracking endpoint migrated from Services Apps Script
 * `getPublicJobById`.
 *
 * Security rules:
 * - Lookup accepts the internal CUID only; sequential work-order numbers are not searchable.
 * - Response is an explicit public whitelist and excludes employeeCode, reporterEmail,
 *   externalMeta, internal admin notes, audit data, and messages.
 * - No write operation is exposed by this route.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const workOrderId = id.trim()
    if (!workOrderId) {
      return NextResponse.json({ success: false, message: 'กรุณาระบุรหัสใบงาน' }, { status: 400 })
    }

    const workOrder = await db.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        woNumber: true,
        createdAt: true,
        updatedAt: true,
        tel: true,
        building: true,
        location: true,
        subject: true,
        details: true,
        status: true,
        assignedTo: true,
        picBefore: true,
        picOnsite: true,
        picAfter: true,
        workCompletedAt: true,
        closedAt: true,
      },
    })

    if (!workOrder) {
      return NextResponse.json(
        { success: false, message: 'ไม่พบใบงานที่ตรงกับรหัสที่ระบุ' },
        { status: 404 },
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: workOrder.id,
          wo_number: workOrder.woNumber,
          created_at: workOrder.createdAt,
          updated_at: workOrder.updatedAt,
          tel: workOrder.tel,
          building: workOrder.building,
          location: workOrder.location,
          subject: workOrder.subject,
          details: workOrder.details,
          status: workOrder.status,
          assigned_to: workOrder.assignedTo,
          pic_before: workOrder.picBefore,
          pic_onsite: workOrder.picOnsite,
          pic_after: workOrder.picAfter,
          work_completed_at: workOrder.workCompletedAt,
          closed_at: workOrder.closedAt,
        },
      },
      {
        headers: {
          // A public status page may be cached briefly, but must not be stored by shared proxies.
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=30',
        },
      },
    )
  } catch (error) {
    console.error('GET /api/public/work-orders/[id]', error)
    return NextResponse.json(
      { success: false, message: 'เกิดข้อผิดพลาดในการค้นหาใบงาน' },
      { status: 500 },
    )
  }
}
