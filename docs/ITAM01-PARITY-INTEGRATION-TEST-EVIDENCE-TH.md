# ITAM-01 Parity Integration Test Evidence

**Owner:** ITAM-01 — Dev-1 / Repair  
**Branch:** `feature/itam01-parity-integration-2026-08-22`  
**Test execution code revision:** `e3d59a4`  
**Note:** commit เอกสารภายหลังเป็น docs-only และไม่เปลี่ยน source code ที่ใช้รันผลทดสอบ  
**Base:** `97a43745e5dfe9fc805318e2fb41544d4aa8647a`  
**Purpose:** ตรวจชุดงาน Parity + งานปรับปรุงที่รวมไว้ทั้งหมดแบบ integration candidate ก่อนส่ง peer review และ Audit

## สถานะการรวมงาน

รวม code candidates ของ Repair, Stock, Devices และ Meter ตาม manifest แล้ว โดยงานที่มี conflict ได้แก้แบบ manual merge และตรวจ marker ครบแล้ว ไม่มี conflict marker ค้างใน `src`, `tests` หรือ `prisma` ณ จุดตรวจล่าสุด

PR/code candidates ที่รวมใน branch นี้ประกอบด้วย #18, #27–#31, #35–#39, #41–#44 และ #45–#51 ตาม `ITAM01-PARITY-INTEGRATION-MANIFEST-TH.md` โดย PR #1, #6, #16 และ branch governance/release ที่อยู่นอก code parity batch ไม่ได้ถูกรวมทั้ง branch เพื่อป้องกันการย้อน baseline หรือกระทบ B4 frozen files

## ผลการตรวจ

| Check | Result | Evidence / หมายเหตุ |
|---|---|---|
| Working tree | PASS | clean หลัง commit integration; ไม่พบ conflict marker |
| Production build | PASS | `JWT_SECRET` ใช้เฉพาะค่า ephemeral ใน sandbox; `npm run build` exit 0 |
| Focused ESLint | PASS | ตรวจ source files ที่เปลี่ยน/เกี่ยวข้องกับ integration โดยตรง; exit 0 |
| Targeted contract tests | PASS | Vitest: 24 test files ผ่าน, 509 tests ผ่าน |
| Sync integration tests requiring PostgreSQL | BLOCKED | 11 tests ล้มจาก `DATABASE_URL` ใน sandbox ไม่ใช่ PostgreSQL URL; ยังไม่มีการสรุปว่า runtime DB ผ่าน |
| Full TypeScript check | BLOCKED / PRE-EXISTING DEBT | `npx tsc --noEmit` ยังมี errors หลายกลุ่มใน production source, scripts และ tests; build ผ่านไม่ได้แปลว่า typecheck ผ่าน |
| Full lint | NOT CLEARED | ต้องแยกแก้ lint debt เดิมทั้ง repository ตามเกณฑ์ release ที่ตกลงกัน |
| Real read/write replay | NOT RUN | ยังต้องรันกับ ITAM-DB ที่ได้รับอนุญาตและข้อมูลทดสอบที่ควบคุมได้ |

## ประเด็นที่พบจากการ merge

1. Meter route มี conflict ระหว่าง stale-reading guard กับ `readingId` idempotent replay จึงผสานให้คงทั้งสอง behavior โดยตรวจ retry identity ก่อน previous-reading lookup และคง stale-date rejection หลังหา reading เดิม
2. `findExistingMonthlyReading` ถูกปรับให้คืน `id`, `readingDate` และ `readingId` เพื่อให้ stale guard และการคง identity ของรายการเดิมใช้ข้อมูลเดียวกัน
3. Stock transaction route มี conflict ระหว่าง validation contract กับ retry/source work-order resolution และถูกผสานโดยคงทั้ง validation และ fail-closed resolution
4. Dependency install ใน sandbox ต้องใช้ `npm ci --legacy-peer-deps` เนื่องจาก `next-auth@4.24.15` ประกาศ optional peer ของ `nodemailer@^7.0.7` แต่ root project ระบุ `nodemailer@^9.0.5`; ไม่ได้แก้ package manifest ใน integration รอบนี้

## สิ่งที่ผลนี้ยืนยันได้

Branch นี้ **ประกอบและ build ได้** และ pure contract/regression tests ของ feature candidates ผ่าน 509 tests จึงพร้อมเข้าสู่ขั้นตรวจ runtime ต่อได้ในฐานะ integration candidate

ผลนี้ยัง **ไม่ใช่ G2/G3 หรือ Production approval** เพราะยังขาด PostgreSQL-backed tests, full typecheck/lint clearance, read/write workflow replay จริง, exact-head peer review และ Audit verdict

