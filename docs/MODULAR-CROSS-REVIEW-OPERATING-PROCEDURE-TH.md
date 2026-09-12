# คู่มือวงรอบตรวจงานกลางสำหรับ Dev 4 ทีม

**สถานะ:** ใช้เป็น working agreement ทันทีหลัง PR governance นี้ได้รับการรับทราบ
**ผู้จัดทำ:** Manus AI
**วันที่:** 2026-08-21
**Repository:** `nikorn2527-stack/ITAM-NextJS`

## 1. หลักการสำคัญ

ทีม Dev ทั้ง 4 ทีมมีสถานะเท่ากัน จึงใช้ระบบ **หมุนเวียนตรวจข้ามทีม** เพื่อไม่ให้ทีมเจ้าของตรวจและอนุมัติงานของตนเอง วงรอบนี้เป็นการจัดผู้ตรวจ ไม่ใช่การส่งงานต่อแบบไม่มีที่สิ้นสุด และไม่ใช่การอนุมัติ release

> งานหนึ่งรายการจะถูกตรวจโดยผู้ตรวจหลักหนึ่งทีมก่อน หากพบปัญหาให้ทีมเจ้าของแก้ แล้วผู้ตรวจเดิมตรวจซ้ำเฉพาะจุดที่แก้ เมื่อผ่านแล้วจึงส่ง Audit ตามเกณฑ์ที่กำหนด ไม่ต้องวนตรวจครบทั้ง 4 ทีมทุกครั้ง

**Audit** ยังคงเป็นผู้ตัดสิน technical gate สุดท้าย ส่วน **Release Owner** เป็นผู้ตัดสิน environment, risk, staging, canary และ production release การผ่าน cross-review ไม่ได้ปลดล็อก G3 หรือ Production

## 2. วงแหวนผู้ตรวจมาตรฐาน

ให้ใช้ลำดับคงที่นี้กับทุกงานที่มีเจ้าของโมดูลชัดเจน:

```text
Dev-1 Repair → Dev-2 Stock → Dev-3 Devices → Dev-4 Meter → Dev-1 Repair
```

| ทีมเจ้าของงาน | โมดูลหลัก | ผู้ตรวจหลัก | ผู้ตรวจสำรอง |
|---|---|---|---|
| Dev-1 | Repair / แจ้งซ่อม | Dev-2 Stock | Dev-3 Devices |
| Dev-2 | Stock / สต๊อก | Dev-3 Devices | Dev-4 Meter |
| Dev-3 | Devices / จัดการอุปกรณ์ | Dev-4 Meter | Dev-1 Repair |
| Dev-4 | Meter / จดมิเตอร์ | Dev-1 Repair | Dev-2 Stock |

**ความหมายของตาราง:** ผู้ตรวจหลักคือทีมถัดไปในวงแหวน ไม่ใช่ทีมที่งานจะถูกส่งไปพัฒนาต่อ ผู้ตรวจสำรองใช้เฉพาะเมื่อผู้ตรวจหลักมี conflict, เป็นผู้เขียนงาน, หรือไม่สามารถตรวจภายในเวลาที่ตกลงกันได้ การใช้ผู้ตรวจสำรองต้องบันทึกเหตุผลใน PR

## 3. วิธีเลือกวงรอบสำหรับงานทุกประเภท

| ประเภทงาน | ผู้ตรวจที่ต้องใช้ | การส่งต่อหลังตรวจ |
|---|---|---|
| งานในโมดูลเดียว | ผู้ตรวจหลักตามวงแหวน | `PASS` แล้วส่ง Audit ตามความเสี่ยง; `REQUEST CHANGES` ให้เจ้าของแก้และผู้ตรวจเดิมตรวจซ้ำ |
| งานแก้ bug ในโมดูลเดียว | ผู้ตรวจหลักตามวงแหวน | ตรวจ reproduction, regression และ exact head; ไม่ต้องวนครบ 4 ทีม |
| งานที่แตะ 2 โมดูล | ทีมเจ้าของ + ทีมเจ้าของโมดูลที่ได้รับผลกระทบ + ผู้ตรวจอิสระ | ทีมผลกระทบให้ domain/contract review; ผู้ตรวจอิสระเป็นผู้ให้ cross-review verdict; หากแก้ shared contract ให้ Audit ตรวจเพิ่ม |
| งานที่แตะ 3–4 โมดูล | ผู้ตรวจหลักและผู้ตรวจสำรองตามวงแหวน | ต้องมี cross-review อย่างน้อย 2 ทีม และส่ง Audit ก่อน merge |
| Shared Platform, auth, RBAC, audit, migration, sync apply | ผู้ตรวจหลักตามวงแหวนและผู้ตรวจสำรอง | Audit review เป็นข้อบังคับ; ห้ามใช้ Dev verdict แทน Audit |
| Documentation หรือ test-only ที่ไม่เปลี่ยน runtime | ผู้ตรวจหลักตามวงแหวน | ตรวจความถูกต้องและความสอดคล้อง; ถ้าไม่มี code/contract change ไม่ต้องวนเพิ่ม |
| P0/P1 หรือ security defect | ผู้ตรวจหลักที่พร้อมที่สุดซึ่งไม่ใช่เจ้าของ + Audit แจ้งทันที | แก้และตรวจซ้ำแบบ focused review; ห้าม bypass governance เพื่อ deploy Production |

