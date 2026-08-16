// ============================================================
// Sync-specific tests — PR-SYNC-1
// ============================================================
// 11 test groups per Audit List acceptance criteria
// Runner: vitest (pinned in devDependencies)
// Database: PostgreSQL 16.x required for Groups 5–11
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  deriveSiteCode,
  redacted,
  mapSourceRecord,
  getSiteAllowlist,
  _setSiteAllowlistForTesting,
} from '@/lib/sync-adapter'

// ── Cache isolation (I-08-04) ────────────────────────────────
// Use dependency injection seam to control allowlist per test

afterEach(() => {
  // Clear test override after each test
  _setSiteAllowlistForTesting(null)
})

// ── Test Group 1: Site mapping — direct siteCode ─────────────

describe('deriveSiteCode — direct siteCode', () => {
  it('maps valid allowlisted siteCode', async () => {
    _setSiteAllowlistForTesting(new Set(['UDH', 'NKP']))
    const result = await deriveSiteCode({ siteCode: 'UDH' })
    expect(result.reason).toBe('mapped')
    expect(result.siteCode).toBe('UDH')
  })

  it('quarantines unknown siteCode', async () => {
    _setSiteAllowlistForTesting(new Set(['UDH', 'NKP']))
    const result = await deriveSiteCode({ siteCode: 'FAKE-SITE-999' })
    expect(result.reason).toBe('unknown')
    expect(result.siteCode).toBeNull()
  })

  it('quarantines when allowlist is empty', async () => {
    _setSiteAllowlistForTesting(new Set())
    const result = await deriveSiteCode({ siteCode: 'UDH' })
    expect(result.reason).toBe('unknown')
    expect(result.siteCode).toBeNull()
  })

  it('quarantines when DB is unavailable (exception path)', async () => {
    // Simulate DB unavailable: set override to null, then clear cache
    // The adapter will try to load from DB; if DB throws, it returns empty set
    // For unit test: we test the empty-set path (which is what DB failure produces)
    _setSiteAllowlistForTesting(new Set())
    const result = await deriveSiteCode({ siteCode: 'UDH' })
    expect(result.reason).toBe('unknown')
    expect(result.siteCode).toBeNull()
    // Note: actual DB exception path requires integration test with mocked DB
  })

  it('rejects whitespace-only siteCode', async () => {
    _setSiteAllowlistForTesting(new Set(['UDH']))
    const result = await deriveSiteCode({ siteCode: '   ' })
    expect(result.reason).toBe('missing')
    expect(result.siteCode).toBeNull()
  })
})

// ── Test Group 2: Site mapping — source site field ────────────

describe('deriveSiteCode — site field', () => {
  it('maps valid allowlisted site', async () => {
    _setSiteAllowlistForTesting(new Set(['UDH']))
    const result = await deriveSiteCode({ site: 'UDH' })
    expect(result.reason).toBe('mapped')
    expect(result.siteCode).toBe('UDH')
  })

  it('quarantines unknown site', async () => {
    _setSiteAllowlistForTesting(new Set(['UDH']))
    const result = await deriveSiteCode({ site: 'UNKNOWN-SITE' })
    expect(result.reason).toBe('unknown')
    expect(result.siteCode).toBeNull()
  })

  it('quarantines missing site', async () => {
    _setSiteAllowlistForTesting(new Set(['UDH']))
    const result = await deriveSiteCode({ subject: 'test' })
    expect(result.reason).toBe('missing')
    expect(result.siteCode).toBeNull()
  })

  it('quarantines empty site', async () => {
    _setSiteAllowlistForTesting(new Set(['UDH']))
    const result = await deriveSiteCode({ site: '' })
    expect(result.reason).toBe('missing')
    expect(result.siteCode).toBeNull()
  })

  it('quarantines site when allowlist empty', async () => {
    _setSiteAllowlistForTesting(new Set())
    const result = await deriveSiteCode({ site: 'UDH' })
    expect(result.reason).toBe('unknown')
    expect(result.siteCode).toBeNull()
  })

  it('prefers direct siteCode over site field', async () => {
    _setSiteAllowlistForTesting(new Set(['UDH', 'NKP']))
    const result = await deriveSiteCode({ siteCode: 'NKP', site: 'UDH' })
    expect(result.reason).toBe('mapped')
    expect(result.siteCode).toBe('NKP')
  })
})

