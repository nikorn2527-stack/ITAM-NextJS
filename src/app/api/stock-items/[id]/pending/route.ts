import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { readStockApprovalSettings } from '@/lib/stock-approval-settings'

/** Parse an Int; returns 0 when missing/invalid. */
function optInt(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === '') return fallback
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.round(n)
}

const VALID_APPROVAL_MODES = new Set(['manual', 'auto'])

/**
 * Generate the next pending-request number: SP-YYYYMMDD-NNN.
 * (SP = Stock Pending)
 */
async function nextPendingNumber(txnDate: string): Promise<string> {
  const ymd = txnDate.replace(/-/g, '').slice(0, 8)
  const prefix = `SP-${ymd}-`
  const txns = await db.stockTransaction.findMany({
    where: { txnNumber: { startsWith: prefix } },
    select: { txnNumber: true },
  })
  let max = 0
  for (const t of txns) {
    if (!t.txnNumber) continue
    const m = /^SP-\d{8}-(\d+)$/.exec(t.txnNumber)
    if (m) {
      const n = parseInt(m[1], 10)
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

/**
 * POST /api/stock-items/[id]/pending
 * Create a pending stock-out request.
 * Body: { quantity, reason, workOrderNo?, department?, purpose?,
 *         approvalMode?: 'manual'|'auto', autoApproveAt?, requester?, remark? }
 *
 * Creates a StockTransaction with type='OUT', approvalStatus='PENDING'.
 * Does NOT reduce quantity yet (only when approved).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()

    const quantity = optInt(body.quantity, 0)
    if (quantity <= 0) {
      return NextResponse.json(
        { error: 'quantity ต้องมากกว่า 0' },
        { status: 400 },
      )
    }

    const item = await db.stockItem.findUnique({ where: { id } })
    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (!item.active) {
      return NextResponse.json(
        { error: 'สินค้านี้ถูกปิดใช้งานแล้ว' },
        { status: 400 },
      )
    }

    const reason = body.reason ? String(body.reason).trim() : null
    const workOrderNo = body.workOrderNo ? String(body.workOrderNo).trim() : null
    const workOrderId =
      body.workOrderId && typeof body.workOrderId === 'string'
        ? String(body.workOrderId)
        : null
    const department = body.department ? String(body.department).trim() : null
    const purpose = body.purpose ? String(body.purpose).trim() : null
    const requester = body.requester ? String(body.requester).trim() : null
    const remark = body.remark ? String(body.remark).trim() : null

    const approvalSettings = await readStockApprovalSettings()
    const requestedApprovalMode = String(body.approvalMode ?? '')
    const approvalMode = VALID_APPROVAL_MODES.has(requestedApprovalMode)
      ? requestedApprovalMode
      : approvalSettings.approvalMode
    const requestedAutoApproveAt =
      typeof body.autoApproveAt === 'string' && body.autoApproveAt.trim()
        ? body.autoApproveAt.trim()
        : null
    const autoApproveAt = requestedAutoApproveAt
      ?? (approvalMode === 'auto'
        ? new Date(
            Date.now() + approvalSettings.autoApproveDelayMinutes * 60_000,
          ).toISOString()
        : null)

    const txnDate = body.txnDate
      ? String(body.txnDate).trim()
      : new Date().toISOString().slice(0, 10)

    const txnNumber = await nextPendingNumber(txnDate)

    const txn = await db.stockTransaction.create({
      data: {
        txnNumber,
        stockItemId: id,
        productCode: item.productCode,
        productName: item.productName,
        type: 'OUT',
        quantity,
        unit: item.unit,
        // balanceAfter stays at current quantity (NOT reduced until approved)
        balanceAfter: item.quantity,
        reason,
        requester,
        department,
        purpose,
        workOrderId,
        workOrderNo,
        unitCost: item.unitCost,
        cost: item.unitCost !== null ? item.unitCost * quantity : null,
        txnDate,
        remark,
        approvalStatus: 'PENDING',
        approvalMode,
        autoApproveAt,
      },
    })

    await logAudit(
      'STOCK_PENDING_CREATE',
      'StockItem',
      id,
      `สร้างคำขอเบิกออกรออนุมัติ ${item.productCode} จำนวน ${quantity} ${item.unit} (${txnNumber})`,
      {
        productCode: item.productCode,
        quantity,
        reason,
        workOrderNo,
        workOrderId,
        txnNumber,
        txnId: txn.id,
        approvalMode,
        autoApproveAt,
      },
    )

    return NextResponse.json({ data: txn }, { status: 201 })
  } catch (err) {
    console.error('POST /api/stock-items/[id]/pending', err)
    const message =
      err instanceof Error ? err.message : 'Failed to create pending request'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
