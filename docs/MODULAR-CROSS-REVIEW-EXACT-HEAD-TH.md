# Exact-head Cross-review Handoff

## วัตถุประสงค์

คู่มือนี้ป้องกันไม่ให้ peer-review verdict ของ commit เก่าถูกนำไปใช้กับ commit ใหม่โดยไม่ตั้งใจ ทุก verdict ต้องผูกกับ **exact head SHA ของ PR ณ เวลาที่ตรวจ** หากมีการ push commit ใหม่ verdict เดิมต้องถือว่า stale และต้องตรวจซ้ำ

## รูปแบบ verdict มาตรฐาน

Reviewer ต้องเขียน verdict ใน comment ของ PR ด้วยรูปแบบหนึ่งต่อไปนี้ และระบุ SHA เต็ม 40 ตัวอักษรเสมอ

```text
CROSS-REVIEW: PASS
Exact head SHA: `0123456789012345678901234567890123456789`
Evidence: tests ..., scope ..., consumer impact ...
```

ค่าที่อนุญาตคือ `PASS`, `PASS WITH CONDITIONS`, `REQUEST CHANGES` และ `BLOCKED` โดย `PASS` หรือ `PASS WITH CONDITIONS` ไม่ใช่ Audit technical approval และไม่ใช่ Release Owner go/no-go

## กติกาเมื่อมี commit ใหม่

| เหตุการณ์ | การปฏิบัติ |
|---|---|
| เปิด PR หรือเปิด review ครั้งแรก | Reviewer ตรวจ `head.sha` ปัจจุบันและใส่ SHA เต็มใน verdict |
| Owner push commit ใหม่ | verdict เดิมเป็น `STALE`; ต้อง review diff ใหม่และออก verdict ใหม่ |
| มี verdict หลายรายการ | ใช้เฉพาะ verdict ที่ผูกกับ current `head.sha`; รายการเก่าเก็บไว้เป็นประวัติ |
| verdict ไม่มี SHA | ถือว่า `BLOCKED` สำหรับ handoff และส่ง Audit ไม่ได้ |
| SHA ไม่ตรง current head | ถือว่า `BLOCKED` จนกว่า Primary reviewer จะตรวจซ้ำ |
| workflow/check ตรวจไม่ได้ | ห้ามอนุมานเป็น PASS; ใช้ local evidence ได้เฉพาะประกอบการ review และแจ้งผู้ดูแลระบบ |

## ลำดับความรับผิดชอบ

เจ้าของ PR รับผิดชอบทำให้ body, test evidence และ changed-file list ตรงกับ current head แต่ไม่มีสิทธิ์ออก verdict ให้ตนเอง Primary peer reviewer เป็นผู้สรุป peer-review verdict หลังรวบรวม Secondary และ Consumer findings ส่วน Audit เป็นผู้ตัดสิน technical/fail-closed gate และ Release Owner เป็นผู้ตัดสิน environment, staging, canary และ release

## Exact-head gate

ไฟล์ `scripts/validate-cross-review-exact-head.mjs` เป็น read-only validator ที่อ่าน PR head และ comments ผ่าน GitHub API แล้วตรวจว่ามี verdict จากผู้ที่ไม่ใช่เจ้าของ PR และอ้าง current SHA หรือไม่ สามารถรันได้ทั้งจาก local machine หรือ CI ที่มีสิทธิ์อ่าน `contents`, `issues` และ `pull-requests`

ตัวอย่างการรันกับ PR #39:

```bash
GITHUB_TOKEN="$GH_TOKEN" \
GITHUB_REPOSITORY="nikorn2527-stack/ITAM-NextJS" \
PR_NUMBER=39 \
node scripts/validate-cross-review-exact-head.mjs
```

หากพบ verdict ที่อ้าง current SHA จะแสดง `EXACT_HEAD_CHECK=PASS` หากไม่มี verdict ที่ตรง SHA, มีแต่ verdict ที่ไม่มี/อ้าง SHA เก่า หรือ verdict มาจากเจ้าของ PR จะแสดง `EXACT_HEAD_CHECK=BLOCKED` และคืนค่า non-zero exit code เพื่อไม่ให้ stale verdict ผ่านเป็นหลักฐาน Audit

การเพิ่ม workflow อัตโนมัติเป็น optional follow-up ที่ต้องใช้ token ของ repository ซึ่งมี `workflows` permission; PR นี้จึงไม่ฝัง workflow เพื่อหลีกเลี่ยงการเพิ่มสิทธิ์เกินจำเป็น และยังใช้ validator เดียวกันเป็น CI/local gate ได้ทันที

## Handoff checklist

ก่อนส่งต่อ Audit ให้ตรวจว่ามี current head SHA เต็ม, verdict จาก Primary reviewer, evidence ของ Secondary/Consumer reviewers เมื่อมี dependency, tests ที่รันบน head เดียวกัน, B4 frozen-file result, schema/migration result และรายการ blocker ที่ยังเปิดอยู่ครบถ้วน
