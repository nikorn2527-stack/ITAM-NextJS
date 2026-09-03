import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getWebAuthnConfig, beginAuthentication } from '@/lib/webauthn'
import { setChallenge } from '@/lib/webauthn-challenge-store'

/**
 * POST /api/auth/webauthn/login/begin
 * Step 1 of login. Body: { email?: string }
 *   - With email: only that user's credentials are allowed
 *   - Without email: discoverable login (user selects which credential to use)
 *
 * Returns WebAuthn authentication options.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { email?: string }
    const config = getWebAuthnConfig(req)

    let allowedCredentials: Array<{ id: string; transports?: string }> | undefined

    if (body.email) {
      // Find user by email (case-insensitive)
      const user = await db.user.findFirst({
        where: { email: { equals: body.email, mode: 'insensitive' } },
        select: {
          id: true,
          email: true,
          active: true,
          webauthnCredentials: { select: { id: true, transports: true } },
        },
      })

      if (!user) {
        // For privacy, don't reveal that the user doesn't exist —
        // return options anyway so the flow looks the same to attackers.
        const options = await beginAuthentication({ config })
        setChallenge(`auth:anon`, options.challenge)
        return NextResponse.json({ options })
      }

      if (!user.active) {
        return NextResponse.json({ error: 'บัญชีถูกระงับการใช้งาน' }, { status: 403 })
      }

      if (user.webauthnCredentials.length === 0) {
        return NextResponse.json({
          error: 'บัญชีนี้ยังไม่ได้ลงทะเบียนลายนิ้วมือ — กรุณา login ด้วย password แล้วลงทะเบียนก่อน',
        }, { status: 400 })
      }

      allowedCredentials = user.webauthnCredentials.map((c) => ({
        id: c.id,
        transports: c.transports ?? '',
      }))
    }

    const options = await beginAuthentication({ config, allowedCredentials })
    // Store challenge keyed by session ID (or anon if no email)
    const challengeKey = body.email ? `auth:${body.email.toLowerCase()}` : 'auth:anon'
    setChallenge(challengeKey, options.challenge)

    return NextResponse.json({ options })
  } catch (err) {
    console.error('POST /api/auth/webauthn/login/begin', err)
    return NextResponse.json({ error: 'Failed to start authentication' }, { status: 500 })
  }
}
