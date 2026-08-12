/**
 * auth.ts — ITAM Authentication (server-only).
 *
 * Re-exports the pure RBAC helpers from `auth-shared.ts` and adds the
 * server-side primitives that require `node:crypto` + `jose`:
 *   • Password hashing — PBKDF2-like iterated SHA-256 (salt|password → 10 000
 *     rounds), identical algorithm to GAS `hashPassword_()` so the 5 users
 *     imported from Google Sheets can log in unchanged.
 *   • JWT (HS256, 6 h TTL) via `jose` — carries email + role + name +
 *     allowedSites. Logout = client clears token + server-side blacklist Set.
 *   • Rate limiting — 5 fails → 5-min lockout per (username + IP).
 *
 * ⚠️  Do NOT import this file from client components — use `auth-shared.ts`
 *    for pure types/constants/permission checks.
 */

import crypto from 'node:crypto'
import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

// Re-export everything that's safe for both server + client
export {
  type Permission,
  type Role,
  type AuthUser,
  type UserPermissionRow,
  ROLE_PERMISSIONS,
  ROLE_LABELS,
  normalizeRole,
  getRolePermissions,
  hasPermission,
  isAdminRole,
  isSuperAdminRole,
  getAllowedSites,
  canAccessSite,
  siteFilterForUser,
  toAuthUser,
} from './auth-shared'

// ─── Password hashing (PBKDF2-like SHA-256 — identical to GAS Auth.gs) ──
const PBKDF2_ITERATIONS = 10_000

/**
 * Hash a password with salt using the GAS-compatible iterated SHA-256 scheme.
 *   raw   = `${salt}|${password}`
 *   hex₀  = sha256(raw)
 *   hexᵢ  = sha256(i%1000===0 ? `${raw}|${i}` : hexᵢ₋₁)
 *   final = hex₁₀₀₀₀
 */
export function hashPassword(password: string, salt: string, iterations = PBKDF2_ITERATIONS): string {
  const raw = `${salt ?? ''}|${password ?? ''}`
  let hex = crypto.createHash('sha256').update(raw, 'utf8').digest('hex')
  for (let i = 1; i < iterations; i++) {
    const input = i % 1000 === 0 ? `${raw}|${i}` : hex
    hex = crypto.createHash('sha256').update(input, 'utf8').digest('hex')
  }
  return hex
}

export function createPasswordSalt(): string {
  // 2 random UUIDs (no dashes) + timestamp — same shape as GAS createPasswordSalt()
  const a = crypto.randomUUID().replace(/-/g, '')
  const b = crypto.randomUUID().replace(/-/g, '')
  return `${a}${b}${Date.now()}`
}

/** Create a fresh {hash, salt} pair for a new password. */
export function hashNewPassword(password: string): { hash: string; salt: string } {
  const salt = createPasswordSalt()
  return { hash: hashPassword(password, salt, PBKDF2_ITERATIONS), salt }
}

/**
 * Verify a password against a stored hash. Tries the modern PBKDF2 (10 000
 * rounds) hash first, then the legacy single-iteration hash — matching the
 * GAS `verifyPassword_` fallback. Returns `true` on match.
 */
export function verifyPassword(
  password: string,
  storedHash: string | null,
  storedSalt: string | null,
): boolean {
  if (!storedHash || !storedSalt) return false
  const target = storedHash.trim()
  if (!target) return false
  // bcrypt (starts with $2b$ or $2a$)
  if (target.startsWith('$2b$') || target.startsWith('$2a$')) {
    try {
      return require('bcryptjs').compareSync(password, target)
    } catch {
      return false
    }
  }
  // Modern PBKDF2-like (10 000 rounds)
  const lowerTarget = target.toLowerCase()
  if (hashPassword(password, storedSalt, PBKDF2_ITERATIONS).toLowerCase() === lowerTarget) return true
  // Legacy single-round (GAS Auth.gs oldHash path)
  if (hashPassword(password, storedSalt, 1).toLowerCase() === lowerTarget) return true
  return false
}

// ─── JWT token management ────────────────────────────────────────────
const JWT_SECRET_RAW =
  process.env.JWT_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  'itam-dev-secret-change-me-in-production-please-32bytes'
// jose expects a Uint8Array secret for HS256
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW)
export const TOKEN_TTL_SECONDS = 6 * 60 * 60 // 6 hours — matches Apps Script CONFIG.AUTH_TOKEN_TTL

