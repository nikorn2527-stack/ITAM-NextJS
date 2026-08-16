# PR-SYNC-1 Audit List — Pre-Implementation Review Form

**เอกสารนี้:** แบบฟอร์มตรวจสอบก่อนเริ่ม implementation ของ PR-SYNC-1 (Legacy Apps Script → ITAM-NextJS Manual Sync, MVP: Services → Work Orders)
**ผู้กรอก:** ทีมพัฒนา
**ผู้ตรวจ:** ทีม Audit
**Reference spec:** `docs/TASK-legacy-sync.md` (commit `7f99503` ขึ้นไป)
**Baseline:** `ee75164` (B4 GO, frozen) — ห้ามแก้ B4 production files

---

## กฎเหล็ก (อ่านก่อนกรอก)

> **ห้ามเริ่ม migration / API / UI หากยังมีรายการใดที่ Status = `FAIL` หรือ `BLOCKED` ในหมวด Critical (C-*)**
>
> รายการ Critical คือข้อที่ขึ้นต้นด้วย `C-` (C-1 ถึง C-17) ในตารางด้านล่าง
> รายการ Non-critical (`NC-*`) สามารถเป็น `TBD` ได้ขณะเริ่ม implementation แต่ต้องปิดก่อน merge PR

### ค่า Status ที่ใช้

| ค่า | ความหมาย | สามารถเริ่ม implementation ได้? |
|---|---|---|
| `PASS` | ตรวจแล้วถูกต้อง มี evidence | ✅ ได้ |
| `FAIL` | ตรวจแล้วผิด ต้องแก้ spec ก่อน | ❌ ห้าม (ถ้าเป็น C-*) |
| `TBD` | ยังไม่ได้ตรวจ / ยังไม่ตัดสินใจ | ⚠️ ได้ถ้าเป็น NC-* เท่านั้น |
| `N/A` | ไม่นำไปใช้ใน Phase 1 | ✅ ได้ (ระบุเหตุผล) |
| `BLOCKED` | ติดปัญหา รอทีมอื่น | ❌ ห้าม (ถ้าเป็น C-*) |

### ฟิลด์ที่ต้องกรอกในตาราง

- **Status** — หนึ่งใน PASS / FAIL / TBD / N/A / BLOCKED
- **Owner** — ชื่อคน/ทีมที่รับผิดชอบตรวจข้อนั้น
- **Due date** — วันที่จะส่งผลตรวจ (YYYY-MM-DD)
- **Evidence path** — path ของไฟล์/commit/PR ที่เป็นหลักฐาน (เช่น `docs/TASK-legacy-sync.md:148`, `commit 7f99503`, `prisma/schema.prisma:42`)
- **Notes** — ข้อสังเกต / สิ่งที่ต้องแก้ / เหตุผลถ้า N/A

---

## สรุปผล (กรอกหลังตรวจครบ)

| ตัวชี้วัด | ค่า |
|---|---|
| รายการ Critical ทั้งหมด | 17 |
| รายการ Critical ที่ PASS | ___ / 17 |
| รายการ Critical ที่ FAIL/BLOCKED | ___ / 17 |
| รายการ Non-critical ทั้งหมด | ___ |
| **สถานะ Final** | ☐ GO to implementation ☐ BLOCKED (ระบุข้อ) |
| **ผู้อนุมัติ** | _________ |
| **วันที่อนุมัติ** | _________ |

> ถ้า Critical ที่ FAIL/BLOCKED > 0 → สถานะต้องเป็น **BLOCKED** และทีมพัฒนาต้องแก้ spec ก่อนส่ง audit list รอบใหม่

---

## หมวดที่ 1: Source Contract & Field Mapping

### C-1 Source contract (Apps Script / Google Sheets API)

**Check:** Adapter ระบุ source URL, auth method, pagination cursor, rate limit, response shape ชัดเจน และ document ไว้ใน `src/lib/sync/services-adapter.ts` (Phase 1) หรือ spec

| # | Check item | Status | Owner | Due date | Evidence path | Notes |
|---|---|---|---|---|---|---|
| C-1.1 | URL pattern ของ Apps Script Web App ระบุชัด (เช่น `https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec`) | ☐ | | | | |
| C-1.2 | Auth method เป็น server-side เท่านั้น (Bearer token ใน env var หรือ OAuth Service Account) — ไม่ใช้ browser credential | ☐ | | | | |
| C-1.3 | Pagination cursor กำหนดรูปแบบ (เช่น `?cursor=...&limit=...`) และ adapter รู้จัก handle "hasMore" | ☐ | | | | |
| C-1.4 | Rate limit / timeout ของ Apps Script ระบุค่า (เช่น 30s timeout, 3 retries) และไม่ exceed Google quota | ☐ | | | | |
| C-1.5 | Response shape มี schema ชัดเจน (records array + metadata) — ไม่ใช่ blob ที่ต้อง parse แบบ ad-hoc | ☐ | | | | |

