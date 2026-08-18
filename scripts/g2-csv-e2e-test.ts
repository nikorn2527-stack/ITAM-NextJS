// ============================================================
// G2 CSV Fallback E2E Test (Audit P1-R6 — HTTP /api/import route, fail-closed)
// ============================================================
// Calls POST /api/import with a real CSV file via HTTP (not direct SQL),
// then asserts (FAIL-CLOSED per Audit P1):
//   - HTTP 201 + ImportJob status=completed
//   - WorkOrders created + requestId/siteCode populated (field mapping acceptance)
//   - AuditLog entries ≥1 per WorkOrder (fail if 0)
//   - Invalid CSV must reject (400) OR errorRows>0 (fail if accepted silently)
//
// P0 security fix: NO hardcoded credential fallback.
// Test fails fast (exit 2) if STAGING_DB_URL/DATABASE_URL not set via env.
// ============================================================

import pg from 'pg'

const IMPORT_URL = process.env.IMPORT_URL || 'http://localhost:3000/api/import'

// ── Staging DB URL — MUST be provided via environment (NO hardcoded fallback) ──
// P0 security fix (Audit blocker): no credential in source files.
const STAGING_DB_URL = process.env.STAGING_DB_URL || process.env.DATABASE_URL || ''
if (!STAGING_DB_URL) {
  console.error('FATAL: STAGING_DB_URL or DATABASE_URL environment variable is required.')
  console.error('Set it before running this test. Do NOT hardcode credentials in source files.')
  process.exit(2)
}

interface TestResult {
  name: string
  passed: boolean
  detail: string
}

const results: TestResult[] = []

function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail })
  console.log(`${passed ? '✓' : '✗'} ${name}`)
  if (detail) console.log(`  → ${detail}`)
}

const c = new pg.Client({ connectionString: STAGING_DB_URL })

// ── Test 1: POST /api/import with valid CSV → 201 + ImportJob + WorkOrders ──
async function test1_validCsvImport() {
  const csvContent =
    'requestId,subject,status,siteCode\nCSV-E2E-001,CSV E2E Test 1,PENDING,HQ\nCSV-E2E-002,CSV E2E Test 2,IN_PROGRESS,UDH'
  const formData = new FormData()
  const blob = new Blob([csvContent], { type: 'text/csv' })
  formData.append('file', blob, 'test.csv')
  formData.append('jobType', 'work-order')

  const resp = await fetch(IMPORT_URL, {
    method: 'POST',
    body: formData,
  })
  const data = await resp.json().catch(() => ({}))

  // Assert HTTP 201 exactly (fail-closed — Audit P1: status must match contract)
  const httpOk = resp.status === 201
  const jobCompleted = data.job?.status === 'completed'
  const rowsProcessed = data.job?.processedRows === 2
  record(
    'Test 1a: POST /api/import valid CSV → HTTP 201 + ImportJob status=completed, processedRows=2',
    httpOk && jobCompleted && rowsProcessed,
    `HTTP ${resp.status} (expected 201) | job.status=${data.job?.status} | processedRows=${data.job?.processedRows}/${data.job?.totalRows} | errorRows=${data.job?.errorRows}`,
  )

  // Assert WorkOrders created + field mapping (fail-closed — Audit P1: mapping must assert)
  const wo = await c.query(
    `SELECT id, "requestId", subject, "siteCode", status FROM "WorkOrder" WHERE subject LIKE 'CSV E2E Test%' ORDER BY "createdAt" DESC LIMIT 5`,
  )
  const woCount = wo.rows.length
  const requestIdPopulated = wo.rows.filter((r) => r.requestId).length
  const siteCodePopulated = wo.rows.filter((r) => r.siteCode).length
  const mappingComplete = woCount >= 2 && requestIdPopulated === woCount && siteCodePopulated === woCount
  record(
    'Test 1b: WorkOrders created + requestId/siteCode populated (field mapping acceptance)',
    mappingComplete,
    `found ${woCount} WorkOrders | requestId populated: ${requestIdPopulated}/${woCount} | siteCode populated: ${siteCodePopulated}/${woCount} ${mappingComplete ? '' : '(FAIL — field mapping gap is production-code concern)'}`,
  )

  return { jobId: data.job?.id, woIds: wo.rows.map((r) => r.id) }
}

// ── Test 2: AuditLog entries created per record (FAIL-CLOSED per Audit P1) ──
async function test2_auditLogPerRecord(woIds: string[]) {
  if (woIds.length === 0) {
    record('Test 2: AuditLog created per WorkOrder (fail-closed)', false, 'no WorkOrders found (Test 1 must pass first)')
    return
  }

  const auditEntries = await c.query(
    'SELECT "entityId", action, "siteCode", actor, summary FROM "AuditLog" WHERE "entityId" = ANY($1) ORDER BY "createdAt"',
    [woIds],
  )

  const auditCount = auditEntries.rows.length
  const auditOk = auditCount >= woIds.length
  record(
    'Test 2: AuditLog created per WorkOrder (fail-closed — must have ≥1 per record)',
    auditOk,
    `AuditLog entries: ${auditCount} (expected ≥ ${woIds.length}) ${auditOk ? '✓' : '✗ FAIL — route does not fire logAudit per-record (production-code gap, BLOCKING)'}`,
  )

  for (const a of auditEntries.rows.slice(0, 3)) {
    console.log(`    audit: action=${a.action} entityId=${String(a.entityId).slice(0, 12)}... siteCode=${a.siteCode} actor=${a.actor}`)
  }
}