export interface ItamJWTPayload extends JWTPayload {
  email: string
  role: import('./auth-shared').Role
  name: string | null
  username: string | null
  allowedSites: string | 'ALL'
}

/** Issue a signed JWT carrying the user identity. */
export async function createToken(user: {
  email: string
  role: string
  name: string | null
  username: string | null
  allowedSites: string | null
}): Promise<string> {
  const { normalizeRole, isSuperAdminRole } = await import('./auth-shared')
  const role = normalizeRole(user.role)
  const payload: ItamJWTPayload = {
    email: user.email.toLowerCase(),
    role,
    name: user.name,
    username: user.username,
    allowedSites: isSuperAdminRole(role) ? 'ALL' : (user.allowedSites ?? 'ALL'),
  }
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.email.toLowerCase())
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(JWT_SECRET)
}

/** Verify a JWT and return its payload, or `null` if invalid/expired/blacklisted. */
export async function verifyToken(token: string | null | undefined): Promise<ItamJWTPayload | null> {
  if (!token) return null
  try {
    const trimmed = token.trim()
    // Reject blacklist tokens (logout)
    if (isTokenBlacklisted(trimmed)) return null
    const { payload } = await jwtVerify(trimmed, JWT_SECRET, {
      algorithms: ['HS256'],
    })
    return payload as ItamJWTPayload
  } catch {
    return null
  }
}

// ─── Token blacklist (logout) — in-memory Set, pruned every 10 min ───
const _blacklist = new Set<string>()
let _lastPrune = Date.now()

export function blacklistToken(token: string): void {
  const t = token.trim()
  if (!t) return
  _blacklist.add(t)
  // Prune every 10 minutes — tokens past their JWT exp are useless anyway,
  // but the Set can grow unbounded if many users log out.
  if (Date.now() - _lastPrune > 10 * 60 * 1000) {
    _blacklist.clear()
    _lastPrune = Date.now()
  }
}

export function isTokenBlacklisted(token: string): boolean {
  return _blacklist.has(token.trim())
}

// ─── Rate limiting (login) — 5 fails → 5 min lockout per username+IP ─
interface RateBucket {
  failures: number
  firstFailureAt: number
  lockedUntil: number // 0 = not locked
}
const _rateLimit = new Map<string, RateBucket>()
export const RATE_LIMIT_MAX_ATTEMPTS = 5
export const RATE_LIMIT_LOCKOUT_MS = 5 * 60 * 1000 // 5 minutes

/** Check the rate-limit bucket for `key`. Returns `{ allowed, retryAfterMs }`. */
export function checkLoginRateLimit(key: string): { allowed: boolean; retryAfterMs: number; attempts: number } {
  const k = String(key ?? '').toLowerCase().trim()
  const bucket = _rateLimit.get(k)
  if (!bucket) return { allowed: true, retryAfterMs: 0, attempts: 0 }
  // Expired lockout — reset
  if (bucket.lockedUntil && Date.now() > bucket.lockedUntil) {
    _rateLimit.delete(k)
    return { allowed: true, retryAfterMs: 0, attempts: 0 }
  }
  if (bucket.lockedUntil) {
    return { allowed: false, retryAfterMs: bucket.lockedUntil - Date.now(), attempts: bucket.failures }
  }
  return { allowed: true, retryAfterMs: 0, attempts: bucket.failures }
}

/** Record a failed login attempt; locks the bucket if MAX_ATTEMPTS reached. */
export function recordLoginFailure(key: string): { locked: boolean; retryAfterMs: number } {
  const k = String(key ?? '').toLowerCase().trim()
  const now = Date.now()
  let bucket = _rateLimit.get(k)
  if (!bucket) {
    bucket = { failures: 0, firstFailureAt: now, lockedUntil: 0 }
    _rateLimit.set(k, bucket)
  }
  bucket.failures += 1
  if (bucket.failures >= RATE_LIMIT_MAX_ATTEMPTS && !bucket.lockedUntil) {
    bucket.lockedUntil = now + RATE_LIMIT_LOCKOUT_MS
    return { locked: true, retryAfterMs: RATE_LIMIT_LOCKOUT_MS }
  }
  return { locked: false, retryAfterMs: 0 }
}

/** Clear the rate-limit bucket after a successful login. */
export function clearLoginRateLimit(key: string): void {
  _rateLimit.delete(String(key ?? '').toLowerCase().trim())
}