## Next action ที่ต้องทำ

1. ให้ ITAM-01 ใช้ branch นี้เป็น exact head สำหรับแก้ integration/type/schema blockers ที่กระทบ runtime จริง โดยไม่แตะ B4 frozen files
2. รัน database-backed tests กับ ITAM-DB ผ่าน environment ที่ได้รับอนุญาต โดย redacted evidence เท่านั้น
3. Replay write workflows ของ Repair, Stock, Devices และ Meter ตั้งแต่ create/import/transaction/transfer/reading จนถึง history/report
4. ตรวจ redaction, authorization/site scope, preview no-write, retry/idempotency และ CSV fallback
5. หลัง evidence ครบ ให้ peer-review team ออก exact-head verdict แล้วส่ง Audit ตรวจต่อ

## Governance constraints

- Integration branch เป็นพื้นที่ทดสอบ ไม่ใช่ release approval
- ห้าม push แก้ main หรือ REVIEW-FROZEN PR โดยตรง
- ห้ามใช้ `prisma db:push`
- ห้ามแก้ B4 frozen files 6 ไฟล์
- ห้ามเพิ่ม `SYNC_RUN` permission โดยไม่มี Audit review
- `legacy_job_no` ต้องคง immutable และใช้คู่กับ `system_job_no` ตาม data contract

## ITAM-DB read-only verification

ตรวจผ่าน Supabase project `ITAM-DB` (project ref redacted ในรายงานภายนอก) และพบว่า project อยู่สถานะ ACTIVE_HEALTHY, PostgreSQL 17.6.1, region `ap-southeast-1` และมีข้อมูลจริง ไม่ใช่ empty/demo database

จำนวนข้อมูลจาก read-only query ล่าสุด: `Device` 2,378, `MeterReading` 14,269, `DeviceTransfer` 122, `MasterItem` 310, `WorkOrder` 4,935, `StockItem` 60, `StockTransaction` 2,602, `User` 10, `AuditLog` 20 และ `Cycle` 2

ข้อสังเกต: `list_tables` metadata ก่อนหน้าแสดง `StockTransaction` 2,608 ขณะที่ direct read-only `COUNT(*)` แสดง 2,602 จึงต้องถือว่า count ของ StockTransaction ยังไม่ stable/มีการเปลี่ยนแปลงระหว่างการอ่าน และต้องตรวจซ้ำก่อนใช้เป็น release evidence

ผลนี้ยืนยันว่า ITAM-DB มีข้อมูลจริงและพร้อมเป็น target database การที่ database-backed tests ก่อนหน้านี้เป็น BLOCKED หมายถึง integration worktree ใน sandbox ยังไม่มี application PostgreSQL connection ที่ใช้รันทดสอบ Prisma ได้ ไม่ได้หมายความว่า ITAM-DB ว่างหรือใช้งานไม่ได้ การทดสอบต่อไปต้องใช้ environment ที่เชื่อม ITAM-DB โดยตรง และต้องเริ่มจาก read-only smoke ก่อน mutation

ข้อมูลที่ตรวจรอบนี้เป็น metadata/count เท่านั้น ไม่ได้อ่านค่า secret, password, token หรือข้อมูลส่วนบุคคลรายแถว และไม่ได้ทำ DDL/DML ใด ๆ

## ITAM-DB advisor findings (read-only)

Security advisor พบ `rls_enabled_no_policy` ระดับ INFO จำนวน 30 รายการ โดยหลายตารางธุรกิจ เช่น `Device`, `MeterReading`, `WorkOrder`, `StockItem`, `StockTransaction`, `User` และ `AuditLog` เปิด RLS แต่ไม่มี policy ในระดับ database ผลนี้ไม่ควรถูกสรุปว่าเป็น runtime failure ทันที เพราะแอปใช้ server-side authorization/Prisma เป็นหลัก แต่ต้องให้ Audit ยืนยันว่าไม่มี direct client access และ RLS posture สอดคล้องกับ boundary ของระบบก่อน release

Performance advisor พบ INFO จำนวน 23 รายการ แบ่งเป็น foreign key ที่ไม่มี covering index 3 รายการ และ unused index 20 รายการ ประเด็นที่เกี่ยวข้องโดยตรงกับ flow ปัจจุบันคือ foreign key `StockTransaction.deviceId` ไม่มี covering index ส่วน unused indexes ต้องตรวจ query workload จริงก่อนลบ ไม่ควรลบตาม advisor โดยอัตโนมัติ

Advisor findings เป็น database follow-up ของ ITAM-DB ไม่ใช่เหตุผลให้ทำ DDL ทันที และการแก้ต้องผ่าน migration + review ตาม governance ห้ามใช้ `prisma db:push`
