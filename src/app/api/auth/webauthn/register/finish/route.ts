import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { getWebAuthnConfig, finishRegistration } from '@/lib/webauthn'
import { getChallenge, deleteChallenge } from '@/lib/webauthn-challenge-store'
import { logAudit } from '@/lib/audit'

/**
 * POST /api/auth/webauthn/register/finish
 * Step 2 of credential registration. Verifies the browser's response and
 * saves the credential in DB.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DEVICES')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const user = auth.row

  try {
    const body = await req.json().catch(() => ({})) as {
      credential?: unknown
      deviceType?: string
      name?: string
    }
    if (!body.credential) {
      return NextResponse.json({ error: 'Missing credential' }, { status: 400 })
    }

    const config = getWebAuthnConfig(req)
    const expectedChallenge = getChallenge(`reg:${user.id}`)
    if (!expectedChallenge) {
      return NextResponse.json({ error: 'Challenge expired or not found — กรุณาเริ่มใหม่' }, { status: 400 })
    }

    const verification = await finishRegistration({
      body: body.credential,
      expectedChallenge,
      config,
    })

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'การยืนยันลายนิ้วมือล้มเหลว' }, { status: 400 })
    }

    const info = verification.registrationInfo
    const credentialId = info.credentialID
    const credentialName = body.name ?? body.deviceType ?? 'ลายนิ้วมือ'

    // Save credential to DB
    await db.webAuthnCredential.create({
      data: {
        id: credentialId,
        userId: user.id,
        publicKey: Buffer.from(info.credentialPublicKey),
        counter: info.counter,
        deviceType: body.deviceType ?? null,
        transports: (info.credentialDeviceType ?? '') as string,
        name: credentialName,
      },
    })

    // Cleanup challenge
    deleteChallenge(`reg:${user.id}`)

    await logAudit(
      'AUTH_FALLBACK',
      'User',
      user.id,
      `ลงทะเบียนลายนิ้วมือสำเร็จ: "${credentialName}"`,
      { credentialId, deviceType: body.deviceType },
      user.email,
    )

    return NextResponse.json({
      verified: true,
      credentialId,
      name: credentialName,
    })
  } catch (err) {
    console.error('POST /api/auth/webauthn/register/finish', err)
    return NextResponse.json({ error: 'Failed to verify registration' }, { status: 500 })
  }
}
