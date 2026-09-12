# Modular Cross-Review Matrix และกติกาการตรวจงานข้ามทีม

**สถานะ:** Proposed for immediate use
**ผู้จัดทำ:** Manus AI
**วันที่:** 2026-08-21
**Repository:** `nikorn2527-stack/ITAM-NextJS`

## 1. วัตถุประสงค์

ปัจจุบันทีมพัฒนาทั้ง 4 ทีมมีสถานะเป็น **Dev** เหมือนกัน จึงไม่ควรให้ทีมเจ้าของโมดูลตรวจและอนุมัติงานของตนเองทั้งหมด เพราะจะเกิด self-review และมีโอกาสมองข้ามข้อผิดพลาดในจุดที่ผู้เขียนคุ้นเคยอยู่แล้ว เอกสารนี้กำหนดให้แต่ละทีมตรวจงานของอีกโมดูลหนึ่งแบบหมุนเวียน โดยแยกบทบาทผู้เขียน ผู้ตรวจข้ามทีม Audit และ Release Owner ออกจากกันอย่างชัดเจน

> **Cross-review ไม่ใช่การอนุมัติ release** แต่เป็น technical peer review ชั้นต้น การตัดสิน technical gate ขั้นสุดท้ายยังเป็นหน้าที่ของ Audit และการตัดสิน environment, risk และ release ยังเป็นหน้าที่ของ Release Owner

## 2. ทีมและ ownership

| Team | Module | Canonical ownership | Primary cross-reviewer |
|---|---|---|---|
| Dev-1 | Repair / แจ้งซ่อม | WorkOrder, repair lifecycle, repair parts link และ job identity | Dev-2 Stock |
| Dev-2 | Stock / สต๊อก | StockItem, StockTransaction, issue/approval และ material semantics | Dev-3 Devices |
| Dev-3 | Devices / จัดการอุปกรณ์ | Device identity, transfer, lifecycle และ device import | Dev-4 Meter |
| Dev-4 | Meter / จดมิเตอร์ | MeterReading, period validation, reset policy และ reading query | Dev-1 Repair |

การเป็นเจ้าของหมายถึงทีมมีสิทธิ์พัฒนา canonical behavior ของโมดูลนั้น ไม่ได้หมายความว่าทีมมีสิทธิ์แก้ shared authorization, audit, migration หรือ release gate โดยลำพัง การเปลี่ยนแปลงที่มีผลข้ามโมดูลต้องมี contract review เพิ่มเติม

## 3. Matrix สำหรับ PR ปัจจุบัน

