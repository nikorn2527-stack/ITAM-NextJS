# ITAM-04 — Meter/Lifecycle Source-Only Handoff

**วันที่:** 22 สิงหาคม 2026  
**ผู้จัดทำ:** ITAM-04 — Dev-4 / Meter  
**Feature branch:** `feature/meter-lifecycle-parity-fix`  
**Worktree:** `/home/ubuntu/itam-team-worktrees/meter-lifecycle-fix`  
**ฐานของงาน:** `origin/feature/itam01-parity-integration-2026-08-22` ณ commit `4a0ea2e`  
**สถานะ:** Source review candidate — ยังไม่ใช่ merge, release หรือ deployment approval

## วัตถุประสงค์

งานชุดนี้ปรับเส้นทาง runtime ของ Meter และ Device Lifecycle ให้ใกล้เคียงกฎใน Apps Script เดิมมากขึ้น โดยให้ active Device UI ใช้ canonical lifecycle/transfer flow เดียวกัน แยกการเปลี่ยนสถานะเชิง lifecycle ออกจาก generic Device PUT และรักษา legacy payload/response aliases ที่จำเป็นต่อความเข้ากันได้ของระบบเดิม

> เอกสารนี้อนุมัติเฉพาะการแก้ source logic ตามขอบเขตที่ผู้ใช้ยืนยันแล้วเท่านั้น ไม่ได้อนุมัติการเขียนข้อมูลจริง การเปลี่ยน schema การ release หรือการ deploy

## สิ่งที่แก้ใน source

| ส่วน | การเปลี่ยนแปลง | ผลที่ต้องตรวจต่อ |
|---|---|---|
| Active transfer facade | `/api/devices/[id]/transfer` delegate ไปยัง canonical transfer logic พร้อมคง `toDept`, `toDeptCode`, `reason`, `transferDate` และ response alias `transfer` | ตรวจ authorization/site scope และ replay payload เก่าบน staging |
| Canonical transfer | เพิ่ม auth/site checks, meter acknowledgement, paired ownership check (`deviceId` + `assetCode`), location snapshot, server-derived `readingType`, AssetSiteCode และ transaction สำหรับ device/history/meter linkage | ตรวจ DB-backed transaction และ duplicate/retry behavior |
| Canonical lifecycle | เพิ่ม `/api/itam/devices/[id]/lifecycle` สำหรับ `send_repair`, `receive_repair`, `uninstall`, `dispose`, `reinstall`, `return_device`, `mark_ready` และ `other_status` | ตรวจ action/status policy และข้อมูลประวัติจริงก่อน release |
| Active lifecycle facade | เพิ่ม `/api/devices/[id]/lifecycle` เป็น legacy-compatible facade ไปยัง canonical handler | ตรวจ response aliases และ caller อื่นที่อาจยังใช้ generic PUT |
| Device detail UI | จับ `meterReadingId` จาก `/api/meter`, ส่ง `meterColor`, location, action, status, reason, วันที่ และ skip acknowledgement ไปยัง lifecycle endpoint; ตัด generic PUT ออกจาก lifecycle action path | ตรวจ UX และ error recovery กรณี meter สำเร็จแต่ lifecycle ไม่สำเร็จ |
| Lifecycle mapping | เปลี่ยน helper ที่ซ้ำ/ขัดแย้งให้เป็น compatibility facade ไปยัง canonical `meter-logic.ts` โดยคง signature เดิม `(fromStatus, toStatus)` | ตรวจ caller ภายนอกที่พึ่งพา signature เดิม |

การแก้ไขทั้งหมดคงคู่ identity ของอุปกรณ์ ได้แก่ **Asset No. (`assetCode`) และ Serial Number (`serialNumber`)** ไม่ได้แก้ไขข้อมูล master, schema หรือ historical records

## กฎสำคัญที่ถูกทำให้เป็น source contract

Canonical mapping ยังคง semantics จาก Apps Script เดิม: `DISPOSED`/`RETIRED`/`RETURNED` ไป `FINAL`, `IN REPAIR` ไป `SEND_REPAIR`, `INACTIVE`/`IN STOCK` ไป `CHECKOUT`, การกลับจากสถานะ inactive/repair/stock-like ไป `ACTIVE` ไป `RETURN` และ `ACTIVE → ACTIVE` เป็น `MONTHLY` โดย server เป็นผู้ derive ค่า ไม่รับ `readingType` จาก client เป็น authority

สำหรับอุปกรณ์ที่ `meterRequired` ระบบต้องได้รับ `meterReadingId` หรือ boolean acknowledgement ที่ยืนยันว่า “มิเตอร์นับต่อเนื่อง” เหตุผลอย่างเดียว (`skipMeterReason`) ไม่ถือว่าเป็นการยืนยันที่เพียงพอ การตรวจ meter ownership ใช้ทั้ง `deviceId` และ `assetCode` เพื่อป้องกันการนำรายการของอุปกรณ์อื่นมา link

## ข้อจำกัดด้าน atomicity ที่ต้องเปิดเผย

