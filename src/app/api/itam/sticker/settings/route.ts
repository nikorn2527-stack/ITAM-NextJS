import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import {
  getStickerSettings,
  saveStickerSettings,
} from '@/lib/sticker-settings-store'
import { DEFAULT_STICKER_SETTINGS, type StickerSettings } from '@/lib/sticker-template'
import { logAudit } from '@/lib/audit'

// GET /api/itam/sticker/settings
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DEVICES')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const settings = await getStickerSettings()
  return NextResponse.json({ settings })
}

// PUT /api/itam/sticker/settings
//   Body: Partial<StickerSettings>
export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req, 'SYSTEM_CONFIG')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await req.json().catch(() => ({})) as Partial<StickerSettings>
    const cur = await getStickerSettings()
    const next: StickerSettings = {
      companyName: typeof body.companyName === 'string' ? body.companyName : cur.companyName,
      hospitalName: typeof body.hospitalName === 'string' ? body.hospitalName : cur.hospitalName,
      footerNote: typeof body.footerNote === 'string' ? body.footerNote : cur.footerNote,
      hotline: typeof body.hotline === 'string' ? body.hotline : cur.hotline,
      lineOALink: typeof body.lineOALink === 'string' ? body.lineOALink : cur.lineOALink,
    }
    // Cap field lengths to keep storage tidy
    next.companyName = next.companyName.slice(0, 200)
    next.hospitalName = next.hospitalName.slice(0, 200)
    next.footerNote = next.footerNote.slice(0, 500)
    next.hotline = next.hotline.slice(0, 100)
    next.lineOALink = next.lineOALink.slice(0, 200)

    await saveStickerSettings(next)

    await logAudit(
      'STICKER_SETTINGS_UPDATE',
      'StickerSettings',
      null,
      `อัปเดตการตั้งค่าสติกเกอร์ (บริษัท: "${next.companyName}")`,
      { settings: { ...DEFAULT_STICKER_SETTINGS, ...next } },
      auth.user.email,
    )

    return NextResponse.json({ settings: next })
  } catch (err) {
    console.error('PUT /api/itam/sticker/settings', err)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
