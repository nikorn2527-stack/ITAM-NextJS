import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { notifyPartsRequested } from '@/lib/notifications'

/** Parse an Int; returns 0 when missing/invalid. */
function optInt(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === '') return fallback
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.round(n)
}

/**
 * Generate the next pending-request number: SP-YYYYMMDD-NNN.
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

async function logWoAudit(
  action: string,
  entityId: string | null,
  summary: string,
  detail: Record<string, unknown> | null,
  actor: string,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action,
        entity: 'WorkOrder',
        entityId,
        summary,
        detail: detail ? JSON.stringify(detail) : null,
        actor,
      },
    })
  } catch (err) {
    console.error('logAudit failed:', err)
  }
}

/**
 * GET /api/work-orders/[id]/parts
 * List all stock transactions linked to this work order
 * (where workOrderNo = woNumber).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const wo = await db.workOrder.findUnique({
      where: { id },
      select: { id: true, woNumber: true, status: true },
    })
    if (!wo) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Find transactions linked via workOrderNo (preferred) or workOrderId
    const where = wo.woNumber
      ? {
          OR: [
            { workOrderNo: wo.woNumber },
            { workOrderId: wo.id },
          ],
        }
      : { workOrderId: wo.id }

    const txns = await db.stockTransaction.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      include: {
        stockItem: {
          select: {
            productCode: true,
            productName: true,
            unit: true,
            quantity: true,
            active: true,
          },
        },
      },
    })

    // Summary by approval status (for "all approved?" check)
    const summary = {
      total: txns.length,
      pending: txns.filter((t) => t.approvalStatus === 'PENDING').length,
      approved: txns.filter((t) => t.approvalStatus === 'APPROVED').length,
      rejected: txns.filter((t) => t.approvalStatus === 'REJECTED').length,
      immediate: txns.filter((t) => t.approvalStatus === null).length,
    }

    return NextResponse.json({ data: txns, summary })
  } catch (err) {
    console.error('GET /api/work-orders/[id]/parts', err)
    return NextResponse.json(
      { error: 'Failed to fetch parts' },
      { status: 500 },
    )
  }
}

/**
 * POST /api/work-orders/[id]/parts
 * Request parts for this work order.
 * Body: { items: [{ productCode, quantity, remark? }], requester?, actor? }
 *
 * For each item: create a StockTransaction with type='OUT',
 * approvalStatus='PENDING', workOrderNo=woNumber.
 * If WorkOrder status is not IN_PROGRESS or WAITING_PARTS, set it to WAITING_PARTS.
 *
 * Returns: { created: N, workOrderStatus: 'WAITING_PARTS' | '<current>', transactions: [...] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const items = Array.isArray(body.items) ? body.items : []
    if (items.length === 0) {
      return NextResponse.json(
        { error: 'ต้องเพิ่มอย่างน้อย 1 รายการอะไหล่' },
        { status: 400 },
      )
    }

    const requester =
      typeof body.requester === 'string' && body.requester.trim()
        ? body.requester.trim()
        : null
    const actorName =
      typeof body.actor === 'string' && body.actor.trim()
        ? body.actor.trim()
        : 'system'

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: { id: true, woNumber: true, status: true, subject: true },
    })
    if (!wo) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Validate all items first (fail fast)
    const validated: Array<{
      item: { id: string; productCode: string; productName: string; unit: string; unitCost: number | null; quantity: number }
      quantity: number
      remark: string | null
    }> = []
    for (const raw of items) {
      const productCode = String(raw?.productCode ?? '').trim()
      const qty = optInt(raw?.quantity, 0)
      const remark =
        raw?.remark && typeof raw.remark === 'string'
          ? raw.remark.trim()
          : null
      if (!productCode) {
        return NextResponse.json(
          { error: 'กรุณาระบุรหัสสินค้า (productCode) สำหรับทุกรายการ' },
          { status: 400 },
        )
      }
      if (qty <= 0) {
        return NextResponse.json(
          { error: `จำนวนสำหรับ ${productCode} ต้องมากกว่า 0` },
          { status: 400 },
        )
      }
      const item = await db.stockItem.findUnique({
        where: { productCode },
      })
      if (!item) {
        return NextResponse.json(
          { error: `ไม่พบสินค้ารหัส ${productCode}` },
          { status: 400 },
        )
      }
      if (!item.active) {
        return NextResponse.json(
          { error: `สินค้า ${productCode} ถูกปิดใช้งานแล้ว` },
          { status: 400 },
        )
      }
      validated.push({ item, quantity: qty, remark })
    }

    const txnDate = new Date().toISOString().slice(0, 10)
    const newStatus =
      wo.status === 'IN_PROGRESS' || wo.status === 'WAITING_PARTS'
        ? wo.status
        : 'WAITING_PARTS'

    // Create all pending transactions in a single transaction.
    // Also update the WO status if needed.
    const created = await db.$transaction(async (tx) => {
      const txns = []
      for (const v of validated) {
        const txnNumber = await (async () => {
          const ymd = txnDate.replace(/-/g, '').slice(0, 8)
          const prefix = `SP-${ymd}-`
          const existing = await tx.stockTransaction.findMany({
            where: { txnNumber: { startsWith: prefix } },
            select: { txnNumber: true },
          })
          let max = 0
          for (const t of existing) {
            if (!t.txnNumber) continue
            const m = /^SP-\d{8}-(\d+)$/.exec(t.txnNumber)
            if (m) {
              const n = parseInt(m[1], 10)
              if (Number.isFinite(n) && n > max) max = n
            }
          }
          return `${prefix}${String(max + 1).padStart(3, '0')}`
        })()

        const t = await tx.stockTransaction.create({
          data: {
            txnNumber,
            stockItemId: v.item.id,
            productCode: v.item.productCode,
            productName: v.item.productName,
            type: 'OUT',
            quantity: v.quantity,
            unit: v.item.unit,
            // balanceAfter stays at current quantity (NOT reduced until approved)
            balanceAfter: v.item.quantity,
            reason: `เบิกอะไหล่ใบงาน ${wo.woNumber ?? ''}`,
            requester,
            purpose: wo.subject,
            workOrderId: wo.id,
            workOrderNo: wo.woNumber,
            unitCost: v.item.unitCost,
            cost:
              v.item.unitCost !== null
                ? v.item.unitCost * v.quantity
                : null,
            txnDate,
            remark: v.remark,
            approvalStatus: 'PENDING',
            approvalMode: 'manual',
          },
        })
        txns.push(t)
      }

      // Update WO status if needed
      if (newStatus !== wo.status) {
        await tx.workOrder.update({
          where: { id: wo.id },
          data: { status: newStatus },
        })

        await tx.workOrderMessage.create({
          data: {
            workOrderId: wo.id,
            message: `เปลี่ยนสถานะเป็น "รออะไหล่" — มีคำขอเบิกอะไหล่ ${txns.length} รายการ`,
            author: actorName,
            authorRole: 'system',
          },
        })
      } else {
        await tx.workOrderMessage.create({
          data: {
            workOrderId: wo.id,
            message: `เพิ่มคำขอเบิกอะไหล่ ${txns.length} รายการ (รออนุมัติ)`,
            author: actorName,
            authorRole: 'system',
          },
        })
      }

      return txns
    })

    await logWoAudit(
      'WO_PARTS_REQUEST',
      wo.id,
      `เบิกอะไหล่ใบงาน ${wo.woNumber ?? wo.id} — ${created.length} รายการ`,
      {
        woNumber: wo.woNumber,
        count: created.length,
        items: created.map((t) => ({
          productCode: t.productCode,
          quantity: t.quantity,
          txnNumber: t.txnNumber,
        })),
        newStatus,
      },
      actorName,
    )

    // ── Notification trigger (Task ID: NOTIFY-LINE) ──
    // Send 'parts_requested' to the stock admin (LINE admin group + Telegram).
    // Send one notification per requested item, so the admin sees each part.
    // NOTE (PART 3): pass actor from auth context once NextAuth lands.
    try {
      for (const t of created) {
        await notifyPartsRequested(
          {
            id: wo.id,
            woNumber: wo.woNumber,
          },
          {
            productName: t.productName ?? '',
            quantity: t.quantity,
          },
          { channels: ['line-oa', 'telegram'], actor: actorName },
        )
      }
    } catch (e) {
      console.error('[notifications] parts_requested trigger failed:', e)
    }

    return NextResponse.json(
      {
        data: {
          created: created.length,
          workOrderStatus: newStatus,
          transactions: created,
        },
      },
      { status: 201 },
    )
  } catch (err) {
    console.error('POST /api/work-orders/[id]/parts', err)
    const message =
      err instanceof Error ? err.message : 'Failed to request parts'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
