# ITAM-04 — Meter Latest Result UI Handoff

**วันที่:** 2026-08-22  
**ทีม:** ITAM-04 — Dev-4 / Meter  
**Issue:** [ITAM-NextJS Issue #25](https://github.com/nikorn2527-stack/ITAM-NextJS/issues/25)  
**สถานะ:** Source change พร้อมให้ review; ยังไม่ merge และยังไม่ deploy

## สรุปการแก้ไข

Requirement นี้แก้ที่ `src/components/itam/itam-meter-keyboard.tsx` ซึ่งเป็น entry mode ของ `ItamMeterUnified` ที่ active page ใช้งานอยู่ โดยเพิ่ม `latest` state แยกจาก `recent` history และแสดงผลยืนยันในพื้นที่หลักของ selected-device panel รายการล่าสุดจะแสดงหลัง API ตอบกลับสำเร็จเท่านั้น ส่วนการ์ด `คีย์ล่าสุด (N/5)` ด้านล่างยังคงไว้เป็น secondary history view

แผงผลลัพธ์หลักแสดง **Asset Code**, ค่า **BW/Color**, **delta**, วันเวลา และสถานะ โดยใช้ badge `RESET` เมื่อค่าที่บันทึกต่ำกว่าค่าก่อนหน้า หากเป็นโหมด `TOTAL` จะแสดง Color เป็น `—` เพื่อไม่สื่อว่ามี color counter ที่ไม่ได้ใช้ รายการใหม่ถูก prepend เข้า history จึงยังคงลำดับล่าสุดไว้ด้านบนและเก็บย้อนหลังได้สูงสุด 5 รายการ

## เงื่อนไขสำเร็จและล้มเหลว

`saveReading()` ยังคงตรวจ `res.ok` และ throw error ก่อนสร้าง `savedReading`, `setLatest()` หรือ `setRecent()` ดังนั้นกรณีบันทึกไม่สำเร็จจะไม่แสดงรายการในพื้นที่ยืนยันสำเร็จ และไม่ถูกเพิ่มใน history การ toast error เดิมยังคงทำงานผ่าน `catch` ตามเดิม

Primary panel ถูกวางไว้นอก `selected` conditional ภายใน right working area จึงยังมองเห็นผลล่าสุดได้แม้รายการที่เพิ่งบันทึกเป็นอุปกรณ์สุดท้ายและคิวด้านซ้ายหมดแล้ว การเปลี่ยนอุปกรณ์หรือการเลื่อนไปอุปกรณ์ถัดไปไม่ลบ latest result โดยอัตโนมัติ

## Acceptance evidence

| กรณีตรวจ | ผลที่ต้องได้ | สถานะ source review |
|---|---|---|
| บันทึกสำเร็จ 1 รายการ | แสดงรายการใหม่ใน primary area ทันทีหลัง response สำเร็จ | ผ่านด้วย source-boundary test |
| BW/Color | แสดง BW, Color, delta และเวลา | ผ่านด้วย source-boundary test |
| RESET | แสดงค่าที่บันทึกและ badge `RESET` | ผ่านด้วย source-boundary test |
| บันทึกไม่สำเร็จ | ไม่สร้าง latest-success และไม่เพิ่ม recent | ผ่านด้วย ordering assertion รอบ `res.ok` |
| บันทึกต่อเนื่อง | รายการใหม่สุดอยู่บนสุดและ history เก็บไม่เกิน 5 รายการ | ผ่านจาก prepend/slice contract |
| `บันทึก + ถัดไป` | focus/advance flow เดิมยังคงทำงาน และ latest แยกจาก selected item | ผ่านจากโครงสร้าง component |
| Active unified page | entry mode เรียก `ItamMeterKeyboard`; history mode ยังคงเป็น secondary tab | ยืนยันจาก `itam-meter-unified.tsx` |

## การตรวจสอบที่รัน

คำสั่งที่ใช้เป็น source-only และไม่เรียกฐานข้อมูล:

```text
npx vitest run tests/meter-lifecycle-active-boundary.test.ts
npx eslint src/components/itam/itam-meter-keyboard.tsx tests/meter-lifecycle-active-boundary.test.ts --rule 'react-hooks/set-state-in-effect: off'
git diff --check
```

ผลตรวจคือ **8 tests ผ่าน**, ESLint ผ่านเมื่อปิดเฉพาะ rule baseline `react-hooks/set-state-in-effect` และ `git diff --check` ผ่าน การรัน ESLint แบบไม่ปิด rule ยังพบปัญหาเดิมที่บรรทัด 166 และ 186 ของ `itam-meter-keyboard.tsx` ซึ่งเป็น state update ใน existing effects และอยู่นอก patch นี้ จึงไม่ได้แก้ปนกับ requirement นี้

## ไฟล์ที่เปลี่ยน

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `src/components/itam/itam-meter-keyboard.tsx` | เพิ่ม latest-result primary panel, `meterMode`, timestamp formatting และอัปเดต latest/history หลัง save สำเร็จ |
| `tests/meter-lifecycle-active-boundary.test.ts` | เพิ่ม source-boundary assertions สำหรับข้อมูลที่ต้องแสดง, primary placement และ failure guard |
| `docs/evidence/ITAM04-METER-LATEST-RESULT-UI-2026-08-22.md` | เอกสาร handoff และ acceptance evidence |

## Governance และ deployment gate

งานนี้เป็น **source-only UI change** เท่านั้น ไม่ได้แก้ schema, migration, Prisma database operation, seed, ITAM-DB data หรือ API persistence และไม่เพิ่ม `SYNC_RUN` งานยังต้องผ่าน review ของ ITAM-04/ผู้ดูแล lane, CI ที่เกี่ยวข้อง และการตรวจบน staging ก่อน merge

**ห้าม merge และ deploy จากงานนี้โดยอัตโนมัติ** การ deploy ให้ผู้มีสิทธิ์ Vercel ตาม release process เป็นผู้ดำเนินการ หลัง review exact head และยืนยัน staging evidence แล้ว หากสิทธิ์ Vercel ของ ITAM-04 ไม่เพียงพอ ให้ **ITAM-01 — Dev-1 / Repair** เป็นผู้ประสานและดำเนินการ deploy ตาม ownership ที่แจ้งไว้ก่อนหน้า

Rollback สามารถทำได้ด้วยการ revert commit ของ UI/test/docs ชุดนี้ โดยไม่มีฐานข้อมูลหรือ migration ที่ต้อง rollback

## References

1. [Issue #25 — Meter UI requirement: latest keyed reading visibility](https://github.com/nikorn2527-stack/ITAM-NextJS/issues/25)
2. [ItamMeterUnified active composition](https://github.com/nikorn2527-stack/ITAM-NextJS/blob/feature/meter-lifecycle-parity-fix/src/components/itam/itam-meter-unified.tsx)
3. [Meter keyboard entry component](https://github.com/nikorn2527-stack/ITAM-NextJS/blob/feature/meter-lifecycle-parity-fix/src/components/itam/itam-meter-keyboard.tsx)
4. [Meter/Lifecycle active runtime regression tests](https://github.com/nikorn2527-stack/ITAM-NextJS/blob/feature/meter-lifecycle-parity-fix/tests/meter-lifecycle-active-boundary.test.ts)
