# ITAM-04 — Master Item Legacy Parity Handoff

วันที่จัดทำ: 2026-08-22  
ผู้จัดทำ: **ITAM-04 — Dev-4 / Meter**  
สถานะ: **Source change พร้อมส่ง ITAM-01 review/merge; ยังไม่มีการเขียน ITAM-DB และยังไม่มีการ merge/deploy โดย ITAM-04**

## 1. เหตุผลของการเปลี่ยนแนวทาง

Master Item ที่แสดงในหน้าปัจจุบันไม่ตรงกับหน้าจอและ contract ของแอปเดิม จึงยกเลิกการยึด proposal แบบ reduced table เป็นหลักในรอบนี้ และใช้ Apps Script legacy เป็น source reference ก่อน การปรับรอบนี้มุ่งให้หน้า NextJS กลับมาใกล้กับ `Master_Data` ของแอปเดิม ไม่ใช่การออกแบบ master ใหม่หรือการ rewrite ข้อมูลเดิม

> ข้อกำหนดรอบนี้คือ “legacy first”: แสดงและเรียกชื่อฟิลด์ตามแอปเดิมก่อน แล้วจึงค่อยเสนอ schema improvement แยกในภายหลังเมื่อมี approval เฉพาะ

## 2. โครงสร้างที่ยืนยันจากแอปเดิม

ใน `Code.gs` แอปเดิมประกาศ default sheet header ของ `Master_Items` เป็น `Category_Key`, `Item_Value`, `Description`, `Display_Order`, `Active` ส่วน parser ที่อ่านข้อมูลจริงรองรับ `ItemID`, `CategoryKey`, `Value`, `GroupName`, `AllowedSites`, `Active`, `DepartmentCode`, `ParentRef`, `DisplayLabel` และ `SiteCode` โดยข้ามรายการ inactive ตามค่า `Active` และกำหนด `AllowedSites` เป็น `ALL` เมื่อว่าง

หน้า legacy แสดงตาราง `Master_Data` ด้วยคอลัมน์ต่อไปนี้:

| ลำดับ | คอลัมน์บนหน้า legacy | ความหมาย |
|---:|---|---|
| 1 | หมวดหมู่ | `CategoryKey` หลัง canonical mapping |
| 2 | ค่าข้อมูล | `Value` |
| 3 | ข้อมูลเพิ่มเติม | ค่าเสริมตามหมวด เช่น `GroupName`, `ParentRef`, `DisplayLabel` หรือ `SiteCode` |
| 4 | Dept Code | `DepartmentCode` |
| 5 | Allowed Sites | `AllowedSites`; ค่าเริ่มต้นของ legacy คือ `ALL` |
| 6 | สถานะ | `Active` / `Inactive` |
| 7 | จัดการ | แก้ไข, ปิดใช้งาน หรือ ลบ |

ตัวกรองของหน้าเดิมประกอบด้วยหมวดหมู่, สถานะ `Active เท่านั้น` / `ทั้งหมด` / `Inactive เท่านั้น` และช่องค้นหาหมวดหมู่/ค่า/คำอธิบาย นอกจากนี้ยังมีปุ่ม `Model`, `Dept` และ `Labels` สำหรับ sync เฉพาะกิจของ legacy

## 3. Source changes ใน branch นี้

มีการแก้เฉพาะ dedicated branch `feature/master-item-legacy-parity` ซึ่งแยกจาก worktree หลักและใช้ base ที่ PR #52 merge แล้ว

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `src/components/itam/itam-settings.tsx` | เปลี่ยน Master tab ให้โหลดรายการชุดเดียวแล้วกรองแบบ legacy, เพิ่ม filter หมวด/สถานะ/ค้นหา, count, หัวตาราง legacy และ dialog ฟิลด์ `ค่าข้อมูล`, `ItemID / รหัส`, `ParentRef / GroupName`, `DisplayLabel`, `SiteCode / Allowed Sites`, `Active` |
| `src/components/itam/types.ts` | ขยาย category vocabulary ให้ครอบคลุม Site, Building, Floor, Department, DepartmentCode, DeviceType/Type, Brand, Model, Status, Location, Contract, Vendor, DeviceGroup และ CostCenter พร้อม optional legacy fields |
| `src/app/api/itam/master-items/[id]/route.ts` | ให้ PUT รองรับทั้ง alias เดิม `value` และ `label` รวมถึง category, code, parentRef, displayLabel, siteCode และ active โดยใช้เฉพาะคอลัมน์ที่มีอยู่ใน Prisma ปัจจุบัน |
| `tests/master-item-legacy-parity.test.ts` | เพิ่ม source-boundary regression สำหรับ header/field/category/filter contract และยืนยันว่าไม่มี migration หรือ DB access ใน UI test |

## 4. ข้อจำกัดที่ต้องให้ ITAM-01 รับทราบ

