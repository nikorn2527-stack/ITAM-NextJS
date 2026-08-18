# IT Asset Management System

ระบบจัดการทรัพย์สินอุปกรณ์ IT สำหรับองค์กร สร้างบน **Google Apps Script** + **Google Sheets** รองรับหลาย Site การตั้งค่าสิทธิ์รายผู้ใช้ และการวิเคราะห์การใช้กระดาษเชิงลึก

---

## ✨ ฟีเจอร์หลัก (7 หน้าหลัก)

### 1. Dashboard
- สรุปจำนวนอุปกรณ์ทั้งหมด / ติดตั้งแล้ว / ไม่ใช้งาน
- แสดงจำนวนแผ่นกระดาษเดือนล่าสุด พร้อม % เปลี่ยนแปลง MoM
- Breakdown ตามประเภท / สถานะ / อาคาร (Top 10) — คลิกแถวเพื่อเจาะดูรายการได้ทันที
- กราฟการใช้กระดาษแยกหน่วยงาน อาคาร/ชั้น และแนวโน้มรายเดือน
- Smart Insights สรุปจุดผิดปกติอัตโนมัติ

### 2. จัดการอุปกรณ์ (Device Management)
- ค้นหาและกรองข้าม 6 มิติ (Asset No., Serial, Brand, Model, ชั้น, แผนก, สถานะ)
- เพิ่ม / แก้ไขอุปกรณ์ พร้อม Cascading Dropdown ตำแหน่ง (อาคาร → ชั้น → แผนก → สถานที่)
- รองรับ Barcode / QR Scanner กรอก Serial และ MAC Address
- Auto-fill ยี่ห้อ/ประเภท จาก Model ที่บันทึกไว้ก่อนหน้า
- บันทึกมิเตอร์ตั้งต้นพร้อมกันทันทีเมื่อเพิ่มเครื่องพิมพ์
- Asset No. (รหัสรวมทั้งระบบ) และ AssetSiteCode (ทะเบียน running number แยกตาม Site)
- Bulk Edit เลือกหลายรายการแก้ไขพร้อมกัน
- Export: CSV / Excel / PDF / Print
- Import จากไฟล์ Excel พร้อมนำเข้าประวัติมิเตอร์ย้อนหลัง (Sheet ต่อ 1 เดือน)
- พิมพ์สติกเกอร์ QR Code ขนาด 75.2 × 36 mm ต่ออุปกรณ์

### 3. ย้ายตำแหน่ง (Location Transfer)
- ค้นหาด้วย Asset No. หรือ Serial No.
- รองรับย้ายข้าม Site พร้อมออก AssetSiteCode ใหม่อัตโนมัติ (หรือนำเลขเดิมกลับมาใช้ถ้าเคยอยู่ Site นั้นมาก่อน)
- บังคับจดมิเตอร์ก่อนย้าย (สำหรับอุปกรณ์ที่ตั้งค่าไว้) หรือระบุเหตุผลที่จดไม่ได้
- บันทึกประวัติ Location_History ทุกครั้ง

### 4. จดมิเตอร์ (Meter Reading)
- กล่องค้นหาด่วน: พิมพ์ Serial 4–5 ตัวท้าย / Asset No. / รุ่น / แผนก แล้วกด Enter
- กด ↑ ↓ เลือกเครื่อง กด Enter กรอกเลข Enter บันทึก ไม่ต้องใช้เมาส์
- Log รายการที่คีย์ล่าสุดแสดงด้านบนตาราง
- Progress Bar: คีย์แล้ว X / ทั้งหมด Y (เหลือ Z เครื่อง)
- รองรับมิเตอร์แบบรวม (TOTAL) และแยกขาวดำ/สี (BW_COLOR)
- Export ใบจดมิเตอร์เฉพาะเครื่องที่ยังไม่ได้จด: Excel / Print

