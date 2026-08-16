# PR-SYNC-1 Evidence Round 1 Checklist

> เอกสารนี้ใช้สำหรับการรับช่วงงานของทีมพัฒนาใหม่ในระยะ **staging/canary เท่านั้น** ไม่ใช่ production approval และไม่อนุญาตให้บันทึก secret, token, password, cookie หรือ raw PII ลงใน evidence

## 1. ข้อมูลรอบการตรวจ

| Field | Value |
|---|---|
| Evidence round | Round 1 — Staging/Canary Readiness |
| Target branch | `main` |
| Target full SHA | `453f0d606c391d686cab13edd5a29e7cfb746384` |
| Commit message | `ops: add staging monitoring SQL scripts for PR-SYNC-1` |
| Merge commit | `dfb5e3fc3b496f14036c221a3c662f4a2dc49569` |
| B4 frozen baseline | `ee75164` |
| Staging deployment URL |  |
| Vercel deployment ID/URL |  |
| Staging database identifier (redacted) |  |
| Canary site(s) |  |
| Canary user group |  |
| Operator — ทีมพัฒนาใหม่ |  |
| Evidence reviewer — ทีม Audit |  |
| Start time UTC |  |
| End time UTC |  |
| Evidence folder/issue |  |

## 2. กติกาการเก็บ evidence

Evidence ทุกชิ้นต้องระบุ **full commit SHA, UTC timestamp, environment และผู้ปฏิบัติ** ให้ตรงกับ deployment ที่ตรวจ ห้ามใช้คำว่า "ผ่านแล้ว" โดยไม่มี log, query output, screenshot ที่ลบข้อมูลอ่อนไหวแล้ว หรือ reference ไปยังระบบที่ตรวจสอบได้

ทีมพัฒนาต้องเก็บ raw operational output ไว้ในพื้นที่ที่ได้รับอนุญาต และแนบเฉพาะ sanitized copy ให้ทีม Audit ห้ามเผยแพร่ `DATABASE_URL`, `JWT_SECRET`, `CRON_SECRET`, Apps Script token, authorization header, session cookie หรือข้อมูลส่วนบุคคลดิบ

หาก gate ใดมีผลเป็น `FAIL`, `BLOCKED` หรือ `INCOMPLETE` ให้หยุดการขยาย canary และบันทึก incident/exception ก่อนดำเนินการต่อ ทีม Audit เป็นผู้เปลี่ยนสถานะ gate เป็น `ACCEPTED` ได้หลังตรวจหลักฐานครบเท่านั้น

## 3. Gate summary

| Gate | หัวข้อ | ผู้ปฏิบัติ | ผู้ตรวจ | สถานะ |
|---|---|---|---|---|
| G0 | Release identity และ policy guard | ทีมพัฒนาใหม่ | ทีม Audit | `PENDING` |
| G1 | Staging PostgreSQL แยกจาก production | ทีมพัฒนาใหม่ | ทีม Audit | `PENDING` |
| G2 | Staging secrets และ environment scope | ทีมพัฒนาใหม่ | ทีม Audit | `PENDING` |
| G3 | Canary deployment | ทีมพัฒนาใหม่ | ทีม Audit | `PENDING` |
| G4 | Database migration | ทีมพัฒนาใหม่ | ทีม Audit | `PENDING` |
| G5 | Smoke และ negative tests | ทีมพัฒนาใหม่ | ทีม Audit | `PENDING` |
| G6 | Monitoring Day 1 และ CSV fallback | ทีมพัฒนาใหม่ | ทีม Audit | `PENDING` |
| G7 | Round 1 handoff decision | Release Owner + Audit | — | `PENDING` |

สถานะที่ใช้ได้มีเพียง `PENDING`, `IN_PROGRESS`, `PASS`, `FAIL`, `BLOCKED`, `INCOMPLETE` และ `ACCEPTED` โดย `PASS` เป็นผลการรันของทีมพัฒนา ส่วน `ACCEPTED` เป็นผลตรวจรับของทีม Audit

## 4. G0 — Release identity และ policy guard

### 4.1 Checklist

