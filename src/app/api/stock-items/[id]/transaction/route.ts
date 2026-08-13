import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

/** Parse an Int; returns 0 when missing/invalid. */
function optInt(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === '') return fallback
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.round(n)
}

/** Parse a Float; returns null when missing/invalid. */
function optFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, n)
}

const VALID_TYPES = new Set(['IN', 'OUT', 'ADJUST'])

/**
 * Generate the next sequential txn number for today: STX-YYYYMMDD-NNN.
 * Counts existing transactions for today and +1.
 */
async function nextTxnNumber(txnDate: string): Promise<string> {
  const ymd = txnDate.replace(/-/g, '').slice(0, 8)
  const prefix = `STX-${ymd}-`
  const txns = await db.stockTransaction.findMany({
    where: { txnNumber: { startsWith: prefix } },
    select: { txnNumber: true },
  })
  let max = 0
  for (const t of txns) {
    if (!t.txnNumber) continue
    const m = /^STX-\d{8}-(\d+)$/.exec(t.txnNumber)
    if (m) {
      const n = parseInt(m[1], 10)
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const type = String(body.type ?? '').toUpperCase()
    if (!VALID_TYPES.has(type)) {
      return NextResponse.json(
        { error: "type ต้องเป็น 'IN', 'OUT' หรือ 'ADJUST'" },
        { status: 400 },
      )
    }
    const quantity = optInt(body.quantity, 0)
    if (quantity < 0) {
      return NextResponse.json(
        { error: 'quantity ต้องไม่ติดลบ' },
        { status: 400 },
      )
    }
    if ((type === 'IN' || type === 'OUT') && quantity <= 0) {
      return NextResponse.json(
        { error: 'สำหรับ IN/OUT ต้องระบุ quantity มากกว่า 0' },
        { status: 400 },
      )
    }

    const txnDate = body.txnDate
      ? String(body.txnDate).trim()
      : new Date().toISOString().slice(0, 10)

    // Atomic update of StockItem.quantity + create StockTransaction.
    const result = await db.$transaction(async (tx) => {
      const item = await tx.stockItem.findUnique({ where: { id } })
      if (!item) {
        throw new Error('NOT_FOUND')
      }
      if (!item.active) {
        throw new Error('INACTIVE')
      }

      let newBalance: number
      if (type === 'IN') {
        newBalance = item.quantity + quantity
      } else if (type === 'OUT') {
        if (quantity > item.quantity) {
          throw new Error(
            `สต็อกไม่เพียงพอ (คงเหลือ ${item.quantity} ${item.unit})`,
          )
        }
        newBalance = item.quantity - quantity
      } else {
        // ADJUST sets the balance to the supplied quantity.
        newBalance = quantity
      }

      const updatedItem = await tx.stockItem.update({
        where: { id },
        data: { quantity: newBalance },
      })

      const txnNumber = await (async () => {
        // We need to compute the next number inside the transaction — query
        // the DB through `tx` so we see uncommitted counts.
        const ymd = txnDate.replace(/-/g, '').slice(0, 8)
        const prefix = `STX-${ymd}-`
        const existing = await tx.stockTransaction.findMany({
          where: { txnNumber: { startsWith: prefix } },
          select: { txnNumber: true },
        })
        let max = 0
        for (const t of existing) {
          if (!t.txnNumber) continue
          const m = /^STX-\d{8}-(\d+)$/.exec(t.txnNumber)
          if (m) {
            const n = parseInt(m[1], 10)
            if (Number.isFinite(n) && n > max) max = n
          }
        }
        return `${prefix}${String(max + 1).padStart(3, '0')}`
      })()

      const cost =
        type === 'IN'
          ? optFloat(body.cost) ??
            (item.unitCost !== null ? item.unitCost * quantity : null)
          : optFloat(body.cost)

      const txn = await tx.stockTransaction.create({
        data: {
          txnNumber,
          stockItemId: id,
          type,
          quantity,
          balanceAfter: newBalance,
          reason: body.reason ? String(body.reason).trim() : null,
          requester: body.requester ? String(body.requester).trim() : null,
          department: body.department ? String(body.department).trim() : null,
          purpose: body.purpose ? String(body.purpose).trim() : null,
          workOrderId: body.workOrderId ? String(body.workOrderId) : null,
          workOrderNo: body.workOrderNo ? String(body.workOrderNo) : null,
          deviceId: body.deviceId ? String(body.deviceId) : null,
          cost,
          unitCost: item.unitCost,
          vendor: body.vendor ? String(body.vendor).trim() : null,
          receiver: body.receiver ? String(body.receiver).trim() : null,
          purchaseOrderNo: body.purchaseOrderNo
            ? String(body.purchaseOrderNo).trim()
            : null,
          txnDate,
          performedBy: body.performedBy ? String(body.performedBy).trim() : null,
          remark: body.remark ? String(body.remark).trim() : null,
        },
      })

      // ── PO Receiving (Feature 3) ──
      // When this is an IN transaction linked to a PurchaseOrder via
      // `purchaseOrderNo`, find the matching PurchaseOrderItem (by PO
      // poNumber + stockItemId) and increment quantityReceived. If the
      // whole line is fulfilled, mark it complete; if every line on the
      // PO is fulfilled, set the PO status to 'received', otherwise
      // 'partial' (when at least one line has been partially received).
      let poUpdateSummary: { poId?: string; poNumber?: string; status?: string } | null = null
      if (type === 'IN' && body.purchaseOrderNo) {
        const poNumber = String(body.purchaseOrderNo).trim()
        const po = await tx.purchaseOrder.findFirst({
          where: { poNumber },
          include: { items: true },
        })
        if (po) {
          const matchedItem = po.items.find((it) => it.stockItemId === id)
          if (matchedItem) {
            const newReceived = Math.min(
              matchedItem.quantityOrdered,
              matchedItem.quantityReceived + quantity,
            )
            await tx.purchaseOrderItem.update({
              where: { id: matchedItem.id },
              data: { quantityReceived: newReceived },
            })

            // Re-fetch all items to compute the new PO status
            const refreshedItems = await tx.purchaseOrderItem.findMany({
              where: { purchaseOrderId: po.id },
            })
            const allFulfilled = refreshedItems.every(
              (it) => it.quantityReceived >= it.quantityOrdered,
            )
            const anyReceived = refreshedItems.some(
              (it) => it.quantityReceived > 0,
            )
            const nextStatus = allFulfilled
              ? 'received'
              : anyReceived
              ? 'partial'
              : po.status === 'cancelled'
              ? 'cancelled'
              : 'open'
            await tx.purchaseOrder.update({
              where: { id: po.id },
              data: { status: nextStatus },
            })
            poUpdateSummary = {
              poId: po.id,
              poNumber: po.poNumber ?? poNumber,
              status: nextStatus,
            }
          }
        }
      }

      return { item: updatedItem, txn, poUpdateSummary }
    })

    const action =
      type === 'IN' ? 'STOCK_IN' : type === 'OUT' ? 'STOCK_OUT' : 'STOCK_ADJUST'
    const verb =
      type === 'IN'
        ? 'รับเข้า'
        : type === 'OUT'
        ? 'เบิกออก'
        : 'ปรับปรุงสต็อก'
    await logAudit(
      action,
      'StockItem',
      id,
      `${verb} ${result.item.productCode} จำนวน ${quantity} ${result.item.unit} (คงเหลือ ${result.item.quantity})`,
      {
        productCode: result.item.productCode,
        type,
        quantity,
        balanceAfter: result.item.quantity,
        txnNumber: result.txn.txnNumber,
        txnId: result.txn.id,
        reason: result.txn.reason,
        purchaseOrderNo: result.txn.purchaseOrderNo,
        poUpdate: result.poUpdateSummary,
      },
    )

    return NextResponse.json(
      {
        data: {
          item: result.item,
          transaction: result.txn,
          poUpdate: result.poUpdateSummary,
        },
      },
      { status: 201 },
    )
  } catch (err) {
    console.error('POST /api/stock-items/[id]/transaction', err)
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      if (err.message === 'INACTIVE') {
        return NextResponse.json(
          { error: 'สินค้านี้ถูกปิดใช้งานแล้ว' },
          { status: 400 },
        )
      }
      // Stock-insufficient and other business-rule errors.
      if (
        err.message.startsWith('สต็อกไม่เพียงพอ') ||
        err.message.startsWith('type ต้อง')
      ) {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
    }
    const message =
      err instanceof Error ? err.message : 'Failed to create transaction'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Re-export helper for type-only consumers (kept for parity with other routes).
export { nextTxnNumber as _nextTxnNumber }
