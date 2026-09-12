# Exact-Head Review Protocol

**สถานะ:** เร่งด่วน ใช้กับ PR ที่อยู่ใน cross-review ทันที

เอกสารนี้แก้คอขวดที่เกิดจากผู้เขียนและผู้ตรวจอ้างอิงคนละ revision โดยกำหนดให้หนึ่งรอบ review มี revision ที่ freeze ชัดเจน มี review packet เดียว และมีเกณฑ์หมดอายุของ verdict ที่ตรวจสอบได้

## 1. หลักการ

ผู้เขียน PR ต้องประกาศ `REVIEW PACKET` เมื่อพร้อมให้ตรวจ โดย packet ต้องผูกกับ `head SHA` ปัจจุบันแบบ 40 ตัวอักษร, `base SHA`, เวลาที่ freeze, scope, test evidence และผู้ตรวจหลัก/สำรอง ผู้ตรวจต้องตรวจ commit เดียวกับ packet จาก GitHub โดยตรง ไม่ตรวจจาก branch ที่เปลี่ยนภายหลังหรือจาก PR body ที่อาจล้าสมัย

ระหว่างสถานะ `REVIEW-FROZEN` ห้าม push commit ใหม่ หากพบว่าต้องแก้ ให้ผู้เขียนโพสต์ `HEAD-CHANGED` พร้อม SHA ใหม่และเหตุผลก่อน push จากนั้น packet เดิมจะหมดผล และต้องสร้าง packet ใหม่ทันที

## 2. สถานะของรอบตรวจ

| สถานะ | ความหมาย | การดำเนินการ |
|---|---|---|
| `READY-FOR-REVIEW` | มี packet และ exact head ครบ แต่ยังไม่มี reviewer acknowledgement | ผู้ตรวจหลักรับงานหรือประกาศ handoff |
| `REVIEW-FROZEN` | ผู้ตรวจรับ packet แล้วและเจ้าของหยุด push | ผู้ตรวจตรวจ SHA นี้เท่านั้น |
| `VERDICT-PENDING` | ตรวจเสร็จ รอผู้ตรวจเขียน verdict มาตรฐาน | ห้ามเปลี่ยน head |
| `PASS` หรือ `PASS WITH CONDITIONS` | verdict ผูก exact head และไม่มี blocker ตาม scope | ส่ง Audit ตาม risk; ยังไม่ใช่ merge/release approval |
| `REQUEST CHANGES` | พบ blocker หรือ evidence ไม่ครบ | เจ้าของแก้บน branch เดิม แล้วสร้าง packet ใหม่ |
| `STALE` | head เปลี่ยนหลัง packet หรือ verdict | verdict เดิมใช้ไม่ได้ ต้อง focused re-review |

## 3. Review packet ที่ต้องใช้

ผู้เขียนต้องโพสต์ข้อความรูปแบบนี้ใน PR:

```text
REVIEW PACKET: READY-FOR-REVIEW
PR: #<number>
Author team: Dev-N <module>
Primary reviewer: Dev-N <module>
Backup reviewer: Dev-N <module>
Base SHA: <40-char SHA>
Head SHA: <40-char SHA>
Freeze time UTC: <ISO-8601>
Scope: <files/contracts/routes>
Tests: <command and result>
Security/resource notes: <summary>
B4 impact: none | affected with approval reference
Shared contract: no | yes — Audit required
Owner acknowledgement: I will not push while REVIEW-FROZEN
```

ผู้ตรวจต้องตอบด้วยรูปแบบนี้ โดยต้องใช้ SHA 40 ตัวอักษรเดียวกับ packet:

```text
CROSS-REVIEW: PASS | PASS WITH CONDITIONS | REQUEST CHANGES
Reviewer team: Dev-N <module>
Author team: Dev-N <module>
Review role: PRIMARY | DOMAIN-CONSULT | BACKUP
Base SHA: <40-char SHA>
Exact head: <40-char SHA>
Scope checked: contract, security, data integrity, performance, consumer compatibility
Blocking findings: none | <findings with file/line>
Evidence: <reproducible command/result or link>
Head verified at: <ISO-8601 UTC>
Re-review required: yes | no
```

