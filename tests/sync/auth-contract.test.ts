// ============================================================
// PR-SYNC-1 Auth Contract Tests — authToken in POST body
// ============================================================
// P9-03: Regression tests for the new auth contract.
// All tests run with default SYNC_SOURCE_MAX_RETRIES=3.
//
// Key design decisions:
// - NO fake timers (vi.useFakeTimers causes deadlocks with async/await)
// - Instead, mock globalThis.setTimeout to resolve immediately
// - Success tests: mockResolvedValueOnce (returns once, no retry needed)
// - Error tests: mockResolvedValue (returns on every retry attempt)
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchFromAppsScript, _setSiteAllowlistForTesting } from '@/lib/sync-adapter'

// ── Mock fetch ──────────────────────────────────────────────
const mockFetch = vi.fn()
globalThis.fetch = mockFetch as unknown as typeof fetch

// ── Mock setTimeout to skip real delays ─────────────────────
// The retry loop uses: await new Promise(r => setTimeout(r, delay))
// By making setTimeout call the callback immediately, we skip the
// 1s/2s/4s delays without using fake timers (which deadlock with async).
const originalSetTimeout = globalThis.setTimeout
function mockSetTimeout(fn: (...args: unknown[]) => void, _delay?: number): NodeJS.Timeout {
  // Execute immediately — no real delay
  fn()
  return 0 as unknown as NodeJS.Timeout
}

beforeEach(() => {
  mockFetch.mockReset()
  // Replace setTimeout with instant-execution version
  globalThis.setTimeout = mockSetTimeout as typeof globalThis.setTimeout
  _setSiteAllowlistForTesting(new Set(['HQ', 'UDH']))
})

afterEach(() => {
  // Restore real setTimeout
  globalThis.setTimeout = originalSetTimeout
})

describe('Auth contract: authToken in POST body', () => {

  it('request body contains authToken', async () => {
    process.env.APPS_SCRIPT_SERVICES_URL = 'https://example.com/exec'
    process.env.APPS_SCRIPT_SERVICES_TOKEN = 'test-token-123'

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        records: [{ requestId: 'WO-001', subject: 'Test', status: 'PENDING', siteCode: 'HQ' }],
        metadata: { totalFetched: 1, cursor: null, unmappedColumns: [] },
      }),
    })

    await fetchFromAppsScript({ source: 'services', limit: 100 })

    const callArgs = mockFetch.mock.calls[0]
    const body = JSON.parse(callArgs[1].body)
    expect(body.authToken).toBe('test-token-123')
  })

  it('no Authorization header in request', async () => {
    process.env.APPS_SCRIPT_SERVICES_URL = 'https://example.com/exec'
    process.env.APPS_SCRIPT_SERVICES_TOKEN = 'test-token-123'

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ records: [], metadata: { totalFetched: 0, cursor: null, unmappedColumns: [] } }),
    })

    await fetchFromAppsScript({ source: 'services' })

    const callArgs = mockFetch.mock.calls[0]
    const headers = callArgs[1].headers
    expect(headers['Authorization']).toBeUndefined()
    expect(headers['authorization']).toBeUndefined()
  })

  it('token not in URL query string', async () => {
    process.env.APPS_SCRIPT_SERVICES_URL = 'https://example.com/exec'
    process.env.APPS_SCRIPT_SERVICES_TOKEN = 'secret-token-456'

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ records: [], metadata: { totalFetched: 0, cursor: null, unmappedColumns: [] } }),
    })

    await fetchFromAppsScript({ source: 'services' })

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).not.toContain('token')
    expect(url).not.toContain('secret')
    expect(url).not.toContain('authToken')
    expect(url).not.toContain('auth')
  })

  it('Apps Script error response → adapter throws after 3 retries', async () => {
    process.env.APPS_SCRIPT_SERVICES_URL = 'https://example.com/exec'
    process.env.APPS_SCRIPT_SERVICES_TOKEN = 'test-token-123'

    // mockResolvedValue returns the same response on every call
    // (3 retries × 1 call each = 3 total calls)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        error: 'Unauthorized: missing or invalid token',
        code: 'UNAUTHORIZED',
      }),
    })

    await expect(fetchFromAppsScript({ source: 'services' }))
      .rejects.toThrow('Source error: Unauthorized')

    // Verify all 3 retry attempts were made (default SYNC_SOURCE_MAX_RETRIES=3)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('successful response returns records and metadata', async () => {
    process.env.APPS_SCRIPT_SERVICES_URL = 'https://example.com/exec'
    process.env.APPS_SCRIPT_SERVICES_TOKEN = 'test-token-123'

    const mockRecords = [
      { requestId: 'WO-001', subject: 'Test WO 1', status: 'PENDING', siteCode: 'HQ' },
      { requestId: 'WO-002', subject: 'Test WO 2', status: 'IN_PROGRESS', siteCode: 'UDH' },
    ]

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        records: mockRecords,
        metadata: { totalFetched: 2, cursor: 'offset:2', unmappedColumns: [] },
      }),
    })

    const result = await fetchFromAppsScript({ source: 'services', limit: 100 })

    expect(result.records).toHaveLength(2)
    expect(result.records[0].requestId).toBe('WO-001')
    expect(result.metadata.totalFetched).toBe(2)
    expect(result.metadata.cursor).toBe('offset:2')
  })

  it('token not in error messages (no echo)', async () => {
    process.env.APPS_SCRIPT_SERVICES_URL = 'https://example.com/exec'
    process.env.APPS_SCRIPT_SERVICES_TOKEN = 'super-secret-token-xyz'

    // mockResolvedValue for all 3 retry attempts
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        error: 'Unauthorized: missing or invalid token',
        code: 'UNAUTHORIZED',
      }),
    })

    try {
      await fetchFromAppsScript({ source: 'services' })
      expect.fail('Should have thrown')
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      expect(errMsg).not.toContain('super-secret-token-xyz')
      expect(errMsg).not.toContain('super')
      expect(errMsg).not.toContain('secret')
    }
  })

  it('missing token env var → throws configuration error', async () => {
    delete process.env.APPS_SCRIPT_SERVICES_URL
    delete process.env.APPS_SCRIPT_SERVICES_TOKEN

    await expect(fetchFromAppsScript({ source: 'services' }))
      .rejects.toThrow('Source URL not configured')
  })

  it('HTTP non-200 response → throws with status code after 3 retries', async () => {
    process.env.APPS_SCRIPT_SERVICES_URL = 'https://example.com/exec'
    process.env.APPS_SCRIPT_SERVICES_TOKEN = 'test-token-123'

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    })

    await expect(fetchFromAppsScript({ source: 'services' }))
      .rejects.toThrow('Source responded 500')

    // Verify all 3 retry attempts were made
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })
})
