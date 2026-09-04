import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createToken, toAuthUser } from '@/lib/auth'
import { getWebAuthnConfig, finishAuthentication } from '@/lib/webauthn'
import { getChallenge, deleteChallenge } from '@/lib/webauthn-challenge-store'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { email?: string; credential?: unknown }
    if (!body.email || !body.credential) return NextResponse.json({ error: 'Missing email or credential' }, { status: 400 })
    const email = body.email.toLowerCase().trim()
    const challengeKey = `auth:${email}`
    const expectedChallenge = getChallenge(challengeKey)
    if (!expectedChallenge) return NextResponse.json({ error: 'Challenge expired — กรุณาลองใหม่' }, { status: 400 })
    const user = await db.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      include: { webauthnCredentials: true },
    })
    if (!user) return NextResponse.json({ error: 'ไม่พบบัญชีผู้ใช้' }, { status: 404 })
    if (!user.active) return NextResponse.json({ error: 'บัญชีถูกระงับการใช้งาน' }, { status: 403 })
    const credentialBody = body.credential as { id?: string }
    if (!credentialBody?.id) return NextResponse.json({ error: 'Invalid credential response' }, { status: 400 })
    const credential = user.webauthnCredentials.find((c) => c.id === credentialBody.id)
    if (!credential) return NextResponse.json({ error: 'ไม่พบลายนิ้วมือที่ลงทะเบียนไว้' }, { status: 404 })
    const config = getWebAuthnConfig(req)
    try {
      const verification = await finishAuthentication({
        body: body.credential, expectedChallenge, config,
        credential: { id: credential.id, publicKey: new Uint8Array(credential.publicKey), counter: credential.counter },
      })
      if (!verification.verified || !verification.authenticationInfo) return NextResponse.json({ error: 'การยืนยันลายนิ้วมือล้มเหลว' }, { status: 401 })
      await db.webAuthnCredential.update({
        where: { id: credential.id },
        data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
      })
      deleteChallenge(challengeKey)
      const token = await createToken({ email: user.email, role: user.role, name: user.name, username: user.username, allowedSites: user.allowedSites })
      const authUser = toAuthUser(user)
      await logAudit('LOGIN', 'User', user.id, `เข้าสู่ระบบด้วยลายนิ้วมือ: "${credential.name ?? 'ลายนิ้วมือ'}"`, { method: 'webauthn', credentialId: credential.id }, user.email).catch(() => {})
      return NextResponse.json({ token, user: authUser })
    } catch (verifyErr) {
      console.error('WebAuthn verify failed', verifyErr)
      return NextResponse.json({ error: 'ยืนยันลายนิ้วมือไม่สำเร็จ — กรุณาลองใหม่หรือใช้ password' }, { status: 401 })
    }
  } catch (err) {
    console.error('POST /api/auth/webauthn/login/finish', err)
    return NextResponse.json({ error: 'Failed to verify authentication' }, { status: 500 })
  }
}