คำว่า `COMMENTED`, `LGTM`, `looks good` หรือข้อความที่ไม่มี `Exact head` 40 ตัวอักษร **ไม่นับเป็น verdict**

## 4. วิธีทำให้เร็วขึ้นโดยไม่ลดความเข้มงวด

ผู้ตรวจหลักสามารถรับ packet ด้วยข้อความสั้น `REVIEW-ACK: <40-char SHA>` แล้วตรวจเฉพาะ diff ของ packet นั้นได้ทันที หากไม่พร้อมต้องโพสต์ `HANDOFF TO BACKUP` พร้อมเหตุผล ไม่ใช่ปล่อยให้เจ้าของรอโดยไม่มีสถานะ

งาน follow-up ให้ตรวจเฉพาะ diff จาก parent PR และผลกระทบต่อ contract เดิม แต่ต้องระบุ parent PR, base SHA และ head SHA ของ follow-up แยกกัน ผู้ตรวจไม่ต้องตรวจ repository ทั้งหมดซ้ำ เว้นแต่ scope เปลี่ยน, แตะ shared contract, แตะ migration/auth/RBAC/audit หรือกระทบหลายโมดูล

## 5. กติกาเมื่อ head เปลี่ยน

หาก `current head != packet head` ให้ถือ packet เป็น `STALE` ทันที ห้ามผู้ตรวจออก `PASS` ด้วย SHA เดิม เจ้าของต้องโพสต์:

```text
HEAD-CHANGED
Previous packet head: <40-char SHA>
New head: <40-char SHA>
Reason: <reason>
Changed scope: none | <summary>
New tests: <command and result>
New review packet: required
```

ถ้าเปลี่ยนเฉพาะการแก้ตาม review เดิมและ scope ไม่ขยาย ผู้ตรวจคนเดิมทำ focused re-review ได้ ถ้า scope ขยายหรือแตะ shared contract ต้องเพิ่ม domain consult/Audit ตาม matrix

## 6. Definition of Done ของ Exact-head round

รอบตรวจจะปิดได้เมื่อ PR มี packet ที่ตรงกับ current head, มี reviewer ที่ไม่ใช่ author, มี verdict มาตรฐาน, SHA ยาว 40 ตัวอักษรตรงกัน, evidence ทำซ้ำได้, ไม่มี blocker ค้าง และระบุว่า re-review จำเป็นหรือไม่ สำหรับ auth/RBAC/audit/migration/shared contract/sync apply ต้องมี Audit handoff เพิ่มก่อน merge

## 7. ข้อจำกัดที่ยังมีผล

โปรโตคอลนี้ไม่อนุญาตให้ merge ข้าม review, ไม่ปลดล็อก G2/G3/Production, ไม่เพิ่ม `SYNC_RUN`, ไม่ใช้ `prisma db:push`, ไม่แก้ B4 frozen files และไม่ส่ง secrets ผ่าน GitHub comment

## References

1. [Universal Cross-Review Operating Procedure](./MODULAR-CROSS-REVIEW-OPERATING-PROCEDURE-TH.md)
2. [Modular Cross-Review Matrix](./MODULAR-CROSS-REVIEW-MATRIX-TH.md)
3. [Repository Pull Request Template](../.github/PULL_REQUEST_TEMPLATE.md)
4. [GitHub PR #27](https://github.com/nikorn2527-stack/ITAM-NextJS/pull/27)
5. [GitHub PR #28](https://github.com/nikorn2527-stack/ITAM-NextJS/pull/28)
6. [GitHub PR #29](https://github.com/nikorn2527-stack/ITAM-NextJS/pull/29)
7. [GitHub PR #30](https://github.com/nikorn2527-stack/ITAM-NextJS/pull/30)
