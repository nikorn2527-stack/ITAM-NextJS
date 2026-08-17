// ============================================================
// PR-SYNC-1 Auth Contract Tests — authToken in POST body
// ============================================================
// P9-03: Regression tests for the new auth contract:
//   1. Request body contains authToken
//   2. No Authorization header sent
//   3. Token not in URL/query string
//   4. Apps Script error response → adapter throws
//   5. Successful response → records + metadata returned
//   6. Token not logged/echoed
//
// These tests mock the fetch call to verify the adapter sends
// the correct request format without needing a real Apps Script endpoint.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchFromAppsScript, _setSiteAllowlistForTesting } from '@/lib/sync-adapter'

// ── Mock fetch to inspect request format ───────────────────
const mockFetch = vi.fn()
globalThis.fetch = mockFetch as unknown as typeof fetch

beforeEach(() => {
  mockFetch.mockReset()
  // Use fake timers to skip the 1s/2s/4s retry delays
  vi.useFakeTimers()
  _setSiteAllowlistForTesting(new Set(['HQ', 'UDH']))
})

afterEach(() => {
  vi.useRealTimers()
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

  it('Apps Script error response → adapter throws', async () => {
    process.env.APPS_SCRIPT_SERVICES_URL = 'https://example.com/exec'
    process.env.APPS_SCRIPT_SERVICES_TOKEN = 'test-token-123'

    // Apps Script returns HTTP 200 but JSON body has error (P9-02 contract)
    // Use mockResolvedValue (not Once) because adapter retries 3 times
    // by default (SYNC_SOURCE_MAX_RETRIES=3). Each retry gets the same error.
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        error: 'Unauthorized: missing or invalid token',
        code: 'UNAUTHORIZED',
      }),
    })

    await expect(fetchFromAppsScript({ source: 'services' }))
      .rejects.toThrow('Source error: Unauthorized')

    // Verify all 3 retry attempts were made
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

    // Simulate source error
    mockFetch.mockResolvedValueOnce({
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

  it('HTTP non-200 response → throws with status code', async () => {
    process.env.APPS_SCRIPT_SERVICES_URL = 'https://example.com/exec'
    process.env.APPS_SCRIPT_SERVICES_TOKEN = 'test-token-123'

    // Use mockResolvedValue (not Once) because adapter retries 3 times.
    // Each retry gets the same HTTP 500 error.
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