### 5. วิเคราะห์การใช้กระดาษ (Paper Analytics)
- กรอง: ช่วงเดือน / Site / อาคาร / รหัสแผนก พร้อมปุ่มช่วงด่วน 1 / 3 / 6 / 12 เดือน
- KPI Cards: แผ่นรวม / เดือนล่าสุด / เปลี่ยนแปลง MoM / เฉลี่ยต่อเดือน / Top แผนก / Top เครื่อง
- **ภาพรวม:** กราฟแท่งรายเดือน + Proportional Bar ตามรหัสแผนก + Smart Insights
- **จัดอันดับ:** 4 Tab — รหัสแผนก / อาคาร-ชั้น / เครื่องพิมพ์ / เปรียบเทียบ 3 เดือน (A vs B vs C)
- **รายละเอียด:** ตารางทุกรายการ ค้นหา / กรองเพิ่ม / Pagination
- คลิก Insight หรือแถวใดก็ได้เพื่อ Drill-down ดูต้นทางทันที
- Export: CSV / Excel / PDF / Print + Custom Export (เลือกคอลัมน์เอง)

### 6. Master Data
- เพิ่ม / แก้ไข / ปิดใช้งาน / ลบ ตัวเลือก Dropdown ทั้งระบบโดยตรง
- กำหนด `Site_Code` ต่อ Site เพื่อสร้าง AssetSiteCode อัตโนมัติ (เช่น `UDH-00001`)
- กำหนด `Allowed_Sites` ต่อรายการ เพื่อซ่อน/แสดง Dropdown ตามสิทธิ์ผู้ใช้
- กำหนด `Active` เพื่อซ่อนรายการที่เลิกใช้โดยไม่ต้องลบออก
- ปุ่ม **Sync หลังแก้ All_Devices** สำหรับเติมค่าขาดใน Master_Data จากอุปกรณ์ที่มีอยู่

### 7. ตั้งค่า (Settings)
- ชื่อแอป / บังคับ Login / เปิดใช้ Password Login
- แจ้งเตือนผ่าน Email / Telegram Bot / LINE Notify / LINE Official Account
- กำหนดงานที่แจ้งเตือน: เพิ่มอุปกรณ์ / แก้ไข / ย้าย / เปลี่ยนสถานะ / จดมิเตอร์
- เทมเพลตสติกเกอร์: ชื่อบริษัท / ข้อความเตือน / Hotline / LINE OA QR / โลโก้
- คอลัมน์ Export กระดาษแบบ Custom
- จัดการสิทธิ์ผู้ใช้ (User Permissions) รองรับทุก Role
- ปุ่ม Sync ข้อมูลหลังแก้ชีตโดยตรง

---

## 🔐 ระบบสิทธิ์และความปลอดภัย

### Role ที่รองรับ

| Role | ชื่อแสดง | สิทธิ์หลัก |
|------|----------|------------|
| `superadmin` | ผู้ดูแลสูงสุด | ทุกอย่าง รวมถึงจัดการ Admin คนอื่น |
| `admin` | ผู้ดูแลระบบ | ทุกอย่าง ยกเว้นจัดการ Super Admin |
| `editor` | เจ้าหน้าที่จัดการข้อมูล | ดู เพิ่ม แก้ไข ย้าย เปลี่ยนสถานะ จดมิเตอร์ Export |
| `meter` | ผู้จดมิเตอร์ | ดูอุปกรณ์ จดมิเตอร์ Print |
| `viewer` | ผู้ดูรายงาน | ดูข้อมูลและ Dashboard เท่านั้น |

### วิธี Login
- **Google Session** — Login ผ่าน Google Account (ถ้า deploy แบบ USER_DEPLOYING)
- **Username / Password** — Login ผ่านหน้าฟอร์ม ข้อมูลเก็บใน `User_Permissions` ด้วย SHA-256 Hash

### Site-based Row-level Security
กำหนด `Allowed_Sites` ต่อผู้ใช้เพื่อจำกัดให้เห็นเฉพาะข้อมูลสาขาของตัวเอง ครอบคลุม:
- รายการอุปกรณ์ (All_Devices)
- ประวัติการย้าย (Location_History)
- ประวัติมิเตอร์ (Meter_Readings)
- ตัวเลือก Dropdown ใน Master_Data
- ผลลัพธ์ Paper Analytics และ Dashboard

---

## 📊 โครงสร้าง Google Sheet (6 ชีต)

### 1. All_Devices — ข้อมูลอุปกรณ์หลัก

