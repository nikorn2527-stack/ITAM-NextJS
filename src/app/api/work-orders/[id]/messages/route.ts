import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { notifyWorkOrderMessage } from '@/lib/notifications'

async function logAudit(
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const wo = await db.workOrder.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!wo) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const messages = await db.workOrderMessage.findMany({
      where: { workOrderId: id },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ data: messages })
  } catch (err) {
    console.error('GET /api/work-orders/[id]/messages', err)
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
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
    const { message, author, authorRole, actor } = body as {
      message?: string
      author?: string | null
      authorRole?: string | null
      actor?: string
    }

    if (!message || !String(message).trim()) {
      return NextResponse.json(
        { error: 'ต้องระบุข้อความ' },
        { status: 400 },
      )
    }

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: { id: true, woNumber: true, status: true },
    })
    if (!wo) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (wo.status === 'CANCELLED' || wo.status === 'COMPLETED') {
      return NextResponse.json(
        { error: 'ใบงานนี้ปิด/ยกเลิกแล้ว ไม่สามารถส่งข้อความได้' },
        { status: 400 },
      )
    }

    const authorName =
      typeof author === 'string' && author.trim()
        ? author.trim()
        : (typeof actor === 'string' && actor.trim() ? actor.trim() : 'system')
    const role =
      typeof authorRole === 'string' && authorRole.trim()
        ? authorRole.trim()
        : 'staff'

    const created = await db.workOrderMessage.create({
      data: {
        workOrderId: id,
        message: String(message).trim(),
        author: authorName,
        authorRole: role,
      },
    })

    await logAudit(
      'WO_MESSAGE',
      id,
      `เพิ่มข้อความใน ${wo.woNumber ?? id}`,
      { message: String(message).trim(), author: authorName },
      authorName,
    )

    // ── Notification trigger (Task ID: NOTIFY-LINE) ──
    // Send 'wo_message' to the OTHER party (admin↔reporter).
    // If author is staff/admin → notify the reporter (LINE if lineUserId is known).
    // If author is reporter → notify staff (LINE admin group / Telegram).
    // NOTE (PART 3): pass actor from auth context once NextAuth lands.
    try {
      const woForNotify = await db.workOrder.findUnique({
        where: { id },
        select: { lineUserId: true, reporterEmail: true },
      })
      const isFromReporter = role === 'reporter'
      await notifyWorkOrderMessage(
        {
          id,
          woNumber: wo.woNumber,
          author: authorName,
          message: String(message).trim(),
        },
        {
          // When staff/admin replies → push to the reporter's LINE.
          // When reporter posts from the web → push to admin channels.
          channels: isFromReporter
            ? ['line-oa', 'telegram']
            : ['line-oa', 'telegram'],
          actor: authorName,
        },
      )
      // If a staff reply and we have a LINE user ID, also send the message
      // directly to the reporter's LINE chat (best-effort, logged if no token).
      if (
        !isFromReporter &&
        woForNotify?.lineUserId
      ) {
        const { sendLINE } = await import('@/lib/notifications')
        const lineMsg =
          `💬 ข้อความใหม่ในใบงาน ${wo.woNumber ?? ''}\n` +
          `จาก: ${authorName}\n` +
          `ข้อความ: ${String(message).trim()}`
        await sendLINE(lineMsg, woForNotify.lineUserId).catch(() => {})
      }
    } catch (e) {
      console.error('[notifications] wo_message trigger failed:', e)
    }

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/work-orders/[id]/messages', err)
    const message =
      err instanceof Error ? err.message : 'Failed to post message'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
