import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import {
  getNotifyChannels,
  sendNotification,
  type NotificationChannel,
} from '@/lib/notifications'

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

    // Build the enabled-channels list from saved settings so the test
    // actually goes through the configured channels (Telegram / LINE OA /
    // LINE Notify / Email).
    const channelsCfg = await getNotifyChannels()
    const channels: NotificationChannel[] = []
    if (channelsCfg.telegram) channels.push('telegram')
    if (channelsCfg.lineOA) channels.push('line-oa')
    if (channelsCfg.lineNotify) channels.push('line-notify')
    if (channelsCfg.email) channels.push('email')

    if (channels.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'ยังไม่ได้เปิดใช้ช่องทางการแจ้งเตือน — กรุณาเปิดอย่างน้อย 1 ช่องทางในหน้าตั้งค่าก่อนกดส่งทดสอบ',
          channels: [],
        },
        { status: 400 },
      )
    }

    await sendNotification({
      template: 'custom',
      channels,
      data: {
        title: '🔔 ทดสอบการแจ้งเตือน',
        message: `${message}\n\nส่งโดย: ${user.email}`,
      },
      actor: user.email,
      entity: 'Notification',
    })

    return NextResponse.json({
      ok: true,
      sentAt: new Date().toISOString(),
      by: user.email,
      channels,
    })
  } catch (err) {
    console.error('POST /api/itam/notifications/test', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