| คอลัมน์ | ชนิด | คำอธิบาย |
|---------|------|---------|
| AssetNo | Text | รหัสทรัพย์สินรวม (Auto-generate, ไม่ซ้ำทั้งระบบ) |
| AssetSiteCode | Text | ทะเบียนเฉพาะ Site เช่น `UDH-00001` |
| Type | Text | ประเภทอุปกรณ์ เช่น `PRINTER LASER` |
| Brand | Text | ยี่ห้อ |
| Model | Text | รุ่น |
| Serial | Text | Serial Number |
| Building | Text | อาคาร |
| Floor | Text | ชั้น |
| Department | Text | แผนก/หน่วยงาน |
| DepartmentCode | Text | รหัสแผนก |
| Location | Text | จุดติดตั้ง/ห้อง |
| Status | Text | สถานะ เช่น `Active`, `In Repair`, `Retired` |
| Site | Text | Site/สาขาที่อุปกรณ์อยู่ |
| ContractNo | Text | เลขที่สัญญา |
| IP | Text | IP Address |
| MAC | Text | MAC Address |
| RemoteID | Text | AnyDesk / TeamViewer ID |
| Vendor | Text | ผู้จำหน่าย |
| InstallDate | Date | วันที่ติดตั้ง |
| UninstallDate | Date | วันที่ถอนการติดตั้ง |
| WarrantyEnd | Date | วันหมดประกัน |
| DeviceGroup | Text | กลุ่มอุปกรณ์ |
| CostCenter | Text | ศูนย์ต้นทุน |
| MeterRequired | Boolean | TRUE = แสดงในหน้าจดมิเตอร์ |
| MeterMode | Text | `TOTAL` = มิเตอร์รวม, `BW_COLOR` = แยกขาวดำ/สี |
| UpdatedAt | DateTime | วันเวลาที่อัปเดตล่าสุด |
| UpdatedBy | Text | อีเมล/ชื่อผู้อัปเดต |
| Remark | Text | หมายเหตุ |

### 2. Location_History — ประวัติการย้าย/เปลี่ยนสถานะ

| คอลัมน์ | คำอธิบาย |
|---------|---------|
| Log_ID | รหัสรายการ (เช่น `MV-20250601120000-00001`) |
| Asset_No | รหัสทรัพย์สิน |
| Move_Date | วันเวลาที่ย้าย |
| Action | ประเภท: `TRANSFER`, `TRANSFER_SITE`, `STATUS_CHANGE` ฯลฯ |
| From_Status / To_Status | สถานะก่อน/หลัง |
| From_Site / To_Site | Site ก่อน/หลัง |
| From_AssetSiteCode / To_AssetSiteCode | ทะเบียน Site ก่อน/หลัง |
| From_Building / To_Building | อาคารก่อน/หลัง |
| From_Floor / To_Floor | ชั้นก่อน/หลัง |
| From_Department / To_Department | แผนกก่อน/หลัง |
| From_Location / To_Location | จุดติดตั้งก่อน/หลัง |
| Meter_Reading_ID | อ้างอิง Reading_ID ที่จดพร้อมการย้าย |
| Moved_By | ผู้ทำรายการ |
| Remark | หมายเหตุ |

### 3. Meter_Readings — บันทึกการจดมิเตอร์

| คอลัมน์ | คำอธิบาย |
|---------|---------|
| Reading_ID | รหัสรายการ (เช่น `MR-20250601120000-00001`) |
| Asset_No | รหัสทรัพย์สิน |
| Reading_Date | วันเวลาที่จด |
| Reading_Month | รอบเดือน รูปแบบ `YYYY-MM` |
| Meter_BW | ค่ามิเตอร์รวม/ขาวดำ |
| Meter_Color | ค่ามิเตอร์สี |
| Pages_BW | จำนวนแผ่นรวม/ขาวดำในรอบนี้ |
| Pages_Color | จำนวนแผ่นสีในรอบนี้ |
| Prev_Meter_BW | มิเตอร์รอบก่อนหน้า (BW) |
| Prev_Meter_Color | มิเตอร์รอบก่อนหน้า (Color) |
| Reading_Type | `INITIAL` / `MONTHLY` / `RESET` / `CHECKOUT` / `FINAL` / `RETURN` |
| Event_Type | เหตุการณ์ที่ทริกเกอร์การจด เช่น `TRANSFER`, `ADD_DEVICE` |
| Event_ID | อ้างอิง Log_ID ของเหตุการณ์ |
| Location_At_Reading | ตำแหน่งรวมขณะจด |
| Site_At_Reading | Site ขณะจด |
| Building_At_Reading | อาคารขณะจด |
| Floor_At_Reading | ชั้นขณะจด |
| Department_At_Reading | แผนกขณะจด |
| DepartmentCode_At_Reading | รหัสแผนกขณะจด |
| Read_By | ผู้จด |
| Remark | หมายเหตุ |