หลักการคือ **หนึ่งงานมีหนึ่งเจ้าของ หนึ่งผู้ตรวจหลัก และผู้ตรวจสำรองหนึ่งทีม** งานจะไม่ถูกส่งต่อไปเรื่อย ๆ เพียงเพราะเป็นงานของทีมถัดไป ผู้ตรวจหลักเป็นผู้รับผิดชอบ verdict ของรอบนั้นจนกว่าจะปิดข้อสังเกตหรือส่งต่อให้ผู้ตรวจสำรองอย่างมีเหตุผล

## 4. ตัวอย่างการวนตรวจที่ทุกทีมใช้เหมือนกัน

### 4.1 งาน Repair ปกติ

Dev-1 เปิด PR งาน Repair และระบุ Dev-2 เป็นผู้ตรวจหลัก Dev-2 ตรวจ exact head, tests, security, data integrity และ resource bound หากพบปัญหา Dev-1 แก้บน PR เดิม แล้ว Dev-2 ตรวจซ้ำเฉพาะ diff ใหม่ เมื่อ `CROSS-REVIEW: PASS` จึงส่ง Audit หากงานเข้าข่าย shared contract

### 4.2 งาน Stock ที่แตะ Repair

Dev-2 เป็นเจ้าของ PR และแก้ Stock เป็นหลัก แต่มีการเปลี่ยน material link ที่ผูก WorkOrder ด้วย Dev-1 เป็น **domain consult reviewer** เพื่อตรวจ contract ของ Repair ส่วนผู้ตรวจอิสระให้เลือก Dev-3 ตามวงแหวนของ Dev-2 หาก Dev-3 ตรวจผ่านจึงส่ง Audit เมื่อ change แตะ schema, migration หรือ authorization

### 4.3 งาน Devices ที่แตะ Meter

Dev-3 เป็นเจ้าของงานและเปลี่ยน device field ที่ Meter ใช้ Dev-4 ทำ domain/contract review เพราะเป็นเจ้าของ Meter หาก Dev-4 มี conflict จากการเขียนส่วนที่ได้รับผลกระทบ ให้ใช้ Dev-1 เป็นผู้ตรวจอิสระหลัก และ Dev-2 เป็นสำรองตามเหตุผลที่บันทึกใน PR

### 4.4 งาน Shared Platform

ไม่ว่าทีมใดเป็นผู้เขียน ให้ผู้ตรวจหลักตามวงแหวนตรวจรอบแรก ผู้ตรวจสำรองตรวจรอบที่สอง และส่ง Audit ตรวจ technical gate เสมอ ตัวอย่างเช่น PR ของ Dev-1 ที่แก้ auth หรือ migration จะไม่ถือว่าผ่านจาก Dev-2 เพียงทีมเดียว

## 5. กติกาเมื่อพบปัญหาและการตรวจซ้ำ

เมื่อผู้ตรวจพบ defect ให้ใช้ `CROSS-REVIEW: REQUEST CHANGES` พร้อม reproduction, impact, file/line, acceptance criterion และ exact head ที่ตรวจพบ เจ้าของ PR แก้ไขบน branch เดิมและ push commit ใหม่

หลังมี commit ใหม่ verdict เดิมจะหมดผลเฉพาะส่วนที่เปลี่ยน ผู้ตรวจเดิมต้องตรวจซ้ำโดยอ้าง exact head ใหม่ ไม่จำเป็นต้องตรวจทั้ง PR ใหม่หาก scope ไม่เปลี่ยน หากเจ้าของเปลี่ยน scope, เพิ่มไฟล์ข้ามโมดูล หรือแตะ shared contract ต้องขยายขอบเขต review และแจ้ง Audit