### C-2 Field mapping (reuse `csv-field-mapping.ts`)

**Check:** Adapter ใช้ `FIELD_MAPPINGS` / `STATUS_MAPPINGS` / `TEMPLATE_HEADERS` จาก `src/lib/csv-field-mapping.ts` ที่มีอยู่ — ไม่เขียน mapping ใหม่

| # | Check item | Status | Owner | Due date | Evidence path | Notes |
|---|---|---|---|---|---|---|
| C-2.1 | Services → WorkOrder mapping ใช้ `FIELD_MAPPINGS.workOrder` จาก `src/lib/csv-field-mapping.ts` | ☐ | | | `src/lib/csv-field-mapping.ts:223` | |
| C-2.2 | Status conversion ใช้ `STATUS_MAPPINGS.workOrder` (emoji Thai → enum) | ☐ | | | `src/lib/csv-field-mapping.ts:265` | |
| C-2.3 | ทุก field ที่ legacy export มี adapter รู้จัก map (ไม่มี unmapped column ที่ critical) | ☐ | | | | |
| C-2.4 | Fields ที่ไม่ map ถูก log เป็น warning (ไม่ silent drop) | ☐ | | | | |

---

## หมวดที่ 2: Stable External Key & Idempotency

### C-3 Stable external key

**Check:** แต่ละ target มี external key ที่ stable + unique ใน Prisma schema

| # | Check item | Status | Owner | Due date | Evidence path | Notes |
|---|---|---|---|---|---|---|
| C-3.1 | `WorkOrder.requestId` เป็น `@unique` | ☐ | | | `prisma/schema.prisma` (WorkOrder model) | มีอยู่แล้ว |
| C-3.2 | `Device.assetCode` เป็น `@unique` (Phase 2) | ☐ | | | | N/A สำหรับ Phase 1 |
| C-3.3 | `StockItem.productCode` เป็น `@unique` (Phase 3) | ☐ | | | | N/A สำหรับ Phase 1 |
| C-3.4 | `MeterReading.readingId` เป็น `@unique` (Phase 2) — ต้องเพิ่มถ้ายังไม่มี | ☐ | | | | N/A สำหรับ Phase 1 |
| C-3.5 | `StockTransaction.sourceKey` เป็น `@unique` (Phase 3) — ต้องเพิ่ม + backfill | ☐ | | | | N/A สำหรับ Phase 1 |

### C-4 Duplicate policy (idempotency)

**Check:** sync ซ้ำไม่สร้าง duplicate + ไม่ override โดยไม่ตั้งใจ

| # | Check item | Status | Owner | Due date | Evidence path | Notes |
|---|---|---|---|---|---|---|
| C-4.1 | Lookup ใช้ `externalKey` เท่านั้น ไม่ใช้ `id` ภายใน | ☐ | | | `docs/TASK-legacy-sync.md` §6 | |
| C-4.2 | Preview เปรียบเทียบ `after` กับ record ปัจจุบัน → skip ถ้า unchanged | ☐ | | | §6 | |
| C-4.3 | Apply ใช้ `upsert` (Prisma) ด้วย `where: { requestId }` | ☐ | | | §6 | |
| C-4.4 | Soft delete: record หายจาก source ไม่ลบใน DB (เก็บไว้ + warning) | ☐ | | | §6 edge case | |

---

## หมวดที่ 3: Preview No-Write & Transaction

### C-5 Preview no-write guarantee

**Check:** Preview mode ไม่เขียนข้อมูลจริงใดๆ ลง WorkOrder/Device/StockItem