// ── Test 3: POST /api/import with invalid CSV → must reject or errorRows>0 (FAIL-CLOSED) ──
async function test3_invalidCsvValidation() {
  const csvContent = 'subject,status\nMissing requestId,PENDING'
  const formData = new FormData()
  const blob = new Blob([csvContent], { type: 'text/csv' })
  formData.append('file', blob, 'invalid.csv')
  formData.append('jobType', 'work-order')

  const resp = await fetch(IMPORT_URL, {
    method: 'POST',
    body: formData,
  })
  const data = await resp.json().catch(() => ({}))

  const routeRejects = resp.status >= 400
  const routeReportsErrors = data.job && data.job.errorRows > 0
  const routeAcceptsSilently = data.job && data.job.status === 'completed' && data.job.errorRows === 0
  const validationOk = routeRejects || routeReportsErrors

  record(
    'Test 3: POST /api/import invalid CSV (missing requestId) → reject (400) OR errorRows>0 (fail-closed)',
    validationOk,
    `HTTP ${resp.status} | ${routeRejects ? 'route rejects (400+) ✓' : routeReportsErrors ? 'route accepts with errorRows>0 ✓' : routeAcceptsSilently ? 'route accepts silently ✗ FAIL — validation gap (production-code concern, BLOCKING)' : 'other ✗'}`,
  )
}

// ── Test 4: /api/import route structure verified (route-level) ──
async function test4_routeStructure() {
  const fs = await import('fs')
  const routeContent = fs.readFileSync('src/app/api/import/route.ts', 'utf8')
  const hasPost = routeContent.includes('export async function POST')
  const hasLogAudit = routeContent.includes('logAudit')
  const hasCsvParse = routeContent.includes('parseCsv') || routeContent.includes('mapCsvRow')
  const hasJobTypeValidation = routeContent.includes('VALID_JOB_TYPES')
  record(
    'Test 4: /api/import route structure (POST + logAudit + CSV parse + jobType validation)',
    hasPost && hasLogAudit && hasCsvParse && hasJobTypeValidation,
    `POST=${hasPost} | logAudit=${hasLogAudit} | CSV parse=${hasCsvParse} | jobType validation=${hasJobTypeValidation}`,
  )
}

// ── Run all tests ──
console.log('=== G2 CSV Fallback E2E Test (P1-R6 — HTTP /api/import route, fail-closed) ===')
console.log(`Import URL: ${IMPORT_URL}`)
console.log(`Timestamp (UTC): ${new Date().toISOString()}`)
console.log('')

await c.connect()

await c.query('DELETE FROM "AuditLog" WHERE "entityId" IN (SELECT id FROM "WorkOrder" WHERE subject LIKE $1)', ['CSV E2E Test%']).catch(() => {})
await c.query('DELETE FROM "WorkOrder" WHERE subject LIKE $1', ['CSV E2E Test%']).catch(() => {})
await c.query('DELETE FROM "ImportJob" WHERE "fileName" IN ($1, $2)', ['test.csv', 'invalid.csv']).catch(() => {})

try {
  const { woIds } = await test1_validCsvImport()
  await test2_auditLogPerRecord(woIds)
  await test3_invalidCsvValidation()
  await test4_routeStructure()
} finally {
  await c.query('DELETE FROM "AuditLog" WHERE "entityId" IN (SELECT id FROM "WorkOrder" WHERE subject LIKE $1)', ['CSV E2E Test%']).catch(() => {})
  await c.query('DELETE FROM "WorkOrder" WHERE subject LIKE $1', ['CSV E2E Test%']).catch(() => {})
  await c.query('DELETE FROM "ImportJob" WHERE "fileName" IN ($1, $2)', ['test.csv', 'invalid.csv']).catch(() => {})
  const remaining = await c.query('SELECT count(*) as n FROM "WorkOrder" WHERE subject LIKE $1', ['CSV E2E Test%'])
  console.log('')
  console.log(`--- cleanup: remaining CSV E2E Test* WorkOrders: ${remaining.rows[0].n} (should be 0) ---`)
  await c.end()
}

const passed = results.filter((r) => r.passed).length
const failed = results.filter((r) => !r.passed).length
console.log('')
console.log('=== Summary ===')
console.log(`Passed: ${passed}`)
console.log(`Failed: ${failed}`)
console.log(failed === 0 ? '\n✅ All CSV E2E tests passed (true HTTP /api/import route, fail-closed)' : '\n❌ Some tests failed (production-code gaps documented)')

if (failed > 0) process.exit(1)

export {}