| PR | โมดูล | ทีมเจ้าของ | ทีมตรวจข้ามหลัก | สถานะ |
|---:|---|---|---|---|
| [#27](https://github.com/nikorn2527-stack/ITAM-NextJS/pull/27) | Repair | Dev-1 | Dev-2 Stock | Open; ต้อง review exact head ก่อน merge |
| [#28](https://github.com/nikorn2527-stack/ITAM-NextJS/pull/28) | Stock | Dev-2 | Dev-3 Devices | Open; ต้อง review exact head ก่อน merge |
| [#29](https://github.com/nikorn2527-stack/ITAM-NextJS/pull/29) | Devices | Dev-3 | Dev-4 Meter | Open; ต้อง review exact head ก่อน merge |
| [#30](https://github.com/nikorn2527-stack/ITAM-NextJS/pull/30) | Meter | Dev-4 | Dev-1 Repair | Open; ต้อง review exact head ก่อน merge |

หาก GitHub ยังไม่มีบัญชีแบบ organization team ให้ใช้ชื่อ Dev-1 ถึง Dev-4 ใน PR comment และ review record ไปก่อน เมื่อมีบัญชีทีมจริงจึงค่อยผูกเป็น required reviewer โดยไม่เปลี่ยน matrix นี้

## 4. ขอบเขตการตรวจของ cross-reviewer

ผู้ตรวจข้ามทีมต้องตรวจอย่างน้อย 5 ด้าน ได้แก่ ความถูกต้องของ contract และ field mapping, authorization และ fail-closed behavior, duplicate/concurrency/idempotency, resource bound และ pagination, และผลกระทบต่อ mobile/API consumer เดิม ผู้ตรวจต้องอ่าน diff ของ exact head ไม่ตรวจจาก branch ที่อาจเปลี่ยนไปแล้ว

สำหรับ PR ที่แตะ database schema, migration, auth, audit, sync apply หรือข้อมูลข้ามโมดูล ต้องระบุใน review อย่างชัดเจนว่าเป็น **Shared Contract Change** และต้องมี Audit review เพิ่ม ไม่สามารถใช้ cross-review ของ Dev เพียงทีมเดียวแทน Audit ได้

## 5. กติกา reviewer independence

ผู้เขียน PR ห้าม approve PR ของตนเอง แม้จะเป็นสมาชิกของทีมเจ้าของโมดูลก็ตาม ทีมเจ้าของมีหน้าที่ตอบข้อสงสัยและแก้ไขตาม review แต่ผู้ตรวจหลักต้องมาจากทีมที่ระบุใน matrix และต้องไม่ใช่ผู้ที่เขียนไฟล์เดียวกันใน commit เดียวกัน หากผู้ตรวจหลักมี conflict หรือไม่พร้อม ให้ส่งต่อให้ทีมถัดไปตามทิศทางวงแหวน **Repair → Stock → Devices → Meter → Repair** โดยห้ามย้อนกลับไปให้ทีมเจ้าของตรวจแทน

การส่ง commit ใหม่หลัง review ทำให้ verdict เดิมหมดผลกับส่วนที่เปลี่ยน ผู้ตรวจต้องระบุ exact SHA ที่ตรวจทุกครั้ง หากมีการแก้เฉพาะ documentation ที่ไม่เปลี่ยน code สามารถยืนยัน verdict เดิมได้เมื่อผู้ตรวจบันทึกเหตุผลไว้

## 6. Review outcome ที่ใช้ร่วมกัน

ให้ผู้ตรวจใช้รูปแบบใดรูปแบบหนึ่งต่อไปนี้ใน PR comment:

```text
CROSS-REVIEW: PASS
Reviewer team: Dev-N <module>
Author team: Dev-N <module>
Exact head: <40-char SHA>
Scope checked: contract, security, data integrity, performance, consumer compatibility
Blocking findings: none
Evidence: <test command/result or file links>
```

หากยังมีเงื่อนไขให้ใช้ `CROSS-REVIEW: PASS WITH CONDITIONS` และระบุเงื่อนไขที่ต้องแก้ก่อน merge อย่างเป็นข้อเท็จจริง หากพบ defect ให้ใช้ `CROSS-REVIEW: REQUEST CHANGES` พร้อม reproduction, impact และ acceptance criterion ที่ตรวจซ้ำได้ ห้ามใช้คำว่า “ผ่าน” โดยไม่มี exact SHA และ evidence

## 7. ลำดับการส่งมอบ

ลำดับมาตรฐานคือ Dev เจ้าของโมดูลเขียน code และ tests, cross-reviewer ตรวจ exact SHA, เจ้าของแก้และส่งหลักฐานซ้ำ, Audit ตรวจ technical gate เมื่อมี risk หรือ shared contract, จากนั้น Release Owner จึงตัดสินใจเรื่อง staging, canary หรือ production ตาม gate ที่เกี่ยวข้อง การผ่าน cross-review ไม่เปลี่ยนสถานะปัจจุบันที่ G3 และ Production ยัง blocked

แต่ละ PR ต้อง target ไปยัง base branch ที่กำหนดใน workstream ไม่ target `main` โดยตรงในช่วงนี้ เมื่อ Audit ออก verdict แล้วเท่านั้นจึงค่อยพิจารณา merge ตาม release plan และต้องไม่ merge หลายโมดูลพร้อมกันจนไม่สามารถแยก provenance ได้

## 8. กรณีที่ต้องหยุดและส่ง Audit

ต้องหยุด cross-review และส่ง Audit ทันทีเมื่อพบการแก้ B4 frozen files, การเพิ่มหรือเปลี่ยน permission, การเปลี่ยน authorization boundary, การเพิ่ม migration ที่กระทบข้อมูลจริง, การเปลี่ยน sync apply semantics, การส่งข้อมูล secret/PII เข้า log หรือ audit detail, หรือการเพิ่ม dependency ที่มีผลต่อ resource budget

ในกรณีดังกล่าว cross-reviewer ยังสามารถให้ technical observations ได้ แต่ห้ามประกาศ technical pass แทน Audit และห้ามให้ทีมเจ้าของ merge หรือ deploy เอง

## 9. Definition of Done ของ cross-review

งานจะถือว่า cross-review เสร็จเมื่อ reviewer ตรวจ exact head แล้ว, มี test/evidence ที่ทำซ้ำได้, ไม่มี blocking finding ค้าง, มีผลตรวจ B4 และ governance constraints ตามความเกี่ยวข้อง, มีการบันทึก verdict ลง PR และ Issue ของโมดูล, และผู้เขียนยืนยันว่าไม่มีการเขียนข้อมูลนอก canonical ownership ของตนเอง

## References

1. [Modular Development Team Plan](https://github.com/nikorn2527-stack/ITAM-NextJS/blob/feature/itam-next-direction-repair-workflow/docs/MODULAR-DEVELOPMENT-TEAM-PLAN-TH.md)
2. [Repair Module Brief](https://github.com/nikorn2527-stack/ITAM-NextJS/blob/feature/itam-next-direction-repair-workflow/docs/modules/repair/README.md)
3. [PR #27 Repair](https://github.com/nikorn2527-stack/ITAM-NextJS/pull/27)
4. [PR #28 Stock](https://github.com/nikorn2527-stack/ITAM-NextJS/pull/28)
5. [PR #29 Devices](https://github.com/nikorn2527-stack/ITAM-NextJS/pull/29)
6. [PR #30 Meter](https://github.com/nikorn2527-stack/ITAM-NextJS/pull/30)

## 10. Universal loop สำหรับงานทุกประเภท

เพื่อไม่ให้แต่ละทีมสับสนว่า PR หรืองานใหม่ต้องวนตรวจใคร ให้ใช้ลำดับถาวรนี้กับทุก work item:

```text
ทีมเจ้าของงาน → ผู้ตรวจหลักตามวงแหวน → ผู้ตรวจสำรองเมื่อมีเหตุจำเป็น → Audit เมื่อเข้าเกณฑ์ → Release Owner ตัดสินใจ release
```

| ทีมเจ้าของงาน | ผู้ตรวจหลัก | ผู้ตรวจสำรอง | ใช้กับงานอื่นอย่างไร |
|---|---|---|---|
| Dev-1 Repair | Dev-2 Stock | Dev-3 Devices | ทุก Repair feature, bugfix, adapter และ parts flow |
| Dev-2 Stock | Dev-3 Devices | Dev-4 Meter | ทุก Stock feature, transaction, approval และ material issue |
| Dev-3 Devices | Dev-4 Meter | Dev-1 Repair | ทุก Device feature, transfer, import และ lifecycle |
| Dev-4 Meter | Dev-1 Repair | Dev-2 Stock | ทุก Meter feature, reading, reset และ report |

งานที่แก้ไขหลายโมดูลให้เพิ่มทีมเจ้าของโมดูลที่ได้รับผลกระทบเป็น `DOMAIN-CONSULT` แต่ยังคงผู้ตรวจหลักตามตารางเดิมหนึ่งทีมเพื่อออก verdict เดียว งานที่แตะ Shared Platform, auth/RBAC, audit, migration หรือ sync-apply ต้องส่ง Audit เพิ่มเสมอ

เมื่อเจ้าของงานแก้ตาม review ให้ผู้ตรวจหลักคนเดิมตรวจซ้ำเฉพาะ diff ใหม่ ไม่ต้องวนครบสี่ทีมอีกครั้ง หากเปลี่ยน scope หรือเพิ่มผลกระทบข้ามโมดูล ให้เริ่ม focused review กับทีมที่ได้รับผลกระทบและแจ้ง Audit ตามความเสี่ยง

กติกานี้ทำให้ทุกทีมตอบได้ทันทีว่า **งานของฉันให้ใครตรวจ, ถ้าติดขัดให้ใครรับช่วง, และเมื่อใดต้องส่ง Audit** โดยไม่ต้องตีความจากหมายเลข PR หรือสลับผู้ตรวจไปเรื่อย ๆ
