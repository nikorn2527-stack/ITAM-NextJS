import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { getWebAuthnConfig, beginRegistration } from '@/lib/webauthn'
import { setChallenge } from '@/lib/webauthn-challenge-store'

/**
 * POST /api/auth/webauthn/register/begin
 * Step 1 of credential registration. Requires authenticated user.
 * Returns WebAuthn registration options for browser to call navigator.credentials.create().
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DEVICES')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const user = auth.row

  try {
    const body = await req.json().catch(() => ({})) as { name?: string }
    const config = getWebAuthnConfig(req)

    // Load existing credentials to exclude them (prevent duplicates)
    const existing = await db.webAuthnCredential.findMany({
      where: { userId: user.id },
      select: { id: true, transports: true },
    })

    const options = await beginRegistration({
      userId: user.id,
      userEmail: user.email,
      userName: user.name ?? user.username ?? user.email,
      existingCredentials: existing.map((c) => ({
        id: c.id,
        transports: c.transports?.split(','),
      })),
      config,
    })

    // Store challenge in server-side KV (in-memory) keyed by user ID
    setChallenge(`reg:${user.id}`, options.challenge)

    return NextResponse.json({
      options,
      credentialName: body.name ?? null,
    })
  } catch (err) {
    console.error('POST /api/auth/webauthn/register/begin', err)
    return NextResponse.json({ error: 'Failed to start registration' }, { status: 500 })
  }
}
