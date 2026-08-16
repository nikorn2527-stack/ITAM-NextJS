# Audit Handoff to New Development Team

## ข้อความพร้อมส่งให้ทีมพัฒนา

> **เรื่อง: PR-SYNC-1 — ขอให้ทีมพัฒนาชุดใหม่รับช่วงงาน Staging/Canary ตามขอบเขตที่กำหนด**
>
> ทีม Audit ขอแจ้งขอบเขตงานให้ตรงกันก่อนเริ่มปฏิบัติการครับ
>
> PR-SYNC-1 ผ่านการตรวจระดับ code และถูก merge แล้วด้วยสถานะ **APPROVED WITH CONDITIONS** แต่ยัง **ไม่ใช่ production approval** งานที่ทีมพัฒนาชุดใหม่รับช่วงต่อในรอบนี้คือการดำเนินการและทดสอบ **staging/canary เท่านั้น** ห้าม production deploy จนกว่าจะครบ stability window อย่างน้อย 14 วันและมี final production go/no-go จาก Release Owner ร่วมกับทีม Audit
>
> ## 1. Release target ที่ต้องใช้
>
> ให้ยืนยันและใช้งาน full SHA นี้เท่านั้น:
>
> ```text
> 453f0d606c391d686cab13edd5a29e7cfb746384
> Branch: main
> Message: ops: add staging monitoring SQL scripts for PR-SYNC-1
> ```
>
> ก่อนเริ่ม deploy ให้ตรวจซ้ำว่า checkout/deployment artifact ตรงกับ SHA ข้างต้น และแนบผลตรวจไว้ใน Evidence Round 1
>
> ## 2. บทบาทของทีมพัฒนาชุดใหม่
>
> ทีมพัฒนาชุดใหม่ทำหน้าที่เป็น **Staging Operator, Test Executor และ Evidence Custodian** มีหน้าที่ลงมือทำ ทดสอบ และเก็บหลักฐาน แต่ไม่มีอำนาจประกาศ production go/no-go ด้วยตนเอง
>
> งานที่ต้องรับผิดชอบมีดังนี้:
>
> 1. Provision staging PostgreSQL โดยแยกจาก production อย่างเด็ดขาด และยืนยันว่า `DATABASE_URL` ของ staging ไม่ชี้ไปยัง production
> 2. ตั้งค่า Vercel Preview/Custom Environment และ staging secrets ผ่าน Project Settings หรือ secret manager เท่านั้น ห้าม commit secret
> 3. Deploy canary จาก full SHA ที่กำหนด โดยจำกัด site และ user scope ตามที่ระบุใน runbook
> 4. รัน `prisma migrate deploy` บน staging database เท่านั้น ห้ามใช้ `prisma db:push`
> 5. รัน smoke tests และ negative tests ได้แก่ login, `/api/health/authz`, preview no-write, apply, cross-site authorization, conflict, quarantine, retry/P2034 และ audit-log linkage
> 6. รัน `scripts/staging-monitoring-queries.sql` ตามรอบที่กำหนด และบันทึกผล conflict, quarantine, retry/P2034, authorization denial และ audit-log completeness
> 7. ทดสอบและคง CSV upload เป็น fallback ตลอด stability window
> 8. บันทึก daily stability tracker อย่างน้อย 14 วัน พร้อม deployment SHA, UTC timestamp, operator และ evidence reference
> 9. แจ้งทีม Audit ทันทีเมื่อพบ failure, exception, unresolved incident หรือผลที่ไม่สอดคล้องกับ threshold
>
> ## 3. งานที่ทีมพัฒนาไม่มีสิทธิ์ทำในรอบนี้
>
> ห้ามแก้ B4 frozen files จาก baseline `ee75164`, ห้ามเพิ่ม `SYNC_RUN` permission, ห้ามปิดหรือลบ CSV fallback, ห้ามใช้ production database เป็น staging database, ห้ามเปิดเผย secret ใน issue/log/chat และห้ามขยาย canary scope โดยไม่มีผล review จากทีม Audit
>
> ห้ามแก้ production code เพียงเพื่อให้ staging test ผ่านโดยไม่มี change proposal และ Audit review ใหม่ หากพบ code defect ให้หยุดที่ evidence/incident record พร้อมระบุ reproduction, impact และ remediation proposal ก่อน
>
> ## 4. ลำดับการปฏิบัติที่ต้องรายงาน
>
> ให้รายงานตามลำดับต่อไปนี้ ไม่ต้องรอให้ทุกขั้นตอนเสร็จจึงจะส่งหลักฐาน:
>
> | Gate | งาน | ผลลัพธ์ที่ต้องส่ง |
> |---|---|---|
> | G0 | ยืนยัน SHA, branch, B4 0-diff, ไม่มี `SYNC_RUN`, migration policy | command output และ sanitized evidence |
> | G1 | Provision staging PostgreSQL แยก production | redacted host/database identifier, connection/isolation evidence |
> | G2 | ตั้งค่า staging secrets | environment scope confirmation โดยไม่เปิดเผยค่า secret |
> | G3 | Deploy canary | deployment URL/ID, build log, scope และ rollback target |
> | G4 | Run migration | `prisma migrate deploy` log และ schema verification |
> | G5 | Smoke/negative tests | test result, before/after count, cross-site 403 และ error fixtures |
> | G6 | Monitoring Day 1 + CSV fallback | SQL output, metric summary, CSV test result และ tracker row |
>
> เมื่อจบแต่ละ gate ให้ส่งสถานะ `PASS`, `FAIL`, `BLOCKED` หรือ `INCOMPLETE` พร้อม evidence link ห้ามใช้เพียงคำว่า "เรียบร้อย" โดยไม่มีหลักฐาน
>
> ## 5. เงื่อนไขที่ต้องหยุดงานทันที
>
> ให้หยุด apply และหยุดขยาย canary ทันทีหากพบ cross-site access, unauthorized write, staging ชี้ production, unknown/missing/out-of-scope site, silent overwrite, unresolved conflict, quarantine ที่ไม่มี root cause, retry/P2034 spike, audit-log gap, CSV fallback failure หรือ secret exposure
>
> ในกรณีดังกล่าวให้รักษาหลักฐานเดิมไว้ ห้ามลบหรือแก้ log ย้อนหลัง แล้วแจ้งทีม Audit พร้อมข้อมูลต่อไปนี้: target SHA, deployment URL/ID, UTC timestamp, affected run/item ID แบบไม่เปิดเผย PII, sanitized error, impact, containment action และข้อเสนอ remediation
>
> ## 6. รูปแบบรายงานกลับทีม Audit
>
> ```text
> PR-SYNC-1 Evidence Round 1 Update
> Gate: G0/G1/G2/G3/G4/G5/G6
> Status: PASS / FAIL / BLOCKED / INCOMPLETE
> Target SHA: 453f0d606c391d686cab13edd5a29e7cfb746384
> Environment: staging/<preview-name>
> UTC timestamp:
> Operator:
> Deployment URL/ID:
> Evidence links:
> Open issues/exceptions:
> Next action:
> ```
>
> ทีม Audit จะตรวจ evidence โดยอิสระและเปลี่ยนสถานะเป็น `ACCEPTED`, `CONDITIONAL` หรือ `BLOCKED` เมื่อหลักฐานครบแล้วเท่านั้น การที่ทีมพัฒนารัน test ผ่านไม่ถือเป็น production approval โดยอัตโนมัติ
>
> ขอให้ทีมพัฒนาชุดใหม่ตอบกลับก่อนเริ่ม deployว่า **รับทราบบทบาท, ยืนยัน target SHA, ยืนยัน staging DB แยกจาก production และระบุผู้รับผิดชอบ operator** ครับ