Prisma `MasterItem` ปัจจุบันยังมีเพียง `category`, `code`, `label`, `parentRef`, `displayLabel`, `siteCode`, `active` และ timestamps จึงยังไม่มีคอลัมน์จริงสำหรับ `ItemID`, `GroupName`, `AllowedSites` และ `DepartmentCode`

ดังนั้น source รอบนี้ทำได้เพียงรักษาชื่อและตำแหน่งของ legacy fields ใน UI พร้อม fallback ที่ไม่ทำลายข้อมูล เช่น ใช้ `parentRef` เป็นข้อมูลเพิ่มเติมของ Model, ใช้ `displayLabel` กับ Status/DeviceGroup, ใช้ `siteCode` กับ Site และแสดง `ALL` เป็นค่า compatibility เมื่อไม่มีข้อมูล scope ใน schema ปัจจุบัน ไม่ควรตีความว่าเป็นการกู้คืน legacy columns ครบถ้วน หรือเป็นคำสั่งให้เพิ่มคอลัมน์/ทำ migration

การเปลี่ยนความหมายของ `siteCode` ให้เป็น `AllowedSites` หรือการเก็บหลายค่าในช่องเดียวโดยไม่ผ่าน schema decision ถูกงดไว้ เพื่อไม่ทำให้ Site scope และข้อมูลเดิมเพี้ยน

## 5. Test and review gate

ก่อนส่งให้ ITAM-01 ให้ตรวจอย่างน้อยดังนี้:

1. เปิดหน้า Settings → ข้อมูลมาตรฐาน แล้วตรวจว่าหัวคอลัมน์ตรงกับ legacy และตัวกรองทำงานโดยไม่ต้องยิง request ใหม่ทุกครั้ง
2. ตรวจ category alias `Type` และ `DeviceType` ไม่ทำให้รายการหายจากตัวกรอง
3. ตรวจ Active/Inactive ว่าค่าเริ่มต้นแสดง Active เท่านั้น และเปลี่ยนเป็นทั้งหมดได้
4. ตรวจแก้ไขรายการเดิมว่า `category`, `code`, `label`, `parentRef`, `displayLabel`, `siteCode` และ `active` ไม่ถูกล้างเมื่อไม่ได้แก้ค่า
5. ตรวจว่า `AllowedSites`, `DepartmentCode` และ `GroupName` ไม่ถูกอ้างว่า persist ได้ครบจนกว่าจะมี schema/DB approval
6. ตรวจว่าไม่มี database write, migration, DDL, merge หรือ deploy จาก ITAM-04 ในรอบนี้

ผลตรวจ source-only ที่ทำได้ใน sandbox คือ `git diff --check` ผ่าน ส่วนการติดตั้ง dependency เพื่อรัน ESLint/TypeScript ใน worktree ใหม่ล้มเหลวจาก `ENOSPC` ระหว่าง `npm ci`; ไฟล์ partial `node_modules` ถูกลบแล้ว และไม่กระทบ source/lockfile การตรวจเต็มจึงต้องให้ ITAM-01 รันใน environment ที่มี dependency พร้อม

## 6. Ownership และขั้นตอนส่งต่อ

ITAM-04 จะ push branch และเปิด PR แบบ stacked/target ไปยัง branch integration ที่ ITAM-01 ใช้ พร้อม exact commit และ handoff นี้ จากนั้น **ITAM-01 — Dev-1 / Repair เป็นผู้ review และ merge** ตามที่ผู้ใช้สั่ง หากผ่าน review แล้วให้ ITAM-01 เป็นผู้ประสาน deployment ต่อ เนื่องจากสิทธิ์ Vercel อาจจำกัด

การ merge ควรเกิดหลัง ITAM-01 ตรวจ source diff และรัน lint/typecheck/build ใน environment ของทีมแล้วเท่านั้น ส่วนการเขียน ITAM-DB, migration/DDL, data backfill และ deploy ยังไม่รวมอยู่ใน source patch นี้ และต้องผ่าน approval แยกตาม governance

## References

- Legacy source: `/home/ubuntu/analysis/IT-Asset-Management/Code.gs` — `DEFAULT_SHEET_HEADERS`, `readMasterItemsSheet`, `canonicalMasterCategory`, `getMasterData`
- Legacy UI: `/home/ubuntu/analysis/IT-Asset-Management/index.html` — Master_Data table/filter markup
- Legacy UI logic: `/home/ubuntu/analysis/IT-Asset-Management/javascript.html` — `renderMasterEntries`, smart form และ `saveMasterEntry`
- NextJS Prisma model: `prisma/schema.prisma` — current `MasterItem` fields
- NextJS active UI/API: `src/components/itam/itam-settings.tsx`, `src/app/api/itam/master-items/route.ts`, `src/app/api/itam/master-items/[id]/route.ts`
