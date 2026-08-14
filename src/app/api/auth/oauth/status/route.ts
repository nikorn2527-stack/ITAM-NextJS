import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * GET /api/auth/oauth/status
 *
 * Public endpoint (no auth required) that reports which OAuth providers have
 * been configured by the admin. The login page uses this to decide which
 * provider buttons to render.
 *
 * Returns: { providers: { google: bool, line: bool, telegram: bool } }
 */
export async function GET(_req: NextRequest) {
  try {
    const rows = await db.appSetting.findMany({
      where: {
        key: {
          in: [
            'oauth_google_client_id',
            'oauth_google_client_secret',
            'oauth_line_channel_id',
            'oauth_line_channel_secret',
            'oauth_telegram_bot_token',
          ],
        },
      },
      select: { key: true, value: true },
    })
    const map: Record<string, string> = {}
    for (const r of rows) map[r.key] = r.value

    return NextResponse.json({
      providers: {
        google:
          Boolean(map.oauth_google_client_id) &&
          Boolean(map.oauth_google_client_secret),
        line:
          Boolean(map.oauth_line_channel_id) &&
          Boolean(map.oauth_line_channel_secret),
        telegram: Boolean(map.oauth_telegram_bot_token),
      },
    })
  } catch (err) {
    console.error('GET /api/auth/oauth/status', err)
    return NextResponse.json(
      { providers: { google: false, line: false, telegram: false } },
      { status: 200 },
    )
  }
}