| Check | Expected result | Actual/evidence reference | Result |
|---|---|---|---|
| Full SHA | ตรงกับ `453f0d606c391d686cab13edd5a29e7cfb746384` |  | PASS / FAIL |
| Branch | `main` |  | PASS / FAIL |
| Commit message | ตรงกับ `ops: add staging monitoring SQL scripts for PR-SYNC-1` |  | PASS / FAIL |
| B4 frozen files | 6/6 files 0-diff จาก `ee75164` |  | PASS / FAIL |
| `SYNC_RUN` permission | ไม่พบ declaration ใน source/config |  | PASS / FAIL |
| Migration policy | มี `prisma migrate deploy`; ไม่มี `prisma db:push` |  | PASS / FAIL |
| CSV fallback | ยังมี route/UI/operational path ใช้งานได้ |  | PASS / FAIL |
| Pre-deploy guard | Script จบด้วย PASS และระบุ deployment SHA |  | PASS / FAIL |

### 4.2 Required evidence

บันทึกผลจาก `git rev-parse HEAD`, `git branch --show-current`, B4 frozen diff จาก `ee75164`, permission scan, workflow/config scan และ output ของ pre-deploy guard โดยต้องตรวจซ้ำบน checkout หรือ deployment artifact เดียวกับที่จะใช้ staging

## 5. G1 — Staging PostgreSQL แยกจาก production

| Check | Expected result | Actual/evidence reference | Result |
|---|---|---|---|
| Database host/name | เป็น staging identifier และไม่ใช่ production |  | PASS / FAIL |
| Database credentials | เป็น staging-only credential |  | PASS / FAIL |
| Network/access scope | จำกัดเฉพาะ deployment และ operator ที่จำเป็น |  | PASS / FAIL |
| Schema state | ตรวจได้ก่อน migration และไม่มีข้อมูล production ปะปน |  | PASS / FAIL |
| Backup/restore point | มี rollback/restore procedure สำหรับ staging |  | PASS / FAIL |
| Connection test | เชื่อมต่อได้จาก deployment runtime |  | PASS / FAIL |
| Production isolation | ทดสอบแล้วว่า staging ไม่มี write path ไป production |  | PASS / FAIL |

**ห้ามแนบ connection string เต็มรูปแบบ** ให้บันทึกเพียง hostname/database identifier ที่ redacted, เวลา test, operator และผล connection test

## 6. G2 — Staging secrets และ environment scope

| Check | Expected result | Actual/evidence reference | Result |
|---|---|---|---|
| Vercel environment | ตัวแปรอยู่ใน Preview/Custom Environment ที่กำหนด ไม่ใช่ Production |  | PASS / FAIL |
| `DATABASE_URL` | ชี้ staging DB เท่านั้น |  | PASS / FAIL |
| `JWT_SECRET` | เป็นค่าใหม่ แยกจาก production และไม่ถูกบันทึกใน evidence |  | PASS / FAIL |
| Apps Script credential | ใช้ endpoint/token ของ staging/test และ server-side only |  | PASS / FAIL |
| Browser exposure | ไม่พบ secret ใน HTML, client bundle, browser network payload หรือ error response |  | PASS / FAIL |
| Empty non-MVP sources | source ที่ยังไม่อยู่ใน MVP ไม่ถูกเปิดใช้งานโดยไม่จำเป็น |  | PASS / FAIL |
| Environment change record | มีเวลา, operator และ deployment ที่เกิดหลังแก้ค่า environment |  | PASS / FAIL |

Vercel environment variables ที่แก้ไขภายหลังต้องทำ deployment ใหม่ก่อนตรวจ เพราะค่าใหม่ไม่ย้อนกลับไปเปลี่ยน deployment ที่มีอยู่แล้ว [2]

## 7. G3 — Canary deployment