### 4. Master_Data — ข้อมูลอ้างอิง

| คอลัมน์ | คำอธิบาย |
|---------|---------|
| Category | หมวดหมู่ เช่น `Site`, `Building`, `DeviceType`, `Status` |
| Value | ค่าข้อมูลที่แสดงใน Dropdown |
| Description | คำอธิบาย หรือ DepartmentCode ของแผนกนั้น |
| Site_Code | Prefix สำหรับสร้าง AssetSiteCode เช่น `UDH-00001` |
| Allowed_Sites | Site ที่มองเห็นรายการนี้ได้ เช่น `UDH,OPD` หรือ `ALL` |
| Active | `TRUE` = แสดง, `FALSE` = ซ่อน |

**Category ที่ระบบรู้จัก:**
`DeviceType` · `Brand` · `Model` · `Building` · `Floor` · `Department` · `DepartmentCode` · `Location` · `Status` · `Site` · `ContractNo` · `Vendor` · `DeviceGroup` · `CostCenter`

### 5. User_Permissions — สิทธิ์ผู้ใช้

| คอลัมน์ | คำอธิบาย |
|---------|---------|
| Email | Google Account Email |
| Role | `superadmin` / `admin` / `editor` / `meter` / `viewer` |
| Active | `TRUE` / `FALSE` |
| Name | ชื่อผู้ใช้ |
| Username | ชื่อ Login (Password Login) |
| PasswordHash | SHA-256 Hash ของรหัสผ่าน |
| PasswordSalt | Salt สำหรับ Hash |
| Allowed_Sites | Site ที่ผู้ใช้เข้าถึงได้ คั่นด้วย comma หรือ `ALL` |
| Remark | หมายเหตุ |
| UpdatedAt | วันเวลาที่แก้ไขล่าสุด |
| LastLoginAt | วันเวลา Login ล่าสุด |

### 6. App_Settings — การตั้งค่าระบบ

เก็บ Key-Value ของการตั้งค่าทั้งหมด มีคอลัมน์ `Key`, `Value`, `Description`, `UpdatedAt` จัดการผ่านหน้า **Settings** ของแอปเท่านั้น

---

## 🚀 การติดตั้ง