หากผู้ตรวจหลักไม่พร้อม ให้ผู้ตรวจสำรองรับช่วงต่อได้เพียงครั้งนั้น โดยต้องระบุเหตุผล เช่น conflict, ลาพัก, หรือไม่สามารถตรวจตาม SLA ทีมได้ ห้ามเปลี่ยนผู้ตรวจเพื่อหลีกเลี่ยงข้อสังเกต

## 6. ขั้นตอนปฏิบัติใน GitHub

เจ้าของงานต้องเปิด branch จาก base ที่ workstream ระบุ และเปิด PR โดยกรอกข้อมูลใน PR template ให้ครบ ได้แก่ module owner, work type, primary reviewer, backup reviewer, impacted modules, shared contract flag, exact head, test evidence และ resource/security notes

ผู้ตรวจหลักต้องเขียนผลใน PR comment ด้วยรูปแบบมาตรฐานดังนี้:

```text
CROSS-REVIEW: PASS | PASS WITH CONDITIONS | REQUEST CHANGES
Reviewer team: Dev-N <module>
Author team: Dev-N <module>
Review role: PRIMARY | DOMAIN-CONSULT | BACKUP
Exact head: <40-char SHA>
Scope checked: contract, security, data integrity, performance, consumer compatibility
Blocking findings: none | <findings>
Evidence: <test command/result or file links>
Re-review required: yes | no
```

`DOMAIN-CONSULT` ใช้สำหรับทีมเจ้าของโมดูลที่ได้รับผลกระทบ แต่ทีมนี้ไม่ใช่ผู้ให้ verdict หลักเมื่อเป็นงานข้ามโมดูล เว้นแต่ผู้ตรวจหลักตามวงแหวนไม่มี conflict และ scope ไม่ทำให้เกิด self-review

## 7. Definition of Done ของหนึ่งรอบ

รอบตรวจถือว่าเสร็จเมื่อมีผู้ตรวจหลักที่ไม่ใช่เจ้าของ, ตรวจ exact head, อ่านผลทดสอบที่ทำซ้ำได้, ตรวจ B4/governance ตามขอบเขต, ไม่มี blocking finding ค้าง และบันทึก verdict ใน PR แล้ว หากงานเข้าข่าย shared contract ต้องมี Audit handoff เพิ่มก่อน merge

การวนรอบของงานถัดไปจะเริ่มใหม่จากทีมเจ้าของงานตามตารางเดิม ไม่ได้เลื่อนผู้ตรวจไปเรื่อย ๆ ตามจำนวนครั้งที่แก้ไข ดังนั้นทุกทีมสามารถดูจาก **ทีมเจ้าของ → ผู้ตรวจหลัก → ผู้ตรวจสำรอง** แล้วรู้ทันทีว่าต้องตรวจใคร

## 8. ข้อห้ามที่ยังมีผล

ห้ามผู้เขียน approve งานของตนเอง ห้าม merge เข้า `main` โดยข้าม base/workstream gate ห้ามแก้ B4 frozen files โดยไม่มี governance review ห้ามเพิ่ม `SYNC_RUN` permission โดยไม่มี Audit review ห้ามใช้ `prisma db:push` และห้ามถือ cross-review เป็น Production approval

## References

1. [Modular Cross-Review Matrix](https://github.com/nikorn2527-stack/ITAM-NextJS/blob/feature/governance-cross-review-rotation/docs/MODULAR-CROSS-REVIEW-MATRIX-TH.md)
2. [Modular Development Team Plan](https://github.com/nikorn2527-stack/ITAM-NextJS/blob/feature/itam-next-direction-repair-workflow/docs/MODULAR-DEVELOPMENT-TEAM-PLAN-TH.md)
3. [GitHub PR #27 Repair](https://github.com/nikorn2527-stack/ITAM-NextJS/pull/27)
4. [GitHub PR #28 Stock](https://github.com/nikorn2527-stack/ITAM-NextJS/pull/28)
5. [GitHub PR #29 Devices](https://github.com/nikorn2527-stack/ITAM-NextJS/pull/29)
6. [GitHub PR #30 Meter](https://github.com/nikorn2527-stack/ITAM-NextJS/pull/30)