| Check | Expected result | Actual/evidence reference | Result |
|---|---|---|---|
| Deployment target | เป็น staging/Preview/Custom Environment ไม่ใช่ production domain |  | PASS / FAIL |
| Deployment SHA | ตรงกับ target SHA ใน G0 |  | PASS / FAIL |
| Build | Build สำเร็จและมี log ที่ตรวจสอบได้ |  | PASS / FAIL |
| Runtime | Application boot ได้และไม่มี startup error ที่กระทบ sync/authz |  | PASS / FAIL |
| Canary scope | จำกัด site/user ตาม allowlist ที่ระบุใน Section 1 |  | PASS / FAIL |
| Rollback target | ระบุ deployment ก่อนหน้าและวิธี rollback ได้ |  | PASS / FAIL |
| Production isolation | ไม่มีการผูก production domain หรือ production DB |  | PASS / FAIL |

## 8. G4 — Database migration

| Check | Expected result | Actual/evidence reference | Result |
|---|---|---|---|
| Command | ใช้ `prisma migrate deploy` เท่านั้น |  | PASS / FAIL |
| Migration result | จบสำเร็จบน staging DB |  | PASS / FAIL |
| Schema verification | `SyncRun`, `SyncRunItem`, `AuditLog` และ fields ที่เกี่ยวข้องตรงกับ schema |  | PASS / FAIL |
| No destructive change | ไม่มี migration ที่ลบ/แก้ข้อมูลเกิน scope โดยไม่มี review |  | PASS / FAIL |
| No `db:push` | ไม่พบการใช้ `prisma db:push` ใน deployment log/script |  | PASS / FAIL |
| Post-migration health | Health/authz check ทำงานหลัง migration |  | PASS / FAIL |

## 9. G5 — Smoke และ negative tests

| Test | Expected result | Actual/evidence reference | Result |
|---|---|---|---|
| Application login | Operator ที่ได้รับอนุญาต login staging ได้ |  | PASS / FAIL |
| `GET /api/health/authz` | ผู้มีสิทธิ์เหมาะสมได้ HTTP 200 และ `status: pass` |  | PASS / FAIL |
| Unauthorized health check | ผู้ไม่มีสิทธิ์ไม่ได้ข้อมูล authz และได้ 401/403 ตาม contract |  | PASS / FAIL |
| Preview | Preview สร้าง run/item evidence แต่ไม่ mutate business records |  | PASS / FAIL |
| Preview no-write count | Count ก่อน/หลัง preview เท่ากันในตารางธุรกิจที่เกี่ยวข้อง |  | PASS / FAIL |
| Canary apply | Apply เฉพาะ item/site ใน canary scope |  | PASS / FAIL |
| Cross-site negative test | Request ข้าม site ได้ 403 และไม่มี mutation |  | PASS / FAIL |
| Version conflict fixture | Conflict ถูกบันทึกอย่าง explicit และไม่ silent overwrite |  | PASS / FAIL |
| Quarantine fixture | unknown/missing/out-of-scope mapping ถูก quarantine |  | PASS / FAIL |
| Retry fixture | retry chain, `attempts` และ error classification ตรวจสอบย้อนกลับได้ |  | PASS / FAIL |
| P2034 fixture | `p2034Count` ถูกบันทึกและไม่มี retry storm |  | PASS / FAIL |
| Audit linkage | applied item มี `SYNC_APPLY` audit record ครบ |  | PASS / FAIL |

ห้ามใช้ข้อมูล production จริงเป็น fixture ใน staging หากไม่ได้รับอนุมัติด้าน privacy/security ให้ใช้ synthetic หรือ sanitized data ที่ตรวจย้อนกลับได้แทน

## 10. G6 — Monitoring Day 1 และ CSV fallback

| Check | Expected result | Actual/evidence reference | Result |
|---|---|---|---|
| Monitoring SQL script | รัน `scripts/staging-monitoring-queries.sql` จาก target SHA |  | PASS / FAIL |
| Run success | มี summary ของ run และ status ที่ตรวจได้ |  | PASS / FAIL |
| Conflict | Count/rate ถูกบันทึก พร้อม incident disposition |  | PASS / FAIL |
| Quarantine | Count และ reason ถูกบันทึก ไม่มี unknown ที่ไม่มี owner |  | PASS / FAIL |
| Retry/P2034 | `attempts` และ `p2034Count` ถูกสรุป |  | PASS / FAIL |
| Authorization denial | 401/403 events ถูกแยกจาก application failure และไม่มี cross-site bypass |  | PASS / FAIL |
| Audit completeness | applied item ต่อ `SYNC_APPLY` audit record = 100% |  | PASS / FAIL |
| CSV fallback | upload/import/validation/audit trail ผ่านจริง |  | PASS / FAIL |
| Daily record | มี timestamp UTC, operator, query version และ sanitized output |  | PASS / FAIL |
| Stability tracker | บันทึก Day 1 และกำหนด owner สำหรับ Day 2–14 |  | PASS / FAIL |

