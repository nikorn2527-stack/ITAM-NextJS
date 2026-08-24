# ITAM-04 — Meter Latest Result UI Handoff

**วันที่:** 2026-08-22  
**ทีม:** ITAM-04 — Dev-4 / Meter  
**Issue:** [ITAM-NextJS Issue #25](https://github.com/nikorn2527-stack/ITAM-NextJS/issues/25)  
**สถานะ:** Source change พร้อมให้ review; ยังไม่ merge และยังไม่ deploy

## สรุปการแก้ไข

Requirement นี้แก้ที่ `src/components/itam/itam-meter-keyboard.tsx` ซึ่งเป็น entry mode ของ `ItamMeterUnified` ที่ active page ใช้งานอยู่ โดยย้ายผลยืนยันรายการล่าสุดและตัวเลขคีย์ล่าสุดขึ้นไปไว้ใน **progress summary ด้านบน** ทำให้ผู้ปฏิบัติงานเห็นรอบจดมิเตอร์, จำนวนจดแล้ว, จำนวนคงเหลือ และผลการคีย์ล่าสุดในพื้นที่เดียวกัน

ส่วนผลล่าสุดแสดงแบบ compact ไม่ใช้การ์ดขนาดใหญ่ ได้แก่ **Asset Code**, ค่า **BW/Color**, **delta**, เวลา และสถานะ โดยใช้ `RESET` เมื่อค่าที่บันทึกต่ำกว่าค่าก่อนหน้า ตัวเลข `คีย์ล่าสุด` แสดงเป็นจำนวนสั้น ๆ จาก session history เท่านั้น ส่วนประวัติรายละเอียดไม่วางเป็นการ์ดท้ายหน้าอีกต่อไป และยังเข้าดูได้จากแท็บ **ประวัติมิเตอร์** ซึ่งเป็น secondary history view ที่เหมาะกับการตรวจย้อนหลัง

นอกจากนี้ root layout เปลี่ยนจากการกำหนดความสูงด้วย `100vh` เป็น `h-full min-h-0` เพื่อให้ Meter page เคารพความสูงของ parent app shell ที่มี Footer อยู่ด้านล่าง ลดความเสี่ยงที่เนื้อหาจะไหลทับหรือถูก Footer บัง และทำให้หน้า entry พอดีใน viewport เดียวตาม requirement

## เงื่อนไขสำเร็จและล้มเหลว

`saveReading()` ยังคงตรวจ `res.ok` และ throw error ก่อนสร้าง `savedReading`, `setLatest()` หรือ `setRecent()` ดังนั้นกรณีบันทึกไม่สำเร็จจะไม่แสดงผลสำเร็จใน top summary และไม่ถูกเพิ่มใน success history ส่วน toast error เดิมยังคงทำงานผ่าน `catch`

ผลล่าสุดใน top summary ถูกวางหลัง progress bar และก่อน main split จึงเห็นได้ทันทีโดยไม่แย่งพื้นที่จาก selected-device form มากเกินไป การคงรายละเอียดประวัติไว้ในแท็บแยกทำให้พื้นที่หลักใช้สำหรับรายการอุปกรณ์และการป้อนค่าได้เต็มที่

## Acceptance evidence

| กรณีตรวจ | ผลที่ต้องได้ | สถานะ source review |
|---|---|---|
| บันทึกสำเร็จ 1 รายการ | แสดง latest result ใน progress summary ด้านบนทันทีหลัง response สำเร็จ | ผ่านด้วย source-boundary test |
| จำนวนคีย์ล่าสุด | แสดงเป็นตัวเลขสั้น ๆ ใน summary ไม่ใช้การ์ดขนาดใหญ่ | ผ่านด้วย source-boundary test |
| BW/Color | แสดง BW, Color, delta และเวลาในบรรทัด latest แบบ compact | ผ่านด้วย source-boundary test |
| RESET | แสดง badge/text `RESET` ใน latest result | ผ่านด้วย source-boundary test |
| บันทึกไม่สำเร็จ | ไม่สร้าง latest-success และไม่เพิ่ม recent | ผ่านด้วย ordering assertion รอบ `res.ok` |
| One-page layout | ใช้ parent-constrained `h-full min-h-0`; ไม่ใช้ `100vh` ซ้อนใน app shell | ผ่านด้วย source-boundary test |
| History | ไม่ render recent card ท้ายหน้า; รายละเอียดประวัติอยู่แท็บ `ประวัติมิเตอร์` | ผ่านด้วย source-boundary test และ unified composition |
| Active unified page | entry mode เรียก `ItamMeterKeyboard`; history mode เรียก `ItamMeter` | ยืนยันจาก `itam-meter-unified.tsx` |

## การตรวจสอบที่รัน

คำสั่งที่ใช้เป็น source-only และไม่เรียกฐานข้อมูล:

```text
npx vitest run tests/meter-lifecycle-active-boundary.test.ts
npx eslint src/components/itam/itam-meter-keyboard.tsx tests/meter-lifecycle-active-boundary.test.ts --rule 'react-hooks/set-state-in-effect: off'
git diff --check
```

ผลตรวจคือ **8 tests ผ่าน**, ESLint ผ่านเมื่อปิดเฉพาะ rule baseline `react-hooks/set-state-in-effect` และ `git diff --check` ผ่าน การรัน ESLint แบบไม่ปิด rule ยังมีปัญหา baseline จาก state update ใน existing effects ซึ่งอยู่นอก scope ของ layout requirement นี้

## ไฟล์ที่เปลี่ยน

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `src/components/itam/itam-meter-keyboard.tsx` | ย้าย latest result ไป progress summary, แสดงตัวเลขคีย์ล่าสุดแบบย่อ, ถอด recent card ท้ายหน้า และใช้ `h-full min-h-0` |
| `tests/meter-lifecycle-active-boundary.test.ts` | เพิ่ม assertions สำหรับ top-summary placement, no bottom recent card, success-only state update และ one-page height contract |
| `docs/evidence/ITAM04-METER-LATEST-RESULT-UI-2026-08-22.md` | เอกสาร handoff และ acceptance evidence ฉบับปรับปรุง |

## Governance และ deployment gate

งานนี้เป็น **source-only UI change** เท่านั้น ไม่ได้แก้ schema, migration, Prisma database operation, seed, ITAM-DB data หรือ API persistence และไม่เพิ่ม `SYNC_RUN` งานยังต้องผ่าน review ของ ITAM-04/ผู้ดูแล lane, CI ที่เกี่ยวข้อง และการตรวจบน staging ก่อน merge

**ห้าม merge และ deploy จากงานนี้โดยอัตโนมัติ** การ deploy ให้ผู้มีสิทธิ์ Vercel ตาม release process เป็นผู้ดำเนินการ หลัง review exact head และยืนยัน staging evidence แล้ว หากสิทธิ์ Vercel ของ ITAM-04 ไม่เพียงพอ ให้ **ITAM-01 — Dev-1 / Repair** เป็นผู้ประสานและดำเนินการ deploy ตาม ownership ที่แจ้งไว้ก่อนหน้า

Rollback สามารถทำได้ด้วยการ revert commit ของ UI/test/docs ชุดนี้ โดยไม่มีฐานข้อมูลหรือ migration ที่ต้อง rollback

## References

1. [Issue #25 — Meter UI requirement](https://github.com/nikorn2527-stack/ITAM-NextJS/issues/25)
2. [ItamMeterUnified active composition](https://github.com/nikorn2527-stack/ITAM-NextJS/blob/feature/meter-lifecycle-parity-fix/src/components/itam/itam-meter-unified.tsx)
3. [Meter keyboard entry component](https://github.com/nikorn2527-stack/ITAM-NextJS/blob/feature/meter-lifecycle-parity-fix/src/components/itam/itam-meter-keyboard.tsx)
4. [Meter/Lifecycle active runtime regression tests](https://github.com/nikorn2527-stack/ITAM-NextJS/blob/feature/meter-lifecycle-parity-fix/tests/meter-lifecycle-active-boundary.test.ts)