## เอกสารอ้างอิงสำหรับทีม

| เอกสาร | วัตถุประสงค์ |
|---|---|
| `docs/PR-SYNC-1-STAGING-CANARY-RUNBOOK-TH.md` | ขั้นตอน deployment, smoke test, rollback และ production gates |
| `docs/PR-SYNC-1-MONITORING-DASHBOARD-SPEC-TH.md` | metric, SQL query, threshold และ 14-day tracker |
| `docs/PR-SYNC-1-EVIDENCE-ROUND-1-CHECKLIST-TH.md` | checklist G0–G7 และ acceptance criteria |
| `docs/PR-SYNC-1-STAGING-DEPLOYMENT-RECORD-TEMPLATE-TH.md` | แบบฟอร์ม deployment record และ stability log |
| `scripts/staging-monitoring-queries.sql` | SQL monitoring ที่ต้องรันตามรอบ |

## References

[1]: https://github.com/nikorn2527-stack/ITAM-NextJS/blob/main/docs/PR-SYNC-1-FINAL-AUDIT-REVIEW.md "PR-SYNC-1 final audit review and operational conditions"
[2]: https://github.com/nikorn2527-stack/ITAM-NextJS/blob/main/docs/PR-SYNC-1-STAGING-CANARY-RUNBOOK-TH.md "PR-SYNC-1 staging/canary runbook"
[3]: https://github.com/nikorn2527-stack/ITAM-NextJS/blob/main/docs/PR-SYNC-1-EVIDENCE-ROUND-1-CHECKLIST-TH.md "PR-SYNC-1 Evidence Round 1 checklist"
