/**
 * retry-transaction.ts — Server-side retry for Prisma serialization conflicts.
 *
 * Wraps a Prisma transaction with automatic retry on P2034
 * (serialization conflict). This is required for Serializable isolation
 * level transactions where concurrent writes may conflict.
 *
 * Usage:
 *   const result = await withSerializableRetry(async (tx) => {
 *     // transaction logic
 *   }, { maxRetries: 3 })
 *
 * Task ID: B4-RETRY-P2034
 */

import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export interface RetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
}

/**
 * Execute a Prisma transaction with Serializable isolation and automatic
 * retry on serialization conflict (P2034).
 *
 * The transaction is retried with exponential backoff:
 *   attempt 1: immediate
 *   attempt 2: after baseDelayMs (default 50ms)
 *   attempt 3: after baseDelayMs * 2 (100ms)
 *   attempt 4: after baseDelayMs * 4 (200ms)
 *
 * If all retries fail, the last error is thrown.
 */
export async function withSerializableRetry<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3
  const baseDelayMs = options?.baseDelayMs ?? 50
  const maxDelayMs = options?.maxDelayMs ?? 500

  let lastError: unknown = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: 'Serializable',
      })
    } catch (err) {
      lastError = err

      // Check if this is a serialization conflict (P2034)
      // Prisma wraps PostgreSQL errors with code P2034 for serialization
      // failures. We also check the message for robustness.
      const isSerializationConflict =
        (err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2034') ||
        (err instanceof Error &&
          (err.message.includes('could not serialize') ||
            err.message.includes('P2034') ||
            err.message.includes('serialization')))

      if (!isSerializationConflict) {
        // Not a serialization conflict — re-throw immediately
        throw err
      }

      // Last attempt — don't wait, just re-throw
      if (attempt === maxRetries - 1) {
        break
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt),
        maxDelayMs,
      )
      const jitter = Math.random() * delay * 0.1
      await new Promise((resolve) => setTimeout(resolve, delay + jitter))
    }
  }

  throw lastError
}