### ขั้นตอนที่ 1 — สร้าง Google Sheet
1. ไปที่ [sheets.google.com](https://sheets.google.com) แล้วสร้าง Spreadsheet ใหม่
2. ตั้งชื่อ Sheet ตามลำดับ: `All_Devices`, `Location_History`, `Meter_Readings`, `Master_Data`, `User_Permissions`, `App_Settings`
3. ระบบจะสร้าง Header และ Sheet ที่ยังไม่มีให้อัตโนมัติเมื่อใช้งานครั้งแรก

### ขั้นตอนที่ 2 — ตั้งค่า Apps Script
1. เปิด Spreadsheet → **Extensions > Apps Script**
2. วางโค้ดจากไฟล์ต่าง ๆ ให้ตรงชื่อ:
   - `Code.gs` → Script file หลัก
   - `index.html` → HTML entry point
   - `css.html` → Styles
   - `javascript.html` → Client-side logic
3. แก้ไข `SPREADSHEET_ID` ในบรรทัดแรกของ `Code.gs` ให้ตรงกับ ID ของ Spreadsheet

### ขั้นตอนที่ 3 — Deploy Web App
1. **Deploy > New deployment**
2. เลือก Type: **Web app**
3. ตั้งค่า:
   - Execute as: `User deploying the web app`
   - Who has access: `Anyone` (หรือตามนโยบายองค์กร)
4. คลิก **Deploy** แล้วบันทึก URL ที่ได้

### ขั้นตอนที่ 4 — กำหนด Master Data เบื้องต้น
เพิ่มข้อมูลใน `Master_Data` อย่างน้อย 1 รายการสำหรับ Category `Site` พร้อมกำหนด `Site_Code` เพื่อให้ระบบสร้าง AssetSiteCode ได้ เช่น:

| Category | Value | Site_Code |
|----------|-------|-----------|
| Site | โรงพยาบาลศูนย์อุดรธานี | UDH-00001 |

---

## ⚙️ การตั้งค่าเพิ่มเติม

### ตั้งค่าการแจ้งเตือน
ไปที่ **Settings > ตั้งค่าทั่วไป** กรอก Token ของช่องทางที่ต้องการ:
- **Telegram:** Bot Token + Chat ID
- **LINE Notify:** Token
- **LINE Official Account:** Channel Access Token + Recipient ID

### ตั้งค่าสติกเกอร์
ไปที่ **Settings > ตั้งค่าทั่วไป** ส่วน "เทมเพลตสติกเกอร์":
- ชื่อบริษัท / ชื่อหน่วยงาน
- ข้อความเตือนท้ายสติกเกอร์
- Hotline
- ลิงก์ / รูป LINE OA สำหรับ QR ช่องขวา
- โลโก้บริษัท (PNG พื้นหลังโปร่งใส แนะนำ)

### ตั้ง Site-specific LINE OA / Hotline
เพิ่มรายการใน `Master_Data` ด้วย Category พิเศษ:
- `SiteLineOA` — ลิงก์ LINE OA ของ Site นั้น (เช่น `https://lin.ee/xxxxxx`)
- `SiteHotline` — เบอร์โทรศัพท์ของ Site นั้น
- ทั้งคู่ต้องกำหนด `Site_Code` ให้ตรงกับ Site ที่ต้องการ

---

## 🔄 ประเภทมิเตอร์และ Reading Type

### MeterMode
| ค่า | ความหมาย |
|-----|---------|
| `TOTAL` | บันทึกมิเตอร์รวมช่องเดียว (ค่าเริ่มต้น) |
| `BW_COLOR` | บันทึกแยกขาวดำ + สี (เหมาะกับเครื่องที่แสดง Counter แยก) |

### Reading Type
| Type | เมื่อไหร่ |
|------|---------|
| `INITIAL` | บันทึกครั้งแรก ยังไม่มีประวัติก่อนหน้า (ไม่นับยอดใช้) |
| `MONTHLY` | จดมิเตอร์รายเดือนปกติ |
| `RESET` | เลขมิเตอร์ต่ำกว่ารอบก่อน (ตั้งฐานใหม่) |
| `CHECKOUT` | จดก่อนย้ายตำแหน่ง / ส่งซ่อม |
| `FINAL` | จดก่อนถอน / เลิกใช้งาน |
| `RETURN` | จดเมื่อนำเครื่องกลับมาติดตั้ง |

---

## 📝 คู่มือการใช้งานสั้น ๆ

### เพิ่มอุปกรณ์ใหม่
1. จัดการอุปกรณ์ → **+ เพิ่มอุปกรณ์**
2. เลือก Site ก่อน ระบบจะจอง AssetSiteCode อัตโนมัติ
3. กรอก Type → Brand/Model จะ Auto-fill ถ้าเคยบันทึกไว้
4. ถ้าเป็นเครื่องพิมพ์ → ติ๊ก "ต้องจดมิเตอร์" แล้วกรอกมิเตอร์ตั้งต้น
5. บันทึก

### จดมิเตอร์ประจำเดือน
1. จดมิเตอร์ → เลือกเดือน → โหลดรายการ
2. พิมพ์ Serial ตัวท้าย 4–5 ตัวในช่องค้นหาด่วน กด Enter
3. กรอกเลขมิเตอร์ กด Enter → ระบบขึ้นเครื่องถัดไปให้เอง
4. เมื่อครบ → บันทึกมิเตอร์

### ย้ายตำแหน่งอุปกรณ์
1. ย้ายตำแหน่ง → ค้นหา Asset No. หรือ Serial
2. กรอก Site / อาคาร / แผนกปลายทาง
3. จดมิเตอร์ก่อนย้าย (ถ้าบังคับ)
4. ยืนยันการย้าย

### วิเคราะห์การใช้กระดาษ
1. การใช้กระดาษ → เลือกช่วงเดือน และตัวกรองที่ต้องการ
2. กด **วิเคราะห์**
3. คลิก Insight / แถวในกราฟ / แถวในตาราง เพื่อ Drill-down

---

## 📄 License

สงวนลิขสิทธิ์เพื่อใช้งานภายในองค์กร · Power by PNG TEAM
