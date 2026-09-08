/**
 * webauthn-challenge-store.ts — In-memory challenge storage for WebAuthn.
 *
 * Challenges are short-lived (5 min) and tied to a key (e.g. user ID or email).
 * On serverless, this resets per instance — but for our use case (single
 * instance + quick browser round-trip) this is fine.
 *
 * For production multi-instance, swap this for Vercel KV or Redis.
 */

interface ChallengeEntry {
  challenge: string
  expiresAt: number
}

const store = new Map<string, ChallengeEntry>()

const TTL_MS = 5 * 60 * 1000 // 5 minutes

// Cleanup expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt < now) store.delete(key)
    }
  }, 5 * 60 * 1000).unref?.()
}

export function setChallenge(key: string, challenge: string): void {
  store.set(key, { challenge, expiresAt: Date.now() + TTL_MS })
}

export function getChallenge(key: string): string | null {
  const entry = store.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    store.delete(key)
    return null
  }
  return entry.challenge
}

export function deleteChallenge(key: string): void {
  store.delete(key)
}
