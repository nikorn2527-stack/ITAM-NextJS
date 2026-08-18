import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

/**
 * POST /api/stock-items/[id]/pending/[txnId]/reject
 * Reject a pending stock-out request.
 *
 * - Sets approvalStatus='REJECTED'
 * - Does NOT reduce quantity
 * - Records approver + rejectReason
 *
 * Body: { approver?: string, reason?: string }
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
    const rejectReason =
      typeof body.reason === 'string' && body.reason.trim()
        ? body.reason.trim()
        : null

    const txn = await db.stockTransaction.findUnique({
      where: { id: txnId },
      include: { stockItem: { select: { productCode: true, unit: true, site: true } } },
    })
    if (!txn) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (txn.stockItemId !== id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (txn.approvalStatus !== 'PENDING') {
      return NextResponse.json(
        {
          error: `สถานะรายการนี้ไม่ใช่ PENDING (ปัจจุบัน: ${txn.approvalStatus ?? '—'})`,
        },
        { status: 400 },
      )
    }

    const updated = await db.stockTransaction.update({
      where: { id: txnId },
      data: {
        approvalStatus: 'REJECTED',
        approver: approverName,
        approvedAt: new Date().toISOString(),
        rejectReason,
      },
    })

    await logAudit(
      'STOCK_PENDING_REJECT',
      'StockItem',
      id,
      `ปฏิเสธคำขอเบิกออก ${txn.stockItem.productCode} จำนวน ${txn.quantity} ${txn.stockItem.unit} (${txn.txnNumber ?? txnId})${rejectReason ? ` — ${rejectReason}` : ''}`,
      {
        productCode: txn.stockItem.productCode,
        quantity: txn.quantity,
        txnNumber: txn.txnNumber,
        txnId: txn.id,
        approver: approverName,
        rejectReason,
      },
      undefined,
      // NF-2: pass canonical siteCode from StockItem
      txn.stockItem.site ?? null,
    )

    return NextResponse.json({ data: updated })
  } catch (err) {
    console.error('POST /api/stock-items/[id]/pending/[txnId]/reject', err)
    const message =
      err instanceof Error ? err.message : 'Failed to reject request'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