## 11. G7 — Round 1 handoff decision

### ทีมพัฒนาใหม่ต้องส่ง

1. Full SHA และ deployment URL/ID
2. Pre-deploy guard output
3. Staging DB separation evidence แบบ redacted
4. Vercel environment-scope confirmation แบบไม่เปิดเผย secret
5. Build, migration และ smoke-test logs
6. Negative-test results สำหรับ cross-site authorization
7. Monitoring Day 1 SQL output และ CSV fallback result
8. รายการ issue/exception ที่ยังเปิดอยู่ พร้อม owner และ mitigation

### ทีม Audit ตรวจ

| Audit check | Acceptance criterion | Status |
|---|---|---|
| Evidence binding | ทุก artifact ผูกกับ target SHA และ UTC timestamp | PENDING |
| B4 freeze | 6/6 files 0-diff จาก `ee75164` | PENDING |
| Permission model | ไม่พบ `SYNC_RUN` permission | PENDING |
| Data isolation | staging ไม่ชี้ production DB | PENDING |
| Authorization | cross-site negative test ผ่าน | PENDING |
| Migration | migrate deploy only; no db push | PENDING |
| Preview safety | no-write behavior ผ่าน | PENDING |
| Error handling | conflict/quarantine/retry/P2034 มีหลักฐาน | PENDING |
| Audit completeness | applied item ครบ audit linkage | PENDING |
| CSV continuity | fallback ยังใช้งานได้ | PENDING |
| Operational readiness | rollback และ monitoring owner ชัดเจน | PENDING |

### Decision

- [ ] `ACCEPTED — proceed to canary operation`
- [ ] `CONDITIONAL — proceed only with listed restrictions`
- [ ] `BLOCKED — stop deployment/apply and remediate`

**Audit decision note:**

<!-- ทีม Audit บันทึกเหตุผล, evidence references และข้อจำกัดที่ต้องติดตาม -->

**Release Owner acknowledgement:**

ชื่อ: ______________________________  วันที่ UTC: __________________  ลายเซ็น/การยืนยัน: ______________________________

## 12. Stability window handoff

Round 1 ไม่ใช่ production approval ทีมพัฒนาต้องใช้เอกสารนี้เป็นจุดเริ่มต้นของ 14-day stability tracker ต่อไป โดยทุกวันต้องสรุป conflict, quarantine, retry/P2034, authorization denial, audit completeness และ CSV fallback status หากเกิด critical data-safety หรือ authorization event ให้หยุด apply/ขยาย scope ทันทีและแจ้งทีม Audit

## References

[1]: https://github.com/nikorn2527-stack/ITAM-NextJS/blob/main/docs/PR-SYNC-1-FINAL-AUDIT-REVIEW.md "PR-SYNC-1 final audit review and operational conditions"
[2]: https://vercel.com/docs/environment-variables "Vercel Environment Variables"
[3]: https://github.com/nikorn2527-stack/ITAM-NextJS/blob/main/docs/PR-SYNC-1-STAGING-CANARY-RUNBOOK-TH.md "PR-SYNC-1 staging/canary runbook"
[4]: https://github.com/nikorn2527-stack/ITAM-NextJS/blob/main/docs/PR-SYNC-1-MONITORING-DASHBOARD-SPEC-TH.md "PR-SYNC-1 monitoring dashboard specification"
[5]: https://github.com/nikorn2527-stack/ITAM-NextJS/blob/main/scripts/staging-monitoring-queries.sql "PR-SYNC-1 staging monitoring SQL scripts"