เส้นทาง UI ในรอบนี้ยังบันทึก MeterReading ผ่าน `/api/meter` ก่อนเรียก lifecycle/transfer endpoint ดังนั้น transaction ของ canonical endpoint ทำให้ **device update + DeviceTransfer history + meter event/linkage ที่มีอยู่แล้ว** commit หรือ rollback ร่วมกัน แต่ยังไม่ใช่ transaction เดียวกับการสร้าง MeterReading ครั้งแรกจาก UI

เพื่อไม่ให้ failure เงียบ ระบบเพิ่ม recovery marker `LIFECYCLE_METER_INCOMPLETE` เมื่อมี `meterReadingId` ที่สร้างไว้แล้วแต่ lifecycle/transfer ต่อไม่สำเร็จ ทีม deploy/review ต้องตรวจรายการ marker นี้และกำหนด recovery/replay procedure ก่อน production approval งานรอบถัดไปควรพิจารณา endpoint เดียวที่รับ meter values และเขียน meter + device + history ใน transaction เดียว หากต้องการ atomicity เต็มรูปแบบ

## ผลการตรวจ source-only

| Check | Result | Evidence / หมายเหตุ |
|---|---|---|
| Dedicated worktree/branch | PASS | แก้เฉพาะ `feature/meter-lifecycle-parity-fix`; worktree หลักที่ dirty ไม่ถูกแตะ |
| `git diff --check` | PASS | ไม่พบ whitespace error |
| Focused Vitest | PASS | 3 test files, **79 tests ผ่าน**: active boundary 6, transfer scenarios 36, meter contract 37 |
| ESLint source/test ที่ไม่รวม UI baseline | PASS | route, helper และ regression test ที่แก้ผ่าน ESLint |
| ESLint ไฟล์ UI ที่แก้ | BLOCKED / PRE-EXISTING | พบ rule `react-hooks/set-state-in-effect` ที่ `device-detail-sheet.tsx:199` (`setMounted(true)`); จุดนี้เป็น code เดิม ไม่ใช่บรรทัดที่เพิ่มในรอบนี้ |
| `npx tsc --noEmit` ทั้ง repository | BLOCKED / PRE-EXISTING | คำสั่ง exit 2 จาก errors เดิมหลายกลุ่มใน repository; ไม่พบ error ในไฟล์ source/test ที่แก้จาก filtered output |
| DB write / migration / DDL | NOT RUN | ไม่มี `prisma db:push`, migration, seed, DDL หรือ write query ในขั้นตอนตรวจนี้ |
| Merge / deploy | NOT RUN | ห้ามดำเนินการในงานชุดนี้ |

## สิ่งที่ ITAM-01 ต้อง review ต่อ

1. ตรวจ source diff และยืนยันว่า active UI ทุก lifecycle action ผ่าน `/api/devices/[id]/lifecycle` หรือ `/api/devices/[id]/transfer` โดยไม่มี bypass ผ่าน generic Device PUT หรือ dialog เก่า
2. รัน database-backed tests และ controlled staging replay ด้วยข้อมูลทดสอบที่แยกจากข้อมูลจริง โดยตรวจ auth/site scope, meter-required enforcement, paired identity, history snapshot, AssetSiteCode, reset/baseline และ retry/idempotency
3. ตรวจ recovery marker `LIFECYCLE_METER_INCOMPLETE` และกำหนดวิธี replay/แก้ไขอย่างมี audit trail หากมีรายการเกิดขึ้น
4. ทบทวน full TypeScript/lint debt ที่มีอยู่เดิม และตรวจ UI lint baseline แยกจาก source logic ของงานนี้
5. ตรวจ exact head ของ branch หลัง commit และทำ peer review ก่อนตัดสินใจ release gate

## Deployment ownership และ approval gate

**ITAM-01 — Dev-1 / Repair เป็นผู้รับผิดชอบ review/ประสาน deployment** ของ source change ชุดนี้ เนื่องจากสิทธิ์ Vercel อาจจำกัดและผู้จัดทำงานนี้ไม่มีสิทธิ์รับรอง deployment แทน ITAM-01

ห้าม merge หรือ deploy จนกว่า ITAM-01 จะตรวจ exact head, ยืนยันผล staging, อนุมัติ rollback plan และได้รับ release approval ตาม governance ของโครงการ การที่เอกสารนี้ถูก commit หรือมี PR ไม่ถือเป็น deployment approval และไม่มีการเปลี่ยนแปลง ITAM-DB จากงานชุดนี้

## References

[1]: `../../src/lib/meter-logic.ts` — Canonical Meter/Lifecycle business rules ใน repository  
[2]: `../../src/app/api/itam/devices/[id]/transfer/route.ts` — Canonical transfer handler และ transaction boundary  
[3]: `../../src/app/api/itam/devices/[id]/lifecycle/route.ts` — Canonical lifecycle handler  
[4]: `../../tests/meter-lifecycle-active-boundary.test.ts` — Source-boundary regression tests  
[5]: `/tmp/itam-db-access/itam-meter-lifecycle-comparison-report.md` — รายงานเปรียบเทียบ Apps Script กับ Next runtime ที่จัดทำก่อน source edit