// ── Test Group 3: Redaction ──────────────────────────────────

describe('redacted()', () => {
  it('keeps allowlisted fields', () => {
    const input = { subject: 'test', status: 'PENDING', site: 'UDH' }
    const result = redacted(input)
    expect(result).toEqual({ subject: 'test', status: 'PENDING', site: 'UDH' })
  })

  it('strips non-allowlisted fields (PII/credentials)', () => {
    const input = {
      subject: 'test',
      password: 'secret',
      token: 'abc123',
      email: 'a@b.com',
      phone: '0812345678',
      apiKey: 'sk-xxx',
      site: 'UDH',
    }
    const result = redacted(input)
    expect(result).toEqual({ subject: 'test', site: 'UDH' })
    expect(result).not.toHaveProperty('password')
    expect(result).not.toHaveProperty('token')
    expect(result).not.toHaveProperty('email')
    expect(result).not.toHaveProperty('phone')
    expect(result).not.toHaveProperty('apiKey')
  })

  it('returns null for null input', () => {
    expect(redacted(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(redacted(undefined)).toBeNull()
  })

  it('returns empty object for empty input', () => {
    expect(redacted({})).toEqual({})
  })

  it('strips internal fields (id, createdAt, updatedAt)', () => {
    const input = {
      id: 'clxxx',
      subject: 'test',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
      version: 5,
    }
    const result = redacted(input)
    expect(result).toEqual({ subject: 'test' })
  })
})

// ── Test Group 4: Field mapping ──────────────────────────────

describe('mapSourceRecord()', () => {
  it('maps known fields via FIELD_MAPPINGS.workOrder', () => {
    const record = { subject: 'Test WO', status: 'รอดำเนินการ', site: 'UDH' }
    const { mapped, unmapped } = mapSourceRecord(record)
    expect(mapped).toHaveProperty('subject', 'Test WO')
    expect(mapped).toHaveProperty('status')
    expect(unmapped).not.toContain('subject')
  })

  it('tracks unmapped columns', () => {
    const record = { subject: 'Test', unknownCol: 'value', anotherNew: 123 }
    const { unmapped } = mapSourceRecord(record)
    expect(unmapped).toContain('unknownCol')
    expect(unmapped).toContain('anotherNew')
  })

  it('handles empty record', () => {
    const { mapped, unmapped } = mapSourceRecord({})
    expect(Object.keys(mapped)).toHaveLength(0)
    expect(unmapped).toHaveLength(0)
  })

  it('maps status through STATUS_MAPPINGS', () => {
    const record = { status: 'รอดำเนินการ' }
    const { mapped } = mapSourceRecord(record)
    expect(mapped.status).toBe('PENDING')
  })
})

// ── getSiteAllowlist (direct test) ───────────────────────────

describe('getSiteAllowlist()', () => {
  it('returns override when set', async () => {
    _setSiteAllowlistForTesting(new Set(['A', 'B']))
    const result = await getSiteAllowlist()
    expect(result.size).toBe(2)
    expect(result.has('A')).toBe(true)
    expect(result.has('B')).toBe(true)
  })

  it('returns empty set when override is empty', async () => {
    _setSiteAllowlistForTesting(new Set())
    const result = await getSiteAllowlist()
    expect(result.size).toBe(0)
  })
})

// ── Groups 5–11: DB-dependent tests ─────────────────────────
// These require PostgreSQL 16.x + migration + seed data
// Marked as it.todo() until CI fixture is available (I-08-01)
// Each todo has arrange/act/assert spec for implementation

describe('Preview no-write (requires PostgreSQL)', () => {
  it.todo('does not modify WorkOrder table after 2 preview runs')
  // Arrange: seeded DB with known WorkOrder count
  // Act: POST /api/sync/preview twice with same source/options
  // Assert: WorkOrder count unchanged; SyncRun created with mode=preview, status=completed

  it.todo('creates SyncRun and SyncRunItem records only')
  // Assert: only SyncRun/SyncRunItem tables modified; WorkOrder/Device/StockItem unchanged
})

describe('Idempotency (requires PostgreSQL)', () => {
  it.todo('apply twice does not create duplicate WorkOrder')
  // Arrange: preview with known requestId, apply once
  // Act: apply again with same previewRunId
  // Assert: 1 WorkOrder with that requestId, SyncRunItem shows skip on second run

  it.todo('source duplicates within batch are quarantined')
  // Arrange: source records with same requestId in one batch
  // Act: preview
  // Assert: one create, one error with duplicate message
})

describe('Site scope authorization (requires PostgreSQL)', () => {
  it.todo('non-superadmin cannot view cross-site run')
  // Arrange: admin for Site A creates run for Site B
  // Act: GET /api/sync/runs/:id as admin for Site A
  // Assert: 403

  it.todo('non-superadmin cannot apply cross-site run')
  // Arrange: preview run for Site B, admin for Site A
  // Act: POST /api/sync/run as admin for Site A
  // Assert: 403

  it.todo('out-of-scope items are quarantined during apply')
  // Arrange: admin for Site A, preview with Site B item mixed in
  // Act: POST /api/sync/run
  // Assert: Site A items applied, Site B items status=error OUT_OF_SCOPE
})

describe('Conflict detection (requires PostgreSQL)', () => {
  it.todo('version mismatch after preview → CONFLICT')
  // Arrange: preview, then update WorkOrder.version in DB
  // Act: POST /api/sync/run
  // Assert: item status=error, errorMessage contains CONFLICT

  it.todo('record deleted after preview → CONFLICT')
  // Arrange: preview, then delete WorkOrder from DB
  // Act: POST /api/sync/run
  // Assert: item status=error, CONFLICT

  it.todo('record created by another source → CONFLICT')
  // Arrange: preview with action=create, then insert WorkOrder with same requestId
  // Act: POST /api/sync/run
  // Assert: item status=error, CONFLICT
})

describe('Audit log (requires PostgreSQL)', () => {
  it.todo('creates SYNC_APPLY audit entry per applied item')
  // Arrange: preview with 3 create items
  // Act: POST /api/sync/run
  // Assert: 3 AuditLog rows with action=SYNC_APPLY, correct entityId/siteCode

  it.todo('AuditLog.detail is String (JSON.stringify, not object)')
  // Assert: typeof detail === 'string', JSON.parse(detail) returns expected structure

  it.todo('AuditLog.detail is redacted — no PII/credentials')
  // Assert: detail JSON does not contain password, token, email, phone, apiKey
})

describe('P2034 retry counters (requires PostgreSQL)', () => {
  it.todo('records attempts and p2034Count on SyncRun after apply')
  // Arrange: force concurrent transactions to trigger P2034
  // Act: apply with concurrent modification
  // Assert: SyncRun.attempts >= 1, p2034Count >= 0 (or > 0 if conflict occurred)
})

describe('Route authorization (requires PostgreSQL)', () => {
  it.todo('rejects non-ADMIN user with 403')
  // Arrange: auth token with viewer/editor role
  // Act: POST /api/sync/preview
  // Assert: 403 response body contains error

  it.todo('rejects apply of another user\'s preview run')
  // Arrange: admin A creates preview run, admin B (different email) tries apply
  // Act: POST /api/sync/run with previewRunId
  // Assert: 403

  it.todo('rejects retry of another user\'s run')
  // Arrange: admin A creates run with errors, admin B tries retry
  // Act: POST /api/sync/runs/:id/retry
  // Assert: 403

  it.todo('SYNC_RUN permission not in auth-shared.ts')
  // Static check: grep src/lib/auth-shared.ts for SYNC_RUN
  // Assert: no match found (use ADMIN instead)
})
