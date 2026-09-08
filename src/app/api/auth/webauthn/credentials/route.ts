import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'

/**
 * GET /api/auth/webauthn/credentials
 * List the current user's registered WebAuthn credentials (without public keys).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DEVICES')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const creds = await db.webAuthnCredential.findMany({
    where: { userId: auth.user.id },
    select: {
      id: true,
      deviceType: true,
      name: true,
      createdAt: true,
      lastUsedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ credentials: creds })
}

/**
 * DELETE /api/auth/webauthn/credentials?id=...
 * Remove a registered credential (revoke device).
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DEVICES')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const credId = new URL(req.url).searchParams.get('id')
  if (!credId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Verify ownership before deleting
  const cred = await db.webAuthnCredential.findUnique({ where: { id: credId } })
  if (!cred || cred.userId !== auth.user.id) {
    return NextResponse.json({ error: 'ไม่พบลายนิ้วมือ หรือไม่ใช่ของคุณ' }, { status: 404 })
  }

  await db.webAuthnCredential.delete({ where: { id: credId } })
  return NextResponse.json({ ok: true })
}
