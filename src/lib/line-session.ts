// ============================================================
// line-session.ts — LINE public-reporter session cookie helper
// (Task ID: PUBLIC-QR-2B-LINE-LOGIN)
// ============================================================
// The `line_session` cookie is a SEPARATE cookie from `itam-session`
// (staff auth via NextAuth-style JWT). It only carries LINE identity for
// PUBLIC users (Tier 1/2 QR repair reporters) and is intentionally NOT a
// security primitive — anyone with the cookie can read its contents. It is
// base64-encoded JSON (not encrypted) for simplicity.
//
// If you need stronger assurance, sign the cookie with HMAC-SHA256 using
// LINE_LOGIN_CHANNEL_SECRET (or a dedicated LINE_SESSION_SECRET env var).
// For now, base64 is sufficient because:
//   1. The cookie is HTTP-only (not readable from JS).
//   2. The session is short-lived (24h).
//   3. The only "trust" we grant is routing repair submissions to Tier 1/2
//      instead of Tier 3 — staff still review Tier 2/3 submissions, and
//      Tier 1 (phone-verified) only applies when the phone scope was granted.
// ============================================================

import type { NextRequest, NextResponse } from 'next/server'

export const LINE_SESSION_COOKIE = 'line_session'
export const LINE_STATE_COOKIE = 'line_login_state'
export const LINE_SESSION_TTL_SECONDS = 24 * 60 * 60 // 24h

export interface LineSession {
  /** LINE userId (e.g. 'U1234567890abcdef...') */
  userId: string
  /** Display name from LINE profile */
  displayName: string
  /** Avatar URL (LINE CDN, expires ~30 days) */
  pictureUrl?: string
  /**
   * Phone number from id_token phone scope (Tier 1). null/undefined if phone
   * scope was not requested/granted (Tier 2).
   */
  scopePhone?: string | null
  /** ISO timestamp when the session expires. */
  expiresAt: string
}

interface StateCookiePayload {
  state: string
  /** Where to return the user after LINE callback completes. */
  redirect: string
  /** When the state was issued (ISO timestamp). Used to enforce 10-min expiry. */
  createdAt: string
}

// ─── Encoding / decoding ────────────────────────────────────────────────

function encodeBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
}

function decodeBase64Json<T = unknown>(token: string): T | null {
  try {
    const json = Buffer.from(token, 'base64').toString('utf8')
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

// ─── Session cookie (line_session) ─────────────────────────────────────

/**
 * Read + validate the `line_session` cookie from a NextRequest.
 * Returns null if the cookie is missing, malformed, or expired.
 */
export function getLineSession(req: NextRequest): LineSession | null {
  const raw = req.cookies.get(LINE_SESSION_COOKIE)?.value
  if (!raw) return null
  const parsed = decodeBase64Json<LineSession>(raw)
  if (!parsed) return null
  if (typeof parsed.userId !== 'string' || typeof parsed.displayName !== 'string') {
    return null
  }
  if (typeof parsed.expiresAt !== 'string') return null
  const exp = Date.parse(parsed.expiresAt)
  if (Number.isNaN(exp) || exp < Date.now()) return null
  return parsed
}

/**
 * Set the `line_session` cookie on a NextResponse (used by the callback
 * route after a successful LINE login).
 */
export function setLineSessionCookie(
  res: NextResponse,
  session: LineSession,
): void {
  const value = encodeBase64Json(session)
  res.cookies.set(LINE_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: LINE_SESSION_TTL_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  })
}

/**
 * Clear the `line_session` cookie (used by the logout route).
 */
export function clearLineSessionCookie(res: NextResponse): void {
  res.cookies.set(LINE_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
  })
}

// ─── State cookie (line_login_state) ───────────────────────────────────

/**
 * Save the OAuth `state` value + the post-login redirect target into a
 * short-lived (10-min) HTTP-only cookie. The state cookie has TWO purposes:
 *   1. Anti-CSRF: state echoed by LINE must match what we saved.
 *   2. Resume UX: we need to know where to send the user after the callback.
 */
export function setLineStateCookie(
  res: NextResponse,
  payload: StateCookiePayload,
): void {
  const value = encodeBase64Json(payload)
  res.cookies.set(LINE_STATE_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60, // 10 minutes
    secure: process.env.NODE_ENV === 'production',
  })
}

/**
 * Read the saved state + redirect from the cookie. Returns null if missing,
 * malformed, or older than 10 minutes.
 */
export function getLineStateCookie(
  req: NextRequest,
): StateCookiePayload | null {
  const raw = req.cookies.get(LINE_STATE_COOKIE)?.value
  if (!raw) return null
  const parsed = decodeBase64Json<StateCookiePayload>(raw)
  if (!parsed) return null
  if (
    typeof parsed.state !== 'string' ||
    typeof parsed.redirect !== 'string' ||
    typeof parsed.createdAt !== 'string'
  ) {
    return null
  }
  // Belt-and-suspenders: enforce 10-min expiry on top of maxAge.
  const createdAt = Date.parse(parsed.createdAt)
  if (Number.isNaN(createdAt)) return null
  if (Date.now() - createdAt > 10 * 60 * 1000) return null
  return parsed
}

/** Clear the state cookie (after the callback succeeds or fails). */
export function clearLineStateCookie(res: NextResponse): void {
  res.cookies.set(LINE_STATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
  })
}
