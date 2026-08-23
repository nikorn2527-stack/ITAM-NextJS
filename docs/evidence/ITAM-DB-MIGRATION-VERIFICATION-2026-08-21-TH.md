# ITAM-DB Migration Verification — Redacted Evidence

**วันที่:** 21 สิงหาคม 2026  
**Project ID:** `qbyuzygktsidpsmnwrrw`  
**Revision ที่มี migration source:** `0d60ea6e96897a6e8dd94909ee5701ae33b39e6c`

เอกสารนี้เก็บเฉพาะผลตรวจที่ไม่เป็นความลับสำหรับ Audit และ Release Owner โดยไม่เก็บ `DATABASE_URL`, token, password หรือ connection detail ใด ๆ.

## Preflight

ผล `list_migrations` ก่อน apply: `[]`.

ผลอ่าน `information_schema.columns` ก่อน apply สำหรับตาราง `User`, `DeviceTransfer` และ `WorkOrder` ยืนยันว่าไม่มี columns ใหม่ที่ migration ชุดนี้ต้องเพิ่ม.

## Apply result

| Migration | Operation result |
|---|---|
| `20260821000001_add_work_order_dual_job_numbers` | `success: true` |
| `20260821000002_add_user_remark` | `success: true` |
| `20260821000003_add_device_transfer_department_codes` | `success: true` |

Post-apply migration history จาก ITAM-DB มีรายการครบสามรายการ: `add_work_order_dual_job_numbers` version `20260820231507`, `add_user_remark` version `20260820231544` และ `add_device_transfer_department_codes` version `20260820231606`.

## Post-apply schema verification

Read-only query หลัง apply คืนค่าครบห้ารายการ:

| Table | Column |
|---|---|
| `DeviceTransfer` | `fromDepartmentCode` |
| `DeviceTransfer` | `toDepartmentCode` |
| `User` | `remark` |
| `WorkOrder` | `legacy_job_no` |
| `WorkOrder` | `system_job_no` |

## Code and regression gate

ผลตรวจที่ผูกกับ revision เดียวกัน:

| Gate | Result |
|---|---|
| `git diff --check` | ผ่าน |
| Repair/stock contract tests | 6 test files, 21/21 tests ผ่าน |
| B4 frozen files diff against `ee75164` | ว่าง, 0-diff |
| Production deploy / G2 / G3 decision | ยังไม่ได้อนุมัติจาก evidence ชุดนี้ |

## Audit note

ผลชุดนี้ยืนยันเฉพาะ schema migration และ targeted regression scope. ต้องตรวจ runtime deployment ของ revision นี้แยกต่างหาก และยังคงใช้ governance เดิม: Dev ไม่ merge/deploy production เอง, Audit เป็นผู้ตัดสิน technical gate และ Release Owner เป็นผู้ตัดสิน environment/risk/release.
