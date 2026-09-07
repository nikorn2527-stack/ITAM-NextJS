/**
 * webauthn.ts — WebAuthn / Passkey helpers (server-side).
 *
 * รองรับล็อกอินด้วยลายนิ้วมือ/ใบหน้า — Touch ID, Face ID, Windows Hello,
 * Android fingerprint, hardware security keys.
 *
 * rpID = current host (works on localhost + production domain).
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from '@simplewebauthn/server'
import type { AuthenticatorTransport } from '@simplewebauthn/server'

export interface WebAuthnConfig {
  rpName: string
  rpID: string
  origin: string
}

export function getWebAuthnConfig(req: Request): WebAuthnConfig {
  const host = req.headers.get('host') || 'localhost:3000'
  const protocol = req.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')
  const rpID = host.split(':')[0]
  const origin = `${protocol}://${host}`
  return { rpName: 'IT Asset Management', rpID, origin }
}

export async function beginRegistration(opts: {
  userId: string
  userEmail: string
  userName: string
  existingCredentials: Array<{ id: string; transports?: string[] }>
  config: WebAuthnConfig
}) {
  const { userId, userEmail, userName, existingCredentials, config } = opts
  const userID = new TextEncoder().encode(userId)
  return await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userID,
    userName: userEmail,
    userDisplayName: userName,
    attestationType: 'none',
    excludeCredentials: existingCredentials.map((c) => ({
      id: c.id,
      type: 'public-key' as const,
      transports: (c.transports ?? []).split(',') as AuthenticatorTransport[],
    })),
    authenticatorSelection: {
      // Don't force 'platform' — allow BOTH platform (Touch ID/Face ID/
      // Windows Hello) AND cross-platform (USB security key, Bluetooth
      // phone). This fixes the bug where users without a platform
      // authenticator couldn't register at all.
      // authenticatorAttachment: 'platform',  ← removed (too restrictive)
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    supportedAlgorithmIDs: [-7, -257],
  })
}

export async function finishRegistration(opts: {
  body: unknown
  expectedChallenge: string
  config: WebAuthnConfig
}): Promise<VerifiedRegistrationResponse> {
  return await verifyRegistrationResponse({
    response: opts.body as Parameters<typeof verifyRegistrationResponse>[0]['response'],
    expectedChallenge: opts.expectedChallenge,
    expectedOrigin: opts.config.origin,
    expectedRPID: opts.config.rpID,
    requireUserVerification: false,
  })
}

export async function beginAuthentication(opts: {
  config: WebAuthnConfig
  allowedCredentials?: Array<{ id: string; transports?: string[] }>
}) {
  return await generateAuthenticationOptions({
    rpID: opts.config.rpID,
    allowCredentials: opts.allowedCredentials?.map((c) => ({
      id: c.id,
      type: 'public-key' as const,
      transports: (c.transports ?? '').split(',').filter(Boolean) as AuthenticatorTransport[],
    })),
    userVerification: 'preferred',
  })
}

export async function finishAuthentication(opts: {
  body: unknown
  expectedChallenge: string
  config: WebAuthnConfig
  credential: { id: string; publicKey: Uint8Array; counter: number }
}): Promise<VerifiedAuthenticationResponse> {
  return await verifyAuthenticationResponse({
    response: opts.body as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
    expectedChallenge: opts.expectedChallenge,
    expectedOrigin: opts.config.origin,
    expectedRPID: opts.config.rpID,
    credential: {
      id: opts.credential.id,
      publicKey: opts.credential.publicKey,
      counter: opts.credential.counter,
    },
    requireUserVerification: false,
  })
}
