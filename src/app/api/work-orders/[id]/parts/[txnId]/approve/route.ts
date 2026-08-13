import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * POST /api/work-orders/[id]/parts/[txnId]/approve
 * Approve a parts request for a work order.
 *
 * - Sets approvalStatus='APPROVED'
 * - Reduces StockItem.quantity
 * - Sets balanceAfter
 *
 * Body: { approver?: string, note?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; txnId: string }> },
) {
  try {
    const { id, txnId } = await params
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const approverName =
      typeof body.approver === 'string' && body.approver.trim()
        ? body.approver.trim()
        : 'admin'
    const note =
      typeof body.note === 'string' && body.note.trim()
        ? body.note.trim()
        : null

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: { id: true, woNumber: true, status: true },
    })
    if (!wo) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const result = await db.$transaction(async (tx) => {
      const txn = await tx.stockTransaction.findUnique({
        where: { id: txnId },
      })
      if (!txn) {
        throw new Error('NOT_FOUND_TXN')
      }
      // Must be linked to this work order
      const isLinked =
        txn.workOrderId === wo.id ||
        (wo.woNumber && txn.workOrderNo === wo.woNumber)
      if (!isLinked) {
        throw new Error('MISMATCH')
      }
      if (txn.approvalStatus !== 'PENDING') {
        throw new Error(
          `สถานะรายการนี้ไม่ใช่ PENDING (ปัจจุบัน: ${txn.approvalStatus ?? '—'})`,
        )
      }

      const item = await tx.stockItem.findUnique({
        where: { id: txn.stockItemId },
      })
      if (!item) {
        throw new Error('NOT_FOUND_ITEM')
      }
      if (txn.quantity > item.quantity) {
        throw new Error(
          `สต็อกไม่เพียงพอ (คงเหลือ ${item.quantity} ${item.unit} ต้องการ ${txn.quantity})`,
        )
      }

      const newBalance = item.quantity - txn.quantity

      const [updatedItem, updatedTxn] = await Promise.all([
        tx.stockItem.update({
          where: { id: item.id },
          data: { quantity: newBalance },
        }),
        tx.stockTransaction.update({
          where: { id: txnId },
          data: {
            approvalStatus: 'APPROVED',
            approver: approverName,
            approvedAt: new Date().toISOString(),
            balanceAfter: newBalance,
            remark: note
              ? (txn.remark ? txn.remark + '\n' : '') + `[อนุมัติ] ${note}`
              : txn.remark,
          },
        }),
      ])

      // Post a system message on the work order
      await tx.workOrderMessage.create({
        data: {
          workOrderId: wo.id,
          message: `อนุมัติเบิกอะไหล่: ${item.productCode} × ${txn.quantity} ${item.unit} (คงเหลือ ${newBalance})`,
          author: approverName,
          authorRole: 'system',
        },
      })

      // Check if any PENDING parts requests remain for this WO
      const remainingPending = await tx.stockTransaction.count({
        where: {
          approvalStatus: 'PENDING',
          OR: [{ workOrderId: wo.id }, { workOrderNo: wo.woNumber ?? '' }],
        },
      })

      // ── Auto-close: if all parts approved AND WO is WAITING_PARTS → auto-close ──
      // (Aligned with Apps Script syncApprovedStockOutToCompleted)
      let autoClosed = false
      if (remainingPending === 0 && wo.status === 'WAITING_PARTS') {
        const now = new Date()
        await tx.workOrder.update({
          where: { id: wo.id },
          data: {
            status: 'COMPLETED',
            workCompletedAt: now,
            closedAt: now,
          },
        })
        autoClosed = true
        // Post system message about auto-close
        await tx.workOrderMessage.create({
          data: {
            workOrderId: wo.id,
            message: '✅ ระบบปิดงานอัตโนมัติหลังอนุมัติเบิกอะไหล่ครบ',
            author: 'system-auto',
            authorRole: 'system',
          },
        })
      }

      return {
        item: updatedItem,
        txn: updatedTxn,
        remainingPending,
        autoClosed,
      }
    })

    // Audit logs (non-transactional — best effort)
    try {
      await db.auditLog.create({
        data: {
          action: 'WO_PARTS_APPROVE',
          entity: 'WorkOrder',
          entityId: wo.id,
          summary: `อนุมัติเบิกอะไหล่ ${result.item.productCode} × ${result.txn.quantity} ${result.item.unit} สำหรับ ${wo.woNumber ?? wo.id}`,
          detail: JSON.stringify({
            woNumber: wo.woNumber,
            productCode: result.item.productCode,
            quantity: result.txn.quantity,
            balanceAfter: result.item.quantity,
            txnNumber: result.txn.txnNumber,
            approver: approverName,
            note,
            remainingPending: result.remainingPending,
          }),
          actor: approverName,
        },
      })
    } catch (e) {
      console.error('audit log failed', e)
    }

    return NextResponse.json({
      data: {
        transaction: result.txn,
        stockItem: result.item,
        remainingPending: result.remainingPending,
        allPartsApproved: result.remainingPending === 0,
        autoClosed: result.autoClosed,
      },
    })
  } catch (err) {
    console.error('POST /api/work-orders/[id]/parts/[txnId]/approve', err)
    if (err instanceof Error) {
      if (
        err.message === 'NOT_FOUND_TXN' ||
        err.message === 'NOT_FOUND_ITEM' ||
        err.message === 'MISMATCH'
      ) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      if (
        err.message.startsWith('สถานะรายการนี้') ||
        err.message.startsWith('สต็อกไม่เพียงพอ')
      ) {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
    }
    const message =
      err instanceof Error ? err.message : 'Failed to approve parts request'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
