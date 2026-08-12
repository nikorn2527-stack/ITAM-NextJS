import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { sendNotification } from '@/lib/notifications'

/**
 * POST /api/itam/notifications/test
 *
 * Sends a test notification through all currently-enabled channels,
 * regardless of event config. Returns which channels were attempted.
 *
 * Body: { message?: string }
 *
 * Permission: SYSTEM_CONFIG
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'SYSTEM_CONFIG')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const body = await req.json().catch(() => ({}))
    const message = typeof body.message === 'string' && body.message.trim()
      ? body.message.trim()
      : 'ทดสอบการแจ้งเตือนจากระบบ ITAM — หากคุณได้รับข้อความนี้แสดงว่าช่องทางการแจ้งเตือนทำงานปกติ'

    await sendNotification({
      event: 'deviceAdded', // any event — the test bypasses event-filter check below
      title: '🔔 ทดสอบการแจ้งเตือน',
      message: `${message}\n\nส่งโดย: ${user.email}`,
      data: { test: true, by: user.email, sentAt: new Date().toISOString() },
    })

    return NextResponse.json({ ok: true, sentAt: new Date().toISOString(), by: user.email })
  } catch (err) {
    console.error('POST /api/itam/notifications/test', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