| # | Check item | Status | Owner | Due date | Evidence path | Notes |
|---|---|---|---|---|---|---|
| C-5.1 | Preview ใช้ `findUnique` (read-only) เท่านั้น — ไม่เรียก create/update/upsert | ☐ | | | `docs/TASK-legacy-sync.md` §9 | |
| C-5.2 | Preview สร้าง `SyncRun` (mode=preview) + `SyncRunItem` (status=pending) | ☐ | | | §9 | |
| C-5.3 | Unit test: รัน preview 2 ครั้ง → จำนวน WO ใน DB ไม่เปลี่ยน | ☐ | | | | ต้องเขียน test |
| C-5.4 | Integration test: หลัง preview ไม่มี AuditLog row ใหม่ (ยกเว้น SYNC_PREVIEW ถ้าเลือก) | ☐ | | | | ต้องเขียน test |

### C-6 Transaction & version check (B4-aligned)

**Check:** Apply ใช้ serializable transaction + optimistic version check — reuse B4 pattern

| # | Check item | Status | Owner | Due date | Evidence path | Notes |
|---|---|---|---|---|---|---|
| C-6.1 | Apply แต่ละ item ทำใน `withSerializableRetryTracked` (reuse B4) | ☐ | | | `docs/TASK-legacy-sync.md` §7 | |
| C-6.2 | `expectedVersion` + `expectedExists` persist ใน `SyncRunItem` ตอน preview | ☐ | | | §3.2, §7 (P1 #5 fix) | |
| C-6.3 | Apply ตรวจ 3 conflict cases: deleted-after-preview / created-by-another / version-changed | ☐ | | | §7 step 2 | |
| C-6.4 | Conflict → mark `SyncRunItem.status=error` + `errorMessage=CONFLICT` — **ไม่ override** | ☐ | | | §7, §10.3 | |
| C-6.5 | แต่ละ item แยก transaction (ไม่ wrap batch ทั้งก้อน) | ☐ | | | §7 note | |
| C-6.6 | Audit log อยู่ใน transaction เดียวกับ apply (atomic) | ☐ | | | §7 step 3 | |

### C-7 P2034 / concurrency

**Check:** P2034 serialization conflict retry อัตโนมัติ ไม่ตอบ 500

| # | Check item | Status | Owner | Due date | Evidence path | Notes |
|---|---|---|---|---|---|---|
| C-7.1 | P2034 → retry ผ่าน `withSerializableRetryTracked` (exponential backoff) | ☐ | | | §7, reuse B4 | |
| C-7.2 | Non-P2034 error ไม่ retry (attempts=1) | ☐ | | | B4 test 8 pattern | |
| C-7.3 | Test: จำลอง P2034 → sync ไม่ตอบ 500 | ☐ | | | | ต้องเขียน test |
| C-7.4 | `SyncRun.attempts` / `p2034Count` บันทึกไว้ตรวจได้ | ☐ | | | | |

---

## หมวดที่ 4: Retry, Quarantine & Audit

### C-8 Retry & quarantine

**Check:** 3 ระดับ retry + quarantine item ที่ error

| # | Check item | Status | Owner | Due date | Evidence path | Notes |
|---|---|---|---|---|---|---|
| C-8.1 | Item-level retry: `POST /api/sync/runs/:id/retry` → SyncRun ใหม่ (retryOf=original) | ☐ | | | §5.5, §10.1 | |
| C-8.2 | Transaction-level retry: `withSerializableRetryTracked` | ☐ | | | §10.1 | |
| C-8.3 | Source-level retry: exponential backoff (3 ครั้ง, 1s/2s/4s) ใน adapter | ☐ | | | §10.1 | |
| C-8.4 | Item ที่ error ไม่ block batch — แยก quarantine + แสดงในผลลัพธ์ | ☐ | | | §10.2 | |
| C-8.5 | Error categories ครบ: SOURCE_UNREACHABLE / SOURCE_AUTH / VALIDATION / CONFLICT / DB / OUT_OF_SCOPE | ☐ | | | §10.3 | |

### C-9 Audit log

**Check:** ทุก SyncRun + SyncRunItem apply บันทึก AuditLog พร้อม siteCode

| # | Check item | Status | Owner | Due date | Evidence path | Notes |
|---|---|---|---|---|---|---|
| C-9.1 | `AuditLog.action = 'SYNC_APPLY'` สำหรับทุก item ที่ applied | ☐ | | | §8.4 | |
| C-9.2 | `AuditLog.siteCode` populate (ไม่ null สำหรับ Site-scoped) | ☐ | | | §8.4 | |
| C-9.3 | `AuditLog.summary` ภาษาไทย + ระบุ externalKey | ☐ | | | §7 step 3 | |
| C-9.4 | `AuditLog.detail` เก็บ before/after (JSON) + syncRunId | ☐ | | | §7 step 3 | |
| C-9.5 | `AuditLog.actor` = user ที่กด sync (ไม่ใช่ 'system') | ☐ | | | §8.4 | |

---

## หมวดที่ 5: Site Authorization & API Contract

### C-10 Site authorization

**Check:** sync เคารพ Site scope ของผู้ใช้

| # | Check item | Status | Owner | Due date | Evidence path | Notes |
|---|---|---|---|---|---|---|
| C-10.1 | Permission ใหม่ `SYNC_RUN` เพิ่มใน `src/lib/auth-shared.ts` + seed catalog | ☐ | | | §8.3 | |
| C-10.2 | `requireAuth(req, 'SYNC_RUN')` ในทุก `/api/sync/*` route | ☐ | | | §8.1 | |
| C-10.3 | `buildAuthorizationContext` + `canAtSite(siteFilter, 'SYNC_RUN')` ตรวจก่อน sync | ☐ | | | §8.1, §8.2 | |
| C-10.4 | Non-superadmin sync เฉพาะ Site ใน `ctx.siteScope.siteCodes` | ☐ | | | §8.2 | |
| C-10.5 | Item ที่มี Site นอก scope → `OUT_OF_SCOPE` error (ไม่ sync ข้าม Site) | ☐ | | | §8.2, §10.3 | |
| C-10.6 | superadmin sync ได้ทุก Site (แต่ `siteScope` บันทึกว่า multi-site) | ☐ | | | §8.4 | |

### C-11 API contract

**Check:** 5 endpoints ตรงตาม spec

| # | Check item | Status | Owner | Due date | Evidence path | Notes |
|---|---|---|---|---|---|---|
| C-11.1 | `POST /api/sync/preview` — request/response shape ตรง §5.1 | ☐ | | | §5.1 | |
| C-11.2 | `POST /api/sync/run` — รับ `previewRunId` + `itemIds` ตาม §5.2 | ☐ | | | §5.2 | |
| C-11.3 | `GET /api/sync/runs` — list + filter (source/status) ตาม §5.3 | ☐ | | | §5.3 | |
| C-11.4 | `GET /api/sync/runs/:id` — detail + items (paginate) ตาม §5.4 | ☐ | | | §5.4 | |
| C-11.5 | `POST /api/sync/runs/:id/retry` — retry เฉพาะ error items ตาม §5.5 | ☐ | | | §5.5 | |
| C-11.6 | ทุก route return 401 (unauth) / 403 (no permission) / 404 (not found) ที่ถูกต้อง | ☐ | | | | |

---

## หมวดที่ 6: Prisma Migration & Credential Security

### C-12 Prisma migration

**Check:** migration สำหรับ SyncRun + SyncRunItem ถูกต้อง + รองรับ PostgreSQL

| # | Check item | Status | Owner | Due date | Evidence path | Notes |
|---|---|---|---|---|---|---|
| C-12.1 | migration SQL สร้างใน `prisma/migrations/{timestamp}_add_sync_run_tables/` | ☐ | | | | ยังไม่มี — สร้างตอน implementation |
| C-12.2 | migration additive (CREATE TABLE, ไม่ DROP) — no data loss | ☐ | | | | |
| C-12.3 | migration รันได้บน PostgreSQL จริง (ไม่ใช่ SQLite-only syntax) | ☐ | | | | ต้องทดสอบใน CI/staging |
| C-12.4 | `@@index` ครบตาม spec (source/target/status, triggeredBy, siteScope, externalKey) | ☐ | | | §3.1, §3.2 | |
| C-12.5 | `expectedVersion Int?` + `expectedExists Boolean` อยู่ใน migration (P1 #5 fix) | ☐ | | | §3.2 | |
| C-12.6 | `prisma generate` ผ่านหลังเพิ่ม model | ☐ | | | | |

### C-13 Credential security

**Check:** credential ไม่ปรากฏใน browser

| # | Check item | Status | Owner | Due date | Evidence path | Notes |
|---|---|---|---|---|---|---|
| C-13.1 | ทุก credential อยู่ใน env var (`APPS_SCRIPT_*`, `GOOGLE_SERVICE_ACCOUNT_*`) | ☐ | | | §12 | |
| C-13.2 | Browser request ไม่มี credential ใน body/headers/query | ☐ | | | §2.2 | |
| C-13.3 | API response ไม่ leak credential (ไม่ echo token/URL) | ☐ | | | | |
| C-13.4 | dev.log ไม่ log credential (redact หรือไม่ log เลย) | ☐ | | | | |
| C-13.5 | `.env` ไม่ commit (อยู่ใน `.gitignore`) | ☐ | | | | ตรวจ `.gitignore` |
| C-13.6 | Test: ตรวจ DevTools Network tab ไม่เห็น credential | ☐ | | | | ต้องเขียน test/verify |

---

## หมวดที่ 7: Test Evidence & PR Boundary

### C-14 Test evidence

**Check:** tests ครบตาม acceptance criteria §14

| # | Check item | Status | Owner | Due date | Evidence path | Notes |
|---|---|---|---|---|---|---|
| C-14.1 | Unit test: preview no-write (preview 2 ครั้ง → DB ไม่เปลี่ยน) | ☐ | | | §14.1 #1 | |
| C-14.2 | Integration test: apply → WorkOrder ปรากฏในระบบ | ☐ | | | §14.1 #2 | |
| C-14.3 | Idempotency test: apply 2 ครั้ง → ไม่ duplicate | ☐ | | | §14.1 #3 | |
| C-14.4 | Skip test: unchanged item → skipRows > 0 | ☐ | | | §14.1 #4 | |
| C-14.5 | Site scope test: demo_staff → OUT_OF_SCOPE สำหรับ Site อื่น | ☐ | | | §14.1 #5 | |
| C-14.6 | Audit test: ทุก apply → AuditLog row พร้อม siteCode | ☐ | | | §14.1 #6 | |
| C-14.7 | Conflict test: แก้ WO หลัง preview → apply ได้ CONFLICT | ☐ | | | §14.1 #7 | |
| C-14.8 | P2034 test: จำลอง conflict → ไม่ 500 | ☐ | | | §14.1 #8 | |
| C-14.9 | UI flow test (agent-browser): preview → diff → confirm → result | ☐ | | | §14.1 #9 | |
| C-14.10 | Credential leak test: DevTools ไม่เห็น credential | ☐ | | | §14.1 #11 | |
| C-14.11 | Retry test: retry error items ไม่กระทบ success items | ☐ | | | §14.1 #13 | |

### C-15 PR boundary (B4 frozen)

**Check:** ไม่แก้ B4 production files + แยก PR ตาม phase

| # | Check item | Status | Owner | Due date | Evidence path | Notes |
|---|---|---|---|---|---|---|
| C-15.1 | `src/lib/txn.ts` ไม่ถูกแก้ (0 diff จาก ee75164) | ☐ | | | | verify: `git diff ee75164..HEAD -- src/lib/txn.ts` |
| C-15.2 | `src/lib/wo-authz.ts` ไม่ถูกแก้ | ☐ | | | | |
| C-15.3 | `src/lib/authorization-context.ts` ไม่ถูกแก้ | ☐ | | | | |
| C-15.4 | `src/lib/auth-middleware.ts` ไม่ถูกแก้ | ☐ | | | | |
| C-15.5 | `src/lib/auth-shared.ts` ไม่ถูกแก้ (ยกเว้นเพิ่ม SYNC_RUN permission — แบบนั้นต้อง review) | ☐ | | | | ระวัง: ถ้าเพิ่ม permission ต้อง audit |
| C-15.6 | `src/lib/audit.ts` ไม่ถูกแก้ | ☐ | | | | |
| C-15.7 | `tests/auth/concurrency.test.ts` ไม่ถูกแก้โดย PR-SYNC-1 | ☐ | | | | |
| C-15.8 | PR-SYNC-1 แยกจาก release candidate PR #6 และ UX/UI PR | ☐ | | | | |

### NC-16 Non-critical / UX (can be TBD at implementation start)

| # | Check item | Status | Owner | Due date | Evidence path | Notes |
|---|---|---|---|---|---|---|
| NC-16.1 | UI: ปุ่ม "ดูตัวอย่าง" / "ยืนยัน" visible ใน viewport แรก (mobile + desktop) | ☐ | | | §11, §14.1 #10 | |
| NC-16.2 | UI: states ครบ (idle/loading/done/error/empty) | ☐ | | | §11.3 | |
| NC-16.3 | UI: ประวัติ SyncRun filter ตาม source/status | ☐ | | | §14.1 #12 | |
| NC-16.4 | `SYNC_PREVIEW_MAX_ROWS=1000` cap + paginate | ☐ | | | §12, §15 | |
| NC-16.5 | CSV upload ยังคงเป็น fallback (ไม่ลบ) | ☐ | | | §1, §13 | |

---

## หมวดที่ 8: Final Approval Gate

### C-17 Final approval

**Check:** ก่อน merge PR-SYNC-1 ต้องผ่านทั้งหมดนี้

| # | Check item | Status | Owner | Due date | Evidence path | Notes |
|---|---|---|---|---|---|---|
| C-17.1 | Critical ทั้ง 17 ข้อ PASS (ไม่มี FAIL/BLOCKED) | ☐ | | | | |
| C-17.2 | `bunx eslint` ผ่าน 0 errors ทุกไฟล์ใหม่ | ☐ | | | | |
| C-17.3 | `npx tsc --noEmit` ไม่มี error ใหม่ในไฟล์ที่แก้ | ☐ | | | | |
| C-17.4 | `git diff --check` สะอาด (ไม่มี whitespace/conflict) | ☐ | | | | |
| C-17.5 | B4 regression tests ผ่าน (auth/integration/concurrency) บน PostgreSQL | ☐ | | | | ต้องรันใน CI/staging |
| C-17.6 | PostgreSQL migration รันสำเร็จใน staging | ☐ | | | | |
| C-17.7 | 3-point integration check ผ่าน (Device POST, print 401, login no prisma:error) | ☐ | | | | จาก release candidate verification |
| C-17.8 | Audit team อนุมัติเป็นลายลักษณ์อักษร | ☐ | | | | |

---

## ข้อความพร้อมส่งทีมพัฒนา

> **หัวข้อ: PR-SYNC-1 Audit List — กรอกก่อนเริ่ม Implementation**
>
> ทีมพัฒนาครับ
>
> ก่อนเริ่ม implementation ของ PR-SYNC-1 (Legacy Apps Script → ITAM-NextJS Manual Sync, MVP: Services → Work Orders) ทีม Audit ขอให้ทีมพัฒนากรอกแบบฟอร์ม audit list นี้เพื่อตรวจสอบ mapping, Site scope, external key, idempotency และ edge cases ก่อนมีการแก้ schema หรือสร้าง API จริง
>
> **เอกสารอ้างอิง:**
> - Spec: `docs/TASK-legacy-sync.md` (commit `7f99503` ขึ้นไป — มี expectedVersion/expectedExists แล้ว)
> - Audit list: `docs/PR-SYNC-1-AUDIT-LIST.md` (ไฟล์นี้)
> - B4 baseline: `ee75164` (frozen — ห้ามแก้)
>
> **กฎเหล็ก:**
> 1. **ห้ามเริ่ม migration / API / UI หากยังมีรายการ Critical (C-*) ที่ Status = `FAIL` หรือ `BLOCKED`**
> 2. รายการ Non-critical (NC-*) สามารถเป็น `TBD` ได้ขณะเริ่ม implementation แต่ต้องปิดก่อน merge PR
> 3. ทุกข้อมต้องระบุ `Owner` + `Due date` + `Evidence path` (path ของไฟล์/commit/PR ที่เป็นหลักฐาน)
> 4. ส่ง audit list กลับมาให้ทีม Audit ตรวจก่อนเริ่ม implementation
>
> **สิ่งที่ต้องตรวจเป็นพิเศษ (จาก bot review P1 fixes):**
> - `expectedVersion` + `expectedExists` ใน SyncRunItem (ป้องกัน Preview → Apply race)
> - migration สำหรับ SyncRun + SyncRunItem ต้องรองรับ PostgreSQL จริง (ไม่ใช่ SQLite-only)
> - credential อยู่ฝั่ง server เท่านั้น (env var, ไม่ leak ใน browser)
>
> **หลังกรอกเสร็จ:**
> 1. Commit audit list ใน branch ใหม่ (เช่น `pr-sync-1/audit-list`)
> 2. ส่ง PR URL ให้ทีม Audit ตรวจ
> 3. รออนุมัติก่อนเริ่ม implementation
>
> ขอให้เริ่มจากการกรอก audit list ก่อน — อย่าเริ่ม migration/API/UI จนกว่าทีม Audit จะอนุมัติ

---

## Change log

| วันที่ | ผู้แก้ | การเปลี่ยนแปลง |
|---|---|---|
| 2026-08-16 | orchestrator | สร้าง audit list v1 (17 Critical + 5 Non-critical) อ้างอิง spec commit `7f99503` |

---

*เอกสารนี้เป็นส่วนหนึ่งของ PR-SYNC-1 workstream — แยกจาก B4 baseline และ release candidate PR #6*
