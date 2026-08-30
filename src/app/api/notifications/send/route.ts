import { NextRequest, NextResponse } from 'next/server'
import {
  sendNotification,
  type NotificationChannel,
  type NotificationTemplate,
} from '@/lib/notifications'

/**
 * POST /api/notifications/send
 *
 * Trigger a notification to one or more channels (line-oa, telegram, email).
 * Body shape mirrors NotificationData:
 *   {
 *     template: NotificationTemplate,
 *     channels: NotificationChannel[],
 *     data: Record<string, any>,
 *     lineUserId?: string,
 *     telegramChatId?: string,
 *     email?: string,
 *     actor?: string,
 *     entityId?: string,
 *     entity?: string,
 *   }
 *
 * NOTE (PART 3 — Single User System):
 *   `actor` should be supplied from auth context (the logged-in User.email
 *   or User.id). Until NextAuth integration is wired in, the caller may
 *   pass `actor` in the body as a fallback. Replace this once auth lands.
 *
 * Returns: { ok: true }
 */
const VALID_CHANNELS = new Set<NotificationChannel>([
  'line-oa',
  'telegram',
  'email',
])

const VALID_TEMPLATES = new Set<NotificationTemplate>([
  'wo_created',
  'wo_assigned',
  'wo_completed',
  'wo_cancelled',
  'wo_message',
  'parts_requested',
  'parts_approved',
  'stock_low',
  'stock_out',
  'meter_reminder',
])

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      template,
      channels,
      data,
      lineUserId,
      telegramChatId,
      email,
      actor,
      entityId,
      entity,
    } = body as Record<string, unknown>

    if (typeof template !== 'string' || !VALID_TEMPLATES.has(template as NotificationTemplate)) {
      return NextResponse.json(
        { error: 'invalid or missing template' },
        { status: 400 },
      )
    }
    if (!Array.isArray(channels) || channels.length === 0) {
      return NextResponse.json(
        { error: 'channels must be a non-empty array' },
        { status: 400 },
      )
    }
    for (const c of channels) {
      if (typeof c !== 'string' || !VALID_CHANNELS.has(c as NotificationChannel)) {
        return NextResponse.json(
          { error: `invalid channel: ${String(c)}` },
          { status: 400 },
        )
      }
    }
    if (!data || typeof data !== 'object') {
      return NextResponse.json(
        { error: 'data must be an object' },
        { status: 400 },
      )
    }

    await sendNotification({
      template: template as NotificationTemplate,
      channels: channels as NotificationChannel[],
      data: data as Record<string, unknown>,
      lineUserId: typeof lineUserId === 'string' ? lineUserId : undefined,
      telegramChatId:
        typeof telegramChatId === 'string' ? telegramChatId : undefined,
      email: typeof email === 'string' ? email : undefined,
      actor: typeof actor === 'string' ? actor : undefined,
      entityId: typeof entityId === 'string' ? entityId : undefined,
      entity: typeof entity === 'string' ? entity : undefined,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST /api/notifications/send', err)
    const message =
      process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.message : 'Failed to send notification') : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
