/**
 * webauthn.ts — WebAuthn / Passkey helpers (server-side).
 *
 * รองรับล็อกอินด้วยลายนิ้วมือ/ใบหน้า — Touch ID, Face ID, Windows Hello,
 * Android fingerprint, hardware security keys.
 *
 * Flow:
 *   1. Register: ผู้ใช้ login แล้วกด "ลงทะเบียนลายนิ้วมือ"
 *      → /api/auth/webauthn/register/begin → returns options
 *      → browser calls navigator.credentials.create()
 *      → /api/auth/webauthn/register/finish → verify + save credential
 *
 *   2. Login: ผู้ใช้กด "เข้าสู่ระบบด้วยลายนิ้วมือ"
 *      → /api/auth/webauthn/login/begin?email=... → returns options
 *      → browser calls navigator.credentials.get()
 *      → /api/auth/webauthn/login/finish → verify + issue JWT
 *
 * RP ID = current host (works on localhost + production domain).
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

/**
 * Get WebAuthn config from request headers (so it works on any domain).
 * Falls back to localhost for development.
 */
export function getWebAuthnConfig(req: Request): WebAuthnConfig {
  const host = req.headers.get('host') || 'localhost:3000'
  const protocol = req.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')
  const rpID = host.split(':')[0] // strip port
  const origin = `${protocol}://${host}`

  return {
    rpName: 'IT Asset Management',
    rpID,
    origin,
  }
}

/**
 * Generate registration options for a user (step 1 of registration).
 * Excludes existing credentials so user can register multiple devices.
 */
export async function beginRegistration(opts: {
  userId: string
  userEmail: string
  userName: string
  existingCredentials: Array<{ id: string; transports?: string[] }>
  config: WebAuthnConfig
}) {
  const { userId, userEmail, userName, existingCredentials, config } = opts

  // Convert string userId to Uint8Array (SimpleWebAuthn v14+ requires Buffer, not string)
  const userID = new TextEncoder().encode(userId)

  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userID,
    userName: userEmail,
    userDisplayName: userName,
    attestationType: 'none', // don't require attestation (privacy)
    excludeCredentials: existingCredentials.map((c) => ({
      id: c.id,
      type: 'public-key' as const,
      transports: (c.transports ?? []).split(',') as AuthenticatorTransport[],
    })),
    authenticatorSelection: {
      // prefer platform authenticators (Touch ID, Face ID, Windows Hello)
      // but allow cross-platform (YubiKey) as fallback
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    supportedAlgorithmIDs: [-7, -257], // ES256, RS256
  })

  return options
}

/**
 * Verify registration response from browser (step 2 of registration).
 * Returns the credential info to save in DB.
 */
export async function finishRegistration(opts: {
  body: unknown
  expectedChallenge: string
  config: WebAuthnConfig
}): Promise<VerifiedRegistrationResponse> {
  const { body, expectedChallenge, config } = opts
  return await verifyRegistrationResponse({
    response: body as Parameters<typeof verifyRegistrationResponse>[0]['response'],
    expectedChallenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
    requireUserVerification: false,
  })
}

/**
 * Generate authentication options (step 1 of login).
 * If email is provided, only allow that user's credentials.
 * If no email, allow any credential (discoverable login / username-less).
 */
export async function beginAuthentication(opts: {
  config: WebAuthnConfig
  allowedCredentials?: Array<{ id: string; transports?: string[] }>
}) {
  const { config, allowedCredentials } = opts

  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    allowCredentials: allowedCredentials?.map((c) => ({
      id: c.id,
      type: 'public-key' as const,
      transports: (c.transports ?? '').split(',').filter(Boolean) as AuthenticatorTransport[],
    })),
    userVerification: 'preferred',
  })

  return options
}

/**
 * Verify authentication response from browser (step 2 of login).
 * Returns the credential ID + new counter (to save in DB).
 */
export async function finishAuthentication(opts: {
  body: unknown
  expectedChallenge: string
  config: WebAuthnConfig
  credential: {
    id: string
    publicKey: Uint8Array
    counter: number
  }
}): Promise<VerifiedAuthenticationResponse> {
  const { body, expectedChallenge, config, credential } = opts
  return await verifyAuthenticationResponse({
    response: body as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
    expectedChallenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
    credential: {
      id: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
    },
    requireUserVerification: false,
  })
}

/**
 * Convert base64url string → Uint8Array (for storing/sending credentials).
 */
export function base64urlToBytes(b64url: string): Uint8Array {
  const pad = b64url.length % 4 === 0 ? '' : '='.repeat(4 - (b64url.length % 4))
  const b64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Convert Buffer/Uint8Array → base64url string (for JSON responses).
 */
export function bytesToBase64url(bytes: Uint8Array | Buffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i])
  const b64 = btoa(binary)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
