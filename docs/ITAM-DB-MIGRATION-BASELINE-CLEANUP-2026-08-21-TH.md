# ITAM-DB Migration และ Baseline Cleanup Evidence

**วันที่ตรวจสอบ:** 21 สิงหาคม 2026  
**โครงการ:** ITAM-NextJS  
**Branch:** `feature/itam-next-direction-repair-workflow`  
**Revision:** [`0d60ea6e96897a6e8dd94909ee5701ae33b39e6c`](https://github.com/nikorn2527-stack/ITAM-NextJS/commit/0d60ea6e96897a6e8dd94909ee5701ae33b39e6c)  
**ฐานข้อมูลเป้าหมาย:** Supabase project `ITAM-DB` (`qbyuzygktsidpsmnwrrw`)

## สรุปผล

การแก้ baseline TypeScript และ schema compatibility ถูกแยกเป็น commit เฉพาะบน feature branch และถูก push ขึ้น GitHub แล้ว โดยไม่แก้ไฟล์ B4 frozen set และไม่ใช้ `prisma db:push`.

Additive migrations จำนวนสามรายการถูก apply กับ ITAM-DB สำเร็จผ่าน Supabase migration operation หลังตรวจ precondition จาก `information_schema` แล้ว ผลตรวจหลัง apply ยืนยันว่าฟิลด์ใหม่ทั้งห้ารายการมีอยู่จริงในฐานข้อมูล ได้แก่ `WorkOrder.legacy_job_no`, `WorkOrder.system_job_no`, `User.remark`, `DeviceTransfer.fromDepartmentCode` และ `DeviceTransfer.toDepartmentCode`.

> การ apply สำเร็จของ Supabase migration operation เป็นหลักฐานว่า DDL ถูก execute กับ ITAM-DB แล้ว แต่ยังไม่ใช่หลักฐานว่า Vercel Production runtime ได้ deploy revision นี้ หรือว่า owner login บน Production ผ่านแล้ว ดังนั้น release gates ยังคงเดิม: G2/G3/Production ยังไม่ถูกเปิดโดยอัตโนมัติ

## ขอบเขตการแก้ไขใน revision `0d60ea6`

| ประเด็น | การเปลี่ยนแปลง | เหตุผลเชิงข้อมูล |
|---|---|---|
| User metadata | เพิ่ม `User.remark` แบบ nullable พร้อม migration | รองรับข้อมูลหมายเหตุจาก legacy user importer และทำให้ auth permission row type สอดคล้องกับ schema |
| Device transfer | เพิ่ม `fromDepartmentCode` และ `toDepartmentCode` | รักษารหัสหน่วยงานต้นทาง/ปลายทางจาก legacy contract ไม่บังคับให้สูญหายหรือยัดรวมในข้อความ |
| Importer | เปลี่ยน importer ให้เขียนชื่อ Prisma fields แบบ canonical และคง legacy aliases ใน response/consumer boundary | แยก persistence contract ออกจาก compatibility contract |
| Purchase order | เปลี่ยน lookup จาก `findUnique({ poNumber })` ที่ไม่ใช่ unique key เป็น `findFirst({ where: { poNumber } })` | ปิด TypeScript error โดยไม่สมมติว่า `poNumber` เป็น unique และไม่ทำให้ importer ล้มจาก schema mismatch |
| Guest validation | แปลง `null` เป็น `undefined` ใน optional result field | ให้ตรงกับ nullability contract โดยไม่เปลี่ยนผลการ validate |

## Migration sequence และผลการทำงาน

การตรวจ preflight ด้วย `information_schema.columns` พบว่า ITAM-DB ยังไม่มีฟิลด์ใหม่ของ revision นี้ และ migration state ก่อนเริ่มแสดงรายการว่าง จึงใช้ลำดับ additive migration ดังนี้.

| ลำดับ | Migration | DDL หลัก | ผลลัพธ์ |
|---:|---|---|---|
| 1 | `20260821000001_add_work_order_dual_job_numbers` | เพิ่ม `legacy_job_no`, `system_job_no`, unique index ของ system number และ index ของ legacy number | สำเร็จ (`success: true`) |
| 2 | `20260821000002_add_user_remark` | เพิ่ม `User.remark TEXT` แบบ nullable | สำเร็จ (`success: true`) |
| 3 | `20260821000003_add_device_transfer_department_codes` | เพิ่ม `DeviceTransfer.fromDepartmentCode` และ `toDepartmentCode` | สำเร็จ (`success: true`) |

หลัง apply ตรวจ migration history ของ ITAM-DB อีกครั้ง พบรายการที่ถูกบันทึกครบสามรายการ ได้แก่ `add_work_order_dual_job_numbers` version `20260820231507`, `add_user_remark` version `20260820231544` และ `add_device_transfer_department_codes` version `20260820231606`. ชื่อ version ที่ระบบบันทึกเป็น execution timestamp จึงต้องอ่านคู่กับ source migration filename ใน repository เพื่อการ traceability ที่สมบูรณ์.

Migrations ถูกเขียนเป็น `ADD COLUMN IF NOT EXISTS` และ index ใช้ `CREATE ... IF NOT EXISTS` ในรายการที่เกี่ยวข้อง จึงมีลักษณะ additive และลดความเสี่ยงจากการ rerun ระหว่าง recovery อย่างไรก็ตาม การ rerun ใน production ต้องทำผ่าน migration control ที่ได้รับอนุมัติ ไม่ควรใช้ `db:push` หรือแก้ migration history ด้วยมือ.

## Verification evidence

ผลตรวจหลัง apply ผ่าน query แบบ read-only ที่เลือกเฉพาะชื่อ table/column และจำกัดผลลัพธ์ไม่เกิน 10 รายการ ได้ผลครบห้ารายการดังนี้.

| Table | Column ที่ยืนยันแล้ว |
|---|---|
| `DeviceTransfer` | `fromDepartmentCode`, `toDepartmentCode` |
| `User` | `remark` |
| `WorkOrder` | `legacy_job_no`, `system_job_no` |

หลักฐาน raw result ถูกเก็บใน sandbox audit artifact ที่สร้างจากการตรวจครั้งนี้ ส่วน source of truth สำหรับ implementation คือไฟล์ migration และ schema ใน GitHub revision เดียวกัน.

## Test และ TypeScript scope

Targeted TypeScript check ของไฟล์ที่แก้ใน revision นี้ผ่านแล้ว และ Prisma client ถูก generate จาก schema ล่าสุดก่อนการตรวจ. ชุด unit tests ของ repair/stock contract เดิมยังคงผ่าน 21/21 ตาม evidence ก่อนหน้า.

Full-repository TypeScript output ยังไม่ควรใช้เป็น release gate ในรอบนี้ เนื่องจาก repository มีสำเนา `workflow-review/**` และ audit artifacts ที่ถูกดึงเข้า glob ของ TypeScript รวมถึงโค้ด legacy/branch snapshots ซึ่งทำให้จำนวน error รวมสูงและซ้ำข้ามสำเนา. ข้อสรุปที่ถูกต้องคือ **changed-scope check ผ่าน** ส่วน full-repo cleanup เป็นงานแยกที่ต้องกำหนดขอบเขตและไม่ควรแก้ด้วยการลบหลักฐาน review แบบเงียบ ๆ.

## Governance และความเสี่ยงที่ยังคงอยู่

Dev ยังคงอยู่สถานะ STOP/STANDBY สำหรับ production code. Revision นี้อยู่บน feature branch และยังไม่ merge เข้า `main`. Audit ต้องตรวจ code diff, migration SQL, targeted test evidence และผล schema verification ก่อนออก technical verdict. Release Owner เป็นผู้ตัดสินใจเรื่อง environment, Vercel deployment, risk และ release gate.

การ apply schema สำเร็จ **ไม่เท่ากับ** การอนุมัติ G2, G3 หรือ Production. ยังต้องตรวจอย่างน้อย owner Production login, runtime compatibility ของ deployment ที่ใช้ revision นี้, และการไม่เกิด data loss ใน importer/legacy compatibility path ก่อนขอ release decision.

## ไฟล์อ้างอิงใน repository

- [`prisma/schema.prisma`](../prisma/schema.prisma)
- [`20260821000001_add_work_order_dual_job_numbers/migration.sql`](../prisma/migrations/20260821000001_add_work_order_dual_job_numbers/migration.sql)
- [`20260821000002_add_user_remark/migration.sql`](../prisma/migrations/20260821000002_add_user_remark/migration.sql)
- [`20260821000003_add_device_transfer_department_codes/migration.sql`](../prisma/migrations/20260821000003_add_device_transfer_department_codes/migration.sql)
- [`src/app/api/import/route.ts`](../src/app/api/import/route.ts)
- [`src/app/api/devices/[id]/transfer/route.ts`](../src/app/api/devices/%5Bid%5D/transfer/route.ts)
- [`src/lib/guest-validation.ts`](../src/lib/guest-validation.ts)

## References

[1]: https://github.com/nikorn2527-stack/ITAM-NextJS/commit/0d60ea6e96897a6e8dd94909ee5701ae33b39e6c "ITAM-NextJS baseline cleanup and transfer compatibility commit"
[2]: https://www.prisma.io/docs/orm/prisma-migrate/workflows/production-troubleshooting "Prisma Migrate production workflow and troubleshooting"
