# 📦 IT Asset Management System — เอกสารประกอบฉบับสมบูรณ์

> **ระบบจัดการทรัพย์สินอุปกรณ์ IT** สำหรับองค์กร สร้างบน **Google Apps Script + Google Sheets**
> รองรับหลาย Site, การตั้งค่าสิทธิ์รายผู้ใช้, การวิเคราะห์การใช้กระดาษเชิงลึก, และ **ระบบสติกเกอร์แบบ Multi-template Library**

---

## 📑 สารบัญ

1. [ภาพรวมระบบ](#1-ภาพรวมระบบ)
2. [โครงสร้างไฟล์และโค้ด](#2-โครงสร้างไฟล์และโค้ด)
3. [ฐานข้อมูล (Google Sheets)](#3-ฐานข้อมูล-google-sheets)
4. [ระบบสิทธิ์และความปลอดภัย (RBAC)](#4-ระบบสิทธิ์และความปลอดภัย-rbac)
5. [ฟีเจอร์หลัก 7 หน้า](#5-ฟีเจอร์หลัก-7-หน้า)
6. [ระบบสติกเกอร์ (Sticker System) — แบบละเอียด](#6-ระบบสติกเกอร์-sticker-system--แบบละเอียด)
7. [การตั้งค่าแอป (App_Settings)](#7-การตั้งค่าแอป-app_settings)
8. [การแจ้งเตือน (Notifications)](#8-การแจ้งเตือน-notifications)
9. [Performance และ Cache](#9-performance-และ-cache)
10. [การติดตั้งและ Deploy](#10-การติดตั้งและ-deploy)
11. [API และฟังก์ชันทั้งหมด](#11-api-และฟังก์ชันทั้งหมด)
12. [การแก้ปัญหา (Troubleshooting)](#12-การแก้ปัญหา-troubleshooting)
13. [ความเสี่ยงและข้อจำกัด](#13-ความเสี่ยงและข้อจำกัด)

---

## 1. ภาพรวมระบบ

### ข้อมูลทั่วไป
| รายการ | รายละเอียด |
|--------|-----------|
| **ชื่อระบบ** | IT Asset Management System |
| **ประเภท** | Google Apps Script Web App |
| **ฐานข้อมูล** | Google Sheets (6 sheets + Audit_Log) |
| **ภาษา** | JavaScript (V8 runtime), HTML, CSS |
| **License** | สงวนลิขสิทธิ์เพื่อใช้งานภายในองค์กร |
| **พัฒนาโดย** | PNG TEAM |
| **Branch พัฒนา** | `feature/sticker-bulk-print-and-template-editor` |

### ความสามารถหลัก
- ✅ จัดการทรัพย์สิน IT (CRUD, Search, Filter, Import/Export)
- ✅ จดมิเตอร์รายเดือน (รองรับ TOTAL + BW_COLOR)
- ✅ ย้ายตำแหน่งข้าม Site + ประวัติการย้าย
- ✅ วิเคราะห์การใช้กระดาษ + Smart Insights
- ✅ ระบบสิทธิ์ 5 roles + Row-level Security ตาม Site
- ✅ **พิมพ์สติกเกอร์ทีละใบ + หลายใบพร้อมกัน (Bulk Print)**
- ✅ **Multi-template Library — สร้าง/ลบ/สลับ template ได้หลายชุด**
- ✅ **Drag-Move Sticker Editor — ปรับตำแหน่ง/ขนาด/ความเข้มจาง/สี/ความหนา**
- ✅ แจ้งเตือนผ่าน Email, Telegram, LINE Notify, LINE OA
- ✅ Audit Log บันทึกการกระทำสำคัญ

### สถิติโค้ด
| ไฟล์ | บรรทัด | จำนวนฟังก์ชัน |
|------|--------|---------------|
| Code.gs | 997 | 88 |
| Auth.gs | 449 | 35 |
| SettingsService.gs | 479 | 29 |
| MeterService.gs | 456 | 24 |
| DeviceService.gs | 314 | 14 |
| AnalyticsService.gs | 370 | 7 |
| TransferService.gs | 200 | 3 |
| ImportService.gs | 197 | 3 |
| javascript.html | 7,723 | 330 |
| index.html | 1,656 | — |
| css.html | 2,740 | — |
| **รวม** | **15,581** | **533** |

---

## 2. โครงสร้างไฟล์และโค้ด

### โครงสร้างโฟลเดอร์
```
IT-Asset-Management/
├── Code.gs                  # Main entry: config, router, utilities
├── Auth.gs                  # Authentication, permissions, user management
├── DeviceService.gs         # Device CRUD, search, import
├── MeterService.gs          # Meter reading operations
├── TransferService.gs       # Location transfer + lifecycle
├── AnalyticsService.gs      # Dashboard + paper analytics
├── SettingsService.gs       # App settings + notifications + sticker templates
├── ImportService.gs         # Excel import + reconciliation
├── appsscript.json          # Apps Script manifest
├── index.html               # HTML entry point (template)
├── css.html                 # All styles (2,740 lines)
├── javascript.html          # All client-side logic (7,723 lines)
├── README.md                # User documentation (Thai)
├── worklog.md               # Development worklog
└── modules/                 # ✅ DELETED — ย้าย 13 ฟังก์ชันเข้า Code.gs แล้ว
```

### การแยกไฟล์ตาม Domain (Backend)
แต่ละไฟล์ `.gs` แยกตามหน้าที่:
- **Code.gs** — Config, doGet, utilities, header mapping, asset code generation
- **Auth.gs** — Login, logout, permission checks, user CRUD, rate limiting
- **DeviceService.gs** — Device CRUD, search, bulk update, location history
- **MeterService.gs** — Meter reading, history, mode switch detection
- **TransferService.gs** — Transfer device, lifecycle changes
- **AnalyticsService.gs** — Dashboard stats, paper analytics, smart insights
- **SettingsService.gs** — App settings, notifications, **sticker template library**
- **ImportService.gs** — Excel import with meter history

### การรวมไฟล์ Frontend
ใช้รูปแบบ `<?!= include('filename') ?>` ของ HtmlService:
```html
<!-- index.html -->
<?!= include('css') ?>
<!-- HTML content -->
<?!= include('javascript') ?>
```

---

## 3. ฐานข้อมูล (Google Sheets)

### 6 Sheets หลัก

#### 3.1 `All_Devices` — ข้อมูลอุปกรณ์หลัก
| คอลัมน์ | ชนิด | คำอธิบาย |
|---------|------|---------|
| AssetNo | Text | รหัสทรัพย์สินรวม (Auto, ไม่ซ้ำทั้งระบบ) |
| AssetSiteCode | Text | ทะเบียนเฉพาะ Site เช่น `UDH-00001` |
| Type | Text | ประเภทอุปกรณ์ |
| Brand | Text | ยี่ห้อ |
| Model | Text | รุ่น |
| Serial | Text | Serial Number |
| Building | Text | อาคาร |
| Floor | Text | ชั้น |
| Department | Text | แผนก/หน่วยงาน |
| DepartmentCode | Text | รหัสแผนก |
| Location | Text | จุดติดตั้ง/ห้อง |
| Status | Text | Active, In Repair, Retired |
| Site | Text | Site/สาขา |
| ContractNo | Text | เลขที่สัญญา |
| IP | Text | IP Address |
| MAC | Text | MAC Address |
| RemoteID | Text | AnyDesk/TeamViewer ID |
| Vendor | Text | ผู้จำหน่าย |
| InstallDate | Date | วันที่ติดตั้ง |
| UninstallDate | Date | วันที่ถอนการติดตั้ง |
| WarrantyEnd | Date | วันหมดประกัน |
| DeviceGroup | Text | กลุ่มอุปกรณ์ |
| CostCenter | Text | ศูนย์ต้นทุน |
| MeterRequired | Boolean | TRUE = ต้องจดมิเตอร์ |
| MeterMode | Text | TOTAL หรือ BW_COLOR |
| UpdatedAt | DateTime | วันเวลาอัปเดตล่าสุด |
| UpdatedBy | Text | ผู้อัปเดต |
| Remark | Text | หมายเหตุ |

#### 3.2 `Location_History` — ประวัติการย้าย/เปลี่ยนสถานะ
| คอลัมน์ | คำอธิบาย |
|---------|---------|
| Log_ID | รหัสรายการ (เช่น `MV-20250601120000-00001`) |
| Asset_No | รหัสทรัพย์สิน |
| Move_Date | วันเวลาที่ย้าย |
| Action | TRANSFER, TRANSFER_SITE, STATUS_CHANGE |
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

#### 3.3 `Meter_Readings` — บันทึกการจดมิเตอร์
| คอลัมน์ | คำอธิบาย |
|---------|---------|
| Reading_ID | รหัสรายการ (เช่น `MR-20250601120000-00001`) |
| Asset_No | รหัสทรัพย์สิน |
| Reading_Date | วันเวลาที่จด |
| Reading_Month | รอบเดือน `YYYY-MM` |
| Meter_BW | ค่ามิเตอร์รวม/ขาวดำ |
| Meter_Color | ค่ามิเตอร์สี |
| Pages_BW | จำนวนแผ่นรวม/ขาวดำในรอบนี้ |
| Pages_Color | จำนวนแผ่นสีในรอบนี้ |
| Prev_Meter_BW | มิเตอร์รอบก่อนหน้า (BW) |
| Prev_Meter_Color | มิเตอร์รอบก่อนหน้า (Color) |
| Reading_Type | INITIAL / MONTHLY / RESET / CHECKOUT / FINAL / RETURN |
| Event_Type | เหตุการณ์ที่ทริกเกอร์ |
| Event_ID | อ้างอิง Log_ID |
| Location_At_Reading | ตำแหน่งรวมขณะจด |
| Site_At_Reading | Site ขณะจด |
| Building_At_Reading | อาคารขณะจด |
| Floor_At_Reading | ชั้นขณะจด |
| Department_At_Reading | แผนกขณะจด |
| DepartmentCode_At_Reading | รหัสแผนกขณะจด |
| Read_By | ผู้จด |
| Remark | หมายเหตุ |

#### 3.4 `Master_Data` — ข้อมูลอ้างอิง
| คอลัมน์ | คำอธิบาย |
|---------|---------|
| Category | Site, Building, DeviceType, Status, etc. |
| Value | ค่าที่แสดงใน Dropdown |
| Description | คำอธิบายหรือ DepartmentCode |
| Site_Code | Prefix สำหรับ AssetSiteCode |
| Allowed_Sites | Site ที่มองเห็นได้ (เช่น `UDH,OPD` หรือ `ALL`) |
| Active | TRUE/FALSE |

#### 3.5 `User_Permissions` — สิทธิ์ผู้ใช้
| คอลัมน์ | คำอธิบาย |
|---------|---------|
| Email | Google Account Email |
| Role | superadmin / admin / editor / meter / viewer |
| Active | TRUE/FALSE |
| Name | ชื่อผู้ใช้ |
| Username | ชื่อ Login (Password Login) |
| PasswordHash | SHA-256 Hash |
| PasswordSalt | Salt สำหรับ Hash |
| Allowed_Sites | Site ที่เข้าถึงได้ |
| Remark | หมายเหตุ |
| UpdatedAt | วันเวลาแก้ไขล่าสุด |
| LastLoginAt | วันเวลา Login ล่าสุด |

#### 3.6 `App_Settings` — การตั้งค่าระบบ
Key-Value store คอลัมน์: `Key`, `Value`, `Description`, `UpdatedAt`

#### 3.7 `Audit_Log` (Auto-created)
| คอลัมน์ | คำอธิบาย |
|---------|---------|
| Timestamp | วันเวลา |
| Action | ADD_DEVICE, TRANSFER, METER_READING, etc. |
| User | ผู้ทำรายการ |
| Details | JSON details |
| IP | (ว่าง — GAS ไม่สามารถดึงได้) |

---

## 4. ระบบสิทธิ์และความปลอดภัย (RBAC)

### 5 Roles
| Role | ชื่อแสดง | สิทธิ์หลัก |
|------|----------|-----------|
| `superadmin` | ผู้ดูแลสูงสุด | ทุกอย่าง + จัดการ Admin คนอื่น |
| `admin` | ผู้ดูแลระบบ | ทุกอย่าง ยกเว้นจัดการ Super Admin |
| `editor` | เจ้าหน้าที่จัดการข้อมูล | ดู/เพิ่ม/แก้ไข/ย้าย/จดมิเตอร์/Export |
| `meter` | ผู้จดมิเตอร์ | ดูอุปกรณ์ + จดมิเตอร์ + Print |
| `viewer` | ผู้ดูรายงาน | ดูข้อมูล + Dashboard + Print |

### Permissions (12 ตัว)
```
VIEW_DASHBOARD, VIEW_DEVICES, VIEW_ANALYTICS,
METER_WRITE, DEVICE_EDIT, DEVICE_DELETE,
DEVICE_TRANSFER, LIFECYCLE_EDIT, MASTER_DATA_EDIT,
EXPORT_PRINT, PRINT, ADMIN
```

### วิธี Login (2 ช่องทาง)
1. **Google Session** — Login ผ่าน Google Account (ถ้า deploy แบบ USER_DEPLOYING)
2. **Username/Password** — Login ผ่านฟอร์ม (SHA-256 + salt hash)

### ความปลอดภัย
- ✅ Password hashing: SHA-256 + salt (per-user salt)
- ✅ Rate limiting: 5 ครั้งผิด → lockout 5 นาที
- ✅ Auth token: UUID + CacheService (TTL 6 ชั่วโมง)
- ✅ Row-level security: `Allowed_Sites` จำกัดการเห็นข้อมูลตาม Site
- ✅ "Last admin" protection: กันปิด admin คนสุดท้าย
- ✅ Audit Log: บันทึกทุกการกระทำสำคัญ

### Site-based Row-level Security
ครอบคลุม:
- รายการอุปกรณ์ (All_Devices)
- ประวัติการย้าย (Location_History)
- ประวัติมิเตอร์ (Meter_Readings)
- ตัวเลือก Dropdown (Master_Data)
- ผลลัพธ์ Paper Analytics และ Dashboard

---

## 5. ฟีเจอร์หลัก 7 หน้า

### 5.1 Dashboard
- สรุปจำนวนอุปกรณ์ทั้งหมด / ติดตั้งแล้ว / ไม่ใช้งาน
- จำนวนแผ่นกระดาษเดือนล่าสุด + % เปลี่ยนแปลง MoM
- Breakdown ตามประเภท / สถานะ / อาคาร (Top 10) — คลิกเจาะดูรายการ
- กราฟการใช้กระดาษแยกหน่วยงาน, อาคาร/ชั้น, แนวโน้มรายเดือน
- Smart Insights สรุปจุดผิดปกติอัตโนมัติ

### 5.2 จัดการอุปกรณ์ (Device Management)
- ค้นหาและกรองข้าม 6 มิติ
- Cascading Dropdown ตำแหน่ง (อาคาร → ชั้น → แผนก → สถานที่)
- Barcode/QR Scanner กรอก Serial และ MAC Address
- Auto-fill ยี่ห้อ/ประเภท จาก Model ที่บันทึกไว้
- บันทึกมิเตอร์ตั้งต้นพร้อมกันเมื่อเพิ่มเครื่องพิมพ์
- Bulk Edit เลือกหลายรายการแก้ไขพร้อมกัน
- Export: CSV / Excel / PDF / Print
- Import จากไฟล์ Excel พร้อมนำเข้าประวัติมิเตอร์ย้อนหลัง
- **พิมพ์สติกเกอร์ QR Code ขนาด 75.2 × 36 mm (หรือขนาดที่กำหนดเอง)**

### 5.3 ย้ายตำแหน่ง (Location Transfer)
- ค้นหาด้วย Asset No. หรือ Serial No.
- รองรับย้ายข้าม Site + ออก AssetSiteCode ใหม่อัตโนมัติ
- บังคับจดมิเตอร์ก่อนย้าย (สำหรับอุปกรณ์ที่ตั้งค่าไว้)
- บันทึก Location_History ทุกครั้ง
- ใช้ทะเบียน Site เดิมเมื่อย้ายกลับ Site ที่เคยอยู่

### 5.4 จดมิเตอร์ (Meter Reading)
- กล่องค้นหาด่วน: พิมพ์ Serial 4-5 ตัวท้าย / Asset No. / รุ่น / แผนก
- คีย์บอร์ด-driven: ↑↓ เลือกเครื่อง, Enter กรอกเลข, Enter บันทึก
- Log รายการที่คีย์ล่าสุดแสดงด้านบนตาราง
- Progress Bar: คีย์แล้ว X / ทั้งหมด Y (เหลือ Z เครื่อง)
- รองรับมิเตอร์แบบรวม (TOTAL) และแยกขาวดำ/สี (BW_COLOR)
- Export ใบจดมิเตอร์เฉพาะเครื่องที่ยังไม่ได้จด

### 5.5 วิเคราะห์การใช้กระดาษ (Paper Analytics)
- กรอง: ช่วงเดือน / Site / อาคาร / รหัสแผนก + ปุ่มช่วงด่วน 1/3/6/12 เดือน
- KPI Cards: แผ่นรวม / เดือนล่าสุด / MoM / เฉลี่ยต่อเดือน / Top แผนก / Top เครื่อง
- **ภาพรวม:** กราฟแท่งรายเดือน + Proportional Bar + Smart Insights
- **จัดอันดับ:** 4 Tab — รหัสแผนก / อาคาร-ชั้น / เครื่องพิมพ์ / เปรียบเทียบ 3 เดือน
- **รายละเอียด:** ตารางทุกรายการ + Pagination
- Drill-down: คลิก Insight หรือแถวเพื่อดูต้นทาง
- Export: CSV / Excel / PDF / Print + Custom Export

### 5.6 Master Data
- เพิ่ม / แก้ไข / ปิดใช้งาน / ลบ Dropdown ทั้งระบบ
- กำหนด `Site_Code` ต่อ Site สำหรับ AssetSiteCode อัตโนมัติ
- กำหนด `Allowed_Sites` ต่อรายการ เพื่อซ่อน/แสดงตามสิทธิ์
- ปุ่ม Sync หลังแก้ All_Devices โดยตรง

### 5.7 ตั้งค่า (Settings) — 4 Tabs
1. **⚙️ ตั้งค่าทั่วไป** — ชื่อแอป, Login, การแจ้งเตือน, สติกเกอร์พื้นฐาน
2. **👥 สิทธิ์ผู้ใช้** — จัดการ User_Permissions
3. **🏢 สาขา (Site)** — Site_Attributes (LINE OA, Hotline แยกตาม Site)
4. **🎨 สติกเกอร์** — Multi-template Library + Drag-Move Editor ⭐ ใหม่

---

## 6. ระบบสติกเกอร์ (Sticker System) — แบบละเอียด

> ส่วนนี้เป็นฟีเจอร์ที่พัฒนาล่าสุดและซับซ้อนที่สุด

### 6.1 ภาพรวมระบบสติกเกอร์

```
┌─────────────────────────────────────────────────────────────┐
│                    Sticker System                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌──────────────────┐               │
│  │ Template Library │───▶│ Active Template  │               │
│  │  (หลายชุด)       │    │  (1 ชุดที่ใช้)     │               │
│  └─────────────────┘    └────────┬─────────┘               │
│                                  │                           │
│                                  ▼                           │
│                         ┌──────────────────┐                │
│                         │ renderStickerFrom │                │
│                         │ Template(device)  │                │
│                         └────────┬─────────┘                │
│                                  │                           │
│                   ┌──────────────┴──────────────┐           │
│                   ▼                             ▼           │
│            ┌────────────┐              ┌──────────────┐     │
│            │ Single     │              │ Bulk Print   │     │
│            │ Print      │              │ (grid ใน A4) │     │
│            └────────────┘              └──────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Multi-template Library

#### โครงสร้าง JSON Template
```javascript
{
  id: 'default',              // unique id ('default' ลบไม่ได้)
  name: 'เทมเพลตเริ่มต้น',     // ชื่อที่แสดง
  isDefault: true,            // ลบไม่ได้
  canvas: {
    width: 75.2,              // ความกว้าง mm
    height: 36,               // ความสูง mm
    unit: 'mm'
  },
  overflow: 'clip',           // 'clip' (ตัด) | 'visible' (เกินขอบ)
  elements: [
    {
      id: 'logo',
      type: 'text' | 'image' | 'qr' | 'rect',
      x: 1, y: 1,             // ตำแหน่ง (mm)
      width: 11, height: 11,  // ขนาด (mm)
      opacity: 1,             // 0-1 (ความโปร่งใส)
      zIndex: 1,              // ลำดับชั้น
      rotation: 0,            // องศา (optional)
      // type-specific:
      // text: fontSize, fontWeight, color, align, content, border, background
      // image: source, objectFit
      // qr: source
      // rect: background, border
    }
    // ... 17 elements ใน default
  ]
}
```

#### การจัดการ Library (UI ใน Settings → 🎨 สติกเกอร์)
- **📋 Template List** — แสดงทุก template พร้อม badges:
  - ⭐ = template ที่ใช้งานอยู่ (active)
  - ✏️ = template ที่กำลังแก้ไข
  - 📄 = template ปกติ
  - `[เริ่มต้น]` = default template (ลบไม่ได้)
  - `[ใช้อยู่]` = active template
- **➕ สร้างเทมเพลตใหม่** — เริ่มจาก default
- **📋 ทำสำเนา** — duplicate template ที่มีอยู่
- **⭐ ตั้งเป็นที่ใช้งาน** — set as active
- **🗑️ ลบ** — ลบ template (ยกเว้น default + active)
- **✏️ แก้ไข** — เปิดใน editor

### 6.3 Variables ที่รองรับ (18 ตัว)

ใช้ใน `content` และ `source` ของ elements:

| Variable | แหล่งข้อมูล | ตัวอย่าง |
|----------|-------------|---------|
| `{{companyName}}` | settings.stickerCompanyName | PACIFIC PLUS IT LIMITED PARTNERSHIP |
| `{{hospitalName}}` | settings.stickerHospitalName หรือ site name | โรงพยาบาลศูนย์อุดรธานี |
| `{{AssetNo}}` | device.AssetNo | 00629 |
| `{{AssetSiteCode}}` | device.AssetSiteCode | UDH-00001 |
| `{{Serial}}` | device.Serial | E1695B6N899389 |
| `{{Type}}` | device.Type | PRINTER LASER |
| `{{Brand}}` | device.Brand | BROTHER |
| `{{Model}}` | device.Model | HL-L5210DN |
| `{{Building}}` | device.Building | อาคารผู้ป่วยนอก |
| `{{Floor}}` | device.Floor | 3 |
| `{{Department}}` | device.Department | เวชระเบียน |
| `{{DepartmentCode}}` | device.DepartmentCode | OPD001 |
| `{{Location}}` | device.Location | ห้อง 301 |
| `{{Site}}` | device.Site | โรงพยาบาลศูนย์อุดรธานี |
| `{{ContractNo}}` | device.ContractNo | PO-2024-001 |
| `{{Vendor}}` | device.Vendor | บริษัท ABC |
| `{{hotline}}` | settings.stickerHotline หรือ site hotline | 1481 |
| `{{footerNote}}` | settings.stickerFooterNote | ห้ามเคลื่อนย้าย... |
| `{{lineOA}}` | settings.stickerLineOALink หรือ site lineOA | https://lin.ee/xxxxxx |

### 6.4 Default Template (17 elements)

ตำแหน่งทั้งหมดในหน่วย mm (canvas 75.2 × 36):

| # | id | type | x | y | w | h | fontSize | fontWeight | content |
|---|-----|------|---|---|---|---|----------|------------|---------|
| 1 | logo | image | 1 | 1 | 11 | 11 | — | — | logo |
| 2 | company | text | 13 | 1.5 | 47 | 4 | 7.5pt | 700 | {{companyName}} |
| 3 | hospital | text | 13 | 6 | 47 | 4 | 7pt | 600 | {{hospitalName}} (bg:#dbeafe) |
| 4 | docno | text | 13 | 10.5 | 47 | 3 | 6pt | 400 | เลขที่สัญญา: {{ContractNo}} |
| 5 | assetbox | text | 61 | 1.5 | 13 | 11 | 10pt | 700 | {{AssetNo}} (border) |
| 6 | qrLeft | qr | 1 | 13 | 18 | 18 | — | — | {{Serial}} |
| 7 | qrRight | qr | 58 | 13 | 17 | 14 | — | — | {{lineOA}} |
| 8 | qrHelp1 | text | 56 | 27.5 | 19 | 2.5 | 4.5pt | 700 | Scan QR code |
| 9 | qrHelp2 | text | 56 | 30 | 19 | 2.5 | 4pt | 600 | แจ้งซ่อมเบิกหมึก |
| 10 | qrHelp3 | text | 56 | 32.5 | 19 | 3 | 6pt | 700 | ☎ {{hotline}} |
| 11 | serial | text | 20 | 13 | 37 | 3.5 | 6pt | 400 | SERIAL NO: {{Serial}} |
| 12 | typemodel | text | 20 | 16.5 | 37 | 3.5 | 6pt | 700 | ประเภท: {{Type}} {{Brand}} {{Model}} |
| 13 | building | text | 20 | 20 | 37 | 3.5 | 6pt | 400 | อาคาร/ตึก : {{Building}} |
| 14 | floor | text | 20 | 23.5 | 37 | 3.5 | 6pt | 400 | ชั้น : {{Floor}} |
| 15 | dept | text | 20 | 27 | 37 | 3.5 | 6pt | 400 | หน่วยงาน : {{Department}} |
| 16 | location | text | 20 | 30.5 | 37 | 3.5 | 6pt | 400 | ที่ตั้ง : {{Location}} |
| 17 | footer | text | 1 | 34 | 55 | 2 | 3.5pt | 700 | {{footerNote}} |

### 6.5 Drag-Move Editor

#### โครงสร้าง Editor
```
┌─────────────────────────────────────────────────────────────┐
│ 📋 Template List    [➕ สร้างใหม่]                          │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ⭐ default [เริ่มต้น][ใช้อยู่]    [✏️][📋]              │ │
│ │ 📄 compact-a4                   [✏️][📋][⭐][🗑️]       │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ✏️ กำลังแก้ไข: เทมเพลตเริ่มต้น                              │
│ 📐 ขนาด: [75.2 × 36 mm ▼]   ชื่อ: [เทมเพลตเริ่มต้น]       │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────┐  ┌──────────────────────┐    │
│ │   [Workspace + Boundary] │  │  Property Panel      │    │
│ │  ┌─ 75.2 × 36 mm ────┐  │  │  X: [1] Y: [1]      │    │
│ │  │ [LOGO] [company]  │  │  │  W: [11] H: [11]    │    │
│ │  │ [QR]  [details]   │  │  │  fontSize: [7.5]    │    │
│ │  │       [QR] [☎]    │  │  │  fontWeight: [700▼] │    │
│ │  └───────────────────┘  │  │  color: [🎨] [#000]  │    │
│ │   [✂️ตัด] [👁️เกิน]       │  │  opacity: ━━━● 100%  │    │
│ └──────────────────────────┘  │  content: [{{...}}]  │    │
│ [+ข้อความ][+รูป][+QR][+กรอบ] │  [💾 บันทึก][👁️ Preview]│    │
└─────────────────────────────────────────────────────────────┘
```

#### ฟีเจอร์ Editor
1. **Workspace ใหญ่กว่า template จริง** — padding 30mm รอบด้าน
2. **เส้นขอบสีแดง (Boundary Box)** — แสดงขนาด template จริง + ฉลากขนาด
3. **ตัวเตือน element เกินขอบ** — ขอบส้ม + ป้าย `⚠ เกินขอบ`
4. **Drag element** — ลากเพื่อย้ายตำแหน่ง
5. **Resize handle** — ลากจุดสีฟ้ามุมขวาล่างเพื่อปรับขนาด
6. **Property Panel** — ปรับ X/Y/width/height/fontSize/fontWeight/color/align/opacity/content/source
7. **Paper Size Presets** — dropdown เลือกขนาดกระดาษ:
   - 75.2 × 36 mm (เดิม)
   - 50 × 30 mm (เล็ก)
   - 70 × 40 mm (กลาง)
   - 100 × 50 mm (ใหญ่)
   - Custom (กำหนดเอง)
8. **Overflow Mode** — toggle ระหว่าง:
   - `✂️ ตัด` — ตัดส่วนเกินเหมือน Excel (clip)
   - `👁️ เกิน` — แสดงเนื้อหาเกินขอบ (visible)

#### Property Panel — รายละเอียดแต่ละ control
| Control | ประเภท | ค่า |
|---------|--------|-----|
| ตำแหน่ง X (mm) | number | 0-500 |
| ตำแหน่ง Y (mm) | number | 0-500 |
| กว้าง (mm) | number | 1-500 |
| สูง (mm) | number | 1-500 |
| ขนาดตัวอักษร (pt) | number | 1-72 |
| ความหนา | dropdown | 300 Light, 400 Regular, 500 Medium, 600 Semibold, 700 Bold, 800 ExtraBold, 900 Black |
| สีตัวอักษร | color picker + hex | #000000 - #FFFFFF |
| การจัดวาง | dropdown | left, center, right |
| ความโปร่งใส | range slider | 0% - 100% |
| เนื้อหา | textarea | รองรับ {{variable}} |
| แหล่งรูป/QR | text | logo, URL, {{variable}} |

### 6.6 การพิมพ์สติกเกอร์

#### Single Print (ทีละใบ)
1. คลิกปุ่ม "สติกเกอร์" ในแถวอุปกรณ์
2. โหลด settings + active template (ถ้ายังไม่ได้โหลด)
3. `renderDeviceStickerSingle()` — ใช้ active template หรือ default
4. `triggerStickerPrint()` — inject `@page size` ตาม template.canvas
5. `window.print()` — พิมพ์ที่ขนาดกระดาษจริง

#### Bulk Print (หลายใบพร้อมกัน)
1. ติ๊ก checkbox เลือกหลายอุปกรณ์ (สูงสุด 60)
2. คลิก "🖨️ พิมพ์สติกเกอร์ที่เลือก"
3. `renderBulkStickers()` — สร้างสติกเกอร์ทีละใบใน temp div
4. รวม HTML ทั้งหมดเป็น grid
5. `triggerStickerPrint()` — คำนวณ columns อัตโนมัติ:
   ```javascript
   cols = Math.floor(200 / (w + 2))  // A4 width 210 - margin 10
   ```
6. Inject CSS: `grid-template-columns: repeat(cols, w mm)`
7. `window.print()` — พิมพ์หลายใบใน A4

#### ตัวอย่าง Bulk Print ตามขนาด template
| Template | ความกว้าง | คอลัมน์ใน A4 | ผล |
|----------|---------|-------------|-----|
| 75.2 × 36 mm | 75.2mm | 2 cols | 2 ใบ/แถว |
| 50 × 30 mm | 50mm | 3 cols | 3 ใบ/แถว |
| 70 × 40 mm | 70mm | 2 cols | 2 ใบ/แถว |
| 100 × 50 mm | 100mm | 1 col | 1 ใบ/แถว |

### 6.7 Version Stamp (กัน Cache เก่า)

**ปัญหา:** Client cache ทำให้ print ไม่ตรงกับ Settings ล่าสุด

**วิธีแก้:**
1. Backend: `stickerTemplateVersion` field ใน App_Settings
2. `bumpStickerTemplateVersion()` เรียกทุกครั้งที่:
   - saveStickerTemplateEntry
   - deleteStickerTemplate
   - setActiveStickerTemplate
   - updateAppSettings (เมื่อ toggle flag)
3. Client: `stickerSettingsNeedsReload()` ตรวจทุกครั้งที่ print
   - ถ้า > 60 วินาทีหลัง print ล่าสุด → reload
   - ถ้า version เปลี่ยน → reload
4. Manual refresh: ปุ่ม "🔄 รีเฟรชการตั้งค่า" ใน bulk-sticker-bar

### 6.8 Rollback (3 ระดับ)
- **Level 1**: ปิด toggle "เปิดใช้งานเทมเพลต" → ใช้ default template
- **Level 2**: ลบ template ที่ไม่ใช้ใน library
- **Level 3**: git revert commit

---

## 7. การตั้งค่าแอป (App_Settings)

### ฟิลด์ทั้งหมด (30+ ฟิลด์)

#### การตั้งค่าทั่วไป
| Key | Default | คำอธิบาย |
|-----|---------|---------|
| appName | 'IT Asset Management' | ชื่อแอป |
| loginRequired | true | บังคับ Login |
| enablePasswordLogin | true | เปิด Login ด้วย User/Password |

#### การแจ้งเตือน
| Key | Default | คำอธิบาย |
|-----|---------|---------|
| notifyEmails | '' | อีเมลผู้รับ (comma) |
| notifyTelegramEnabled | false | เปิด Telegram |
| notifyTelegramBotToken | '' | Telegram Bot Token |
| notifyTelegramChatId | '' | Telegram Chat ID |
| notifyLineNotifyEnabled | false | เปิด LINE Notify |
| notifyLineNotifyToken | '' | LINE Notify token |
| notifyLineOAEnabled | false | เปิด LINE OA |
| notifyLineOAChannelToken | '' | LINE OA Channel access token |
| notifyLineOARecipientId | '' | LINE recipient ID |
| notifyOnDeviceAdded | false | แจ้งเตือนเมื่อเพิ่มอุปกรณ์ |
| notifyOnDeviceUpdated | false | แจ้งเตือนเมื่อแก้ไข |
| notifyOnTransfer | false | แจ้งเตือนเมื่อย้าย |
| notifyOnLifecycle | false | แจ้งเตือนเมื่อเปลี่ยนสถานะ |
| notifyOnMeter | false | แจ้งเตือนเมื่อบันทึกมิเตอร์ |

#### สติกเกอร์ — ข้อความพื้นฐาน
| Key | Default | คำอธิบาย |
|-----|---------|---------|
| stickerCompanyName | 'PACIFIC PLUS IT LIMITED PARTNERSHIP' | ชื่อบริษัทบนสติกเกอร์ |
| stickerHospitalName | 'โรงพยาบาลศูนย์อุดรธานี' | ชื่อหน่วยงาน |
| stickerFooterNote | 'ห้ามเคลื่อนย้าย...' | ข้อความเตือนท้ายสติกเกอร์ |
| stickerHotline | '1481' | หมายเลข Hotline |
| stickerLineOALink | '' | ลิงก์ LINE OA สำหรับ QR |
| stickerLineOAImageUrl | '' | รูป QR LINE OA (data URL) |
| stickerLogoUrl | '' | ลิงก์โลโก้สติกเกอร์ |

#### สติกเกอร์ — Multi-template Library ⭐ ใหม่
| Key | Default | คำอธิบาย |
|-----|---------|---------|
| stickerTemplates | '{}' | JSON library ของ templates ทั้งหมด |
| activeStickerTemplateId | 'default' | id ของ template ที่ใช้งาน |
| stickerTemplateEnabled | false | เปิดใช้ template แบบกำหนดเอง |
| stickerTemplate | '' | (legacy) single template — deprecated |
| stickerTemplateVersion | 0 | version stamp สำหรับ cache invalidation |

#### การ Export
| Key | Default | คำอธิบาย |
|-----|---------|---------|
| paperExportColumns | 'brand,model,serial,...' | คอลัมน์ export การใช้กระดาษ |

### การเก็บค่าใน Sheet
- Key-Value ใน `App_Settings` sheet
- รูปใหญ่ (> 49,000 ตัวอักษร) ใช้ chunking: `__APP_SETTING_CHUNKED__:N` + `__chunk_001`, `__chunk_002`, ...
- Cache: `appSettings:v1` (TTL 300 วินาที)
- Invalidate: `clearAppSettingsCache()` + `bumpAuthCacheVersion()` + `bumpStickerTemplateVersion()`

---

## 8. การแจ้งเตือน (Notifications)

### 4 ช่องทาง

#### Email
```javascript
MailApp.sendEmail({
  to: settings.notifyEmails,
  subject: '[' + appName + '] ' + subject,
  body: body
});
```

#### Telegram
```javascript
UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
  method: 'post',
  contentType: 'application/json',
  payload: JSON.stringify({ chat_id: chatId, text: text })
});
```

#### LINE Notify
```javascript
UrlFetchApp.fetch('https://notify-api.line.me/api/notify', {
  method: 'post',
  headers: { Authorization: 'Bearer ' + token },
  payload: { message: text }
});
```

#### LINE Official Account
```javascript
UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
  method: 'post',
  contentType: 'application/json',
  headers: { Authorization: 'Bearer ' + channelToken },
  payload: JSON.stringify({
    to: recipientId,
    messages: [{ type: 'text', text: text }]
  })
});
```

### 事件ที่แจ้งเตือน (5 แบบ)
| Event | Settings Key | Trigger |
|-------|--------------|---------|
| deviceAdded | notifyOnDeviceAdded | เพิ่มอุปกรณ์ใหม่ |
| deviceUpdated | notifyOnDeviceUpdated | แก้ไขอุปกรณ์ |
| transfer | notifyOnTransfer | ย้ายตำแหน่ง |
| lifecycle | notifyOnLifecycle | เปลี่ยนสถานะ |
| meter | notifyOnMeter | บันทึกมิเตอร์ |

### Site-specific Settings
ใน `Master_Data` กำหนด Category พิเศษ:
- `SiteLineOA` — ลิงก์ LINE OA ของ Site นั้น
- `SiteHotline` — เบอร์โทรศัพท์ของ Site นั้น

---

## 9. Performance และ Cache

### 3 ชั้น Cache

#### ชั้นที่ 1: Request Cache (`_rc`)
- ใช้ตลอดอายุ 1 request (doGet/doPost)
- ป้องกันอ่าน Sheet ซ้ำใน request เดียวกัน
- `rcClear()` เรียกตอนเริ่ม doGet

```javascript
var _rc = {};
function rcLazy(key, fn) {
  return _rc.hasOwnProperty(key) ? _rc[key] : (_rc[key] = fn());
}
```

#### ชั้นที่ 2: Script Cache (CacheService)
- TTL ต่างกันตามประเภท:
  - Dashboard: 180 วินาที
  - App Settings: 300 วินาที
  - Auth: 60 วินาที
  - Site Attributes: 300 วินาที

#### ชั้นที่ 3: Client Cache (browser)
- `state.stickerSettingsLoaded` — โหลด settings ครั้งเดียว
- `state.activeStickerTemplate` — เก็บ template ที่โหลดแล้ว
- `stickerTemplateVersion` — version stamp สำหรับ invalidate
- Cache window: 60 วินาที (performance)

### การ Optimize
- **Batch operations** — `batchUpdateRow()` ทำ 1 API call ต่อหลายคอลัมน์
- **LockService** — กัน concurrent write conflict ตอน add/transfer device
- **Header alias mapping** — รองรับชื่อคอลัมน์ไทย/อังกฤษ 10+ รูปแบบ

### Quota ที่ต้องระวัง
- `UrlFetchApp`: 20,000 calls/day (QR codes ผ่าน quickchart.io)
- `MailApp`: 100 emails/day
- Execution timeout: 6 นาทีต่อ request

---

## 10. การติดตั้งและ Deploy

### ขั้นตอนที่ 1 — สร้าง Google Sheet
1. ไป [sheets.google.com](https://sheets.google.com) สร้าง Spreadsheet ใหม่
2. ตั้งชื่อ Sheet: `All_Devices`, `Location_History`, `Meter_Readings`, `Master_Data`, `User_Permissions`, `App_Settings`
3. ระบบจะสร้าง Header อัตโนมัติเมื่อใช้งานครั้งแรก

### ขั้นตอนที่ 2 — ตั้งค่า Apps Script
1. เปิด Spreadsheet → **Extensions > Apps Script**
2. วางโค้ดจากไฟล์ต่าง ๆ ให้ตรงชื่อ:
   - `Code.gs` → Script file หลัก
   - `Auth.gs`, `DeviceService.gs`, `MeterService.gs`, `TransferService.gs`
   - `AnalyticsService.gs`, `SettingsService.gs`, `ImportService.gs`
   - `index.html`, `css.html`, `javascript.html`
3. ตั้งค่า `SPREADSHEET_ID` ใน Script Properties:
   ```javascript
   PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', 'your-sheet-id');
   ```

### ขั้นตอนที่ 3 — Deploy Web App
1. **Deploy > New deployment**
2. Type: **Web app**
3. ตั้งค่า:
   - Execute as: `User deploying the web app`
   - Who has access: `Anyone with Google Account` (แนะนำ) หรือ `Anyone` (anonymous)
4. คลิก **Deploy** → บันทึก URL

### ขั้นตอนที่ 4 — กำหนด Master Data เบื้องต้น
เพิ่มใน `Master_Data` อย่างน้อย 1 รายการ Category `Site`:
| Category | Value | Site_Code |
|----------|-------|-----------|
| Site | โรงพยาบาลศูนย์อุดรธานี | UDH-00001 |

### การ Deploy ด้วย clasp (Advanced)
```bash
npm install -g @google/clasp
clasp login
clasp clone <SCRIPT_ID>
# copy ไฟล์จาก IT-Asset-Management/ ไปทับ
clasp push
```

### การ Deploy จาก Branch พัฒนา
```bash
git clone -b feature/sticker-bulk-print-and-template-editor \
  https://github.com/nikorn2527-stack/IT-Asset-Management.git
# copy ไฟล์ไป Apps Script editor
```

---

## 11. API และฟังก์ชันทั้งหมด

### Backend Functions (203 ฟังก์ชัน)

#### Code.gs (88 functions)
| ฟังก์ชัน | คำอธิบาย |
|---------|---------|
| `doGet(e)` | Web app entry point |
| `include(filename)` | Include HTML file |
| `getSpreadsheet()` | Get spreadsheet by ID |
| `getSheet(name)` | Get sheet by name |
| `getSheetValues(sheet, display)` | Read sheet values |
| `createJsonResponse(payload)` | Create JSON response |
| `toScriptJson(v)` | Escape JSON for HtmlService |
| `normalizeHeaderName(h)` | Normalize header for comparison |
| `toSnakeCase(t)` | Convert to snake_case |
| `withSnakeCase(arr)` | Add snake_case aliases |
| `formatAssetNo(n)` | Pad asset number |
| `parseBooleanValue(v)` | Parse boolean from various formats |
| `normalizeFloorValue(v)` | Normalize floor value |
| `parseNumberValue(v)` | Parse number from string |
| `parseDateValue(v)` | Parse date from various formats |
| `normalizeReadingMonth(v)` | Normalize to YYYY-MM |
| `normalizeMeterMode(v)` | Normalize to TOTAL or BW_COLOR |
| `isMeterRequiredDevice(d)` | Check if device needs meter |
| `isSeparateColorMeterDevice(d)` | Check BW_COLOR mode |
| `batchUpdateRow(sheet, rowNo, headers, updates, currentValues)` | Batch update row |
| `checkLoginRateLimit(username)` | Rate limit login |
| `sanitizeInput(v, max)` | Sanitize input (XSS prevention) |
| `errResult(context, e)` | Error response |
| `auditLog(action, user, details)` | Write audit log |
| `getCurrentUser(authToken)` | Get current user email |
| `getDeviceHeaderAliases()` | Device header aliases |
| `buildHeaderMap(aliases)` | Build header map |
| `getDeviceHeaderMap()` | Get device header map |
| `mapDeviceHeader(h)` | Map device header |
| `mapDeviceHeaders(rh)` | Map device headers array |
| `getMeterHeaderAliases()` | Meter header aliases |
| `getMeterHeaderMap()` | Get meter header map |
| `mapMeterHeader(h)` | Map meter header |
| `mapMeterHeaders(rh)` | Map meter headers array |
| `parseAssetSiteCodeSeed(seed)` | Parse seed number |
| `formatAssetSiteCode(prefix, num, width)` | Format asset site code |
| `normalizeAssetSiteCodeForCompare(c)` | Normalize for compare |
| `getSiteAssetCodeSeed(site)` | Get site code seed |
| `getNextAssetSiteCode(site, authToken)` | Generate next asset site code |
| `getNextAssetNoFromDeviceData(...)` | Get next asset no from data |
| `getNextAssetNo(authToken)` | Generate next asset no |
| `getDeviceHeaderInfo(data)` | Get header info |
| `ensureDeviceHeaders(sheet)` | Ensure device headers |
| `getMasterData(category, authToken)` | Get master data |
| `saveMasterDataEntry(entry, authToken)` | Save master data |
| `getDepartmentCodeForDepartment(dept)` | Get dept code |
| `getAllDevices(userEmailOrName)` | Get all devices |
| `getDeviceByAssetNo(assetNo, authToken)` | Get device by asset no |
| `searchDevices(filters, authToken)` | Search devices |
| ... (88 ฟังก์ชันทั้งหมด) |

#### Auth.gs (35 functions)
- `normalizePermissionRole(role)`, `rolePermissionsToMap(role)`
- `isAdminPermissionRole(r)`, `isSuperAdminRole(r)`
- `getEffectiveAllowedSitesForRole(role, sites)`, `parseAllowedSitesValue(role, sites)`
- `canAccessSiteByAllowedSites(site, allowed)`, `assertSiteAccess(site, authToken, label)`
- `canAdminManageTargetSites(curr, targetRole, targetSites)`, `canAdminSeeTargetUser(curr, target)`
- `getPermissionRoleLabel(role)`, `requirePermission(perm, authToken)`
- `getCurrentUserEmail()`, `createPasswordSalt()`, `hashPassword(password, salt)`
- `buildCustomAuthToken(loginKey)`, `getLoginKeyFromAuthToken(authToken)`
- `getAuthCacheVersion()`, `bumpAuthCacheVersion()`
- `ensureUserPermissionsSheet()`, `getPermissionColumnIndex(headers, names)`
- `getUserPermissionRows(includeInactive)`, `sanitizeUserPermissionRows(rows)`
- `countActiveAdmins(rows, exclude)`, `bootstrapCurrentUserAsAdmin(info, email)`
- `getVisibleUserPermissionRowsForAdmin(curr, includeInactive)`
- `enforcePasswordLoginSettings(s)`, `findPermissionRowByLogin(id)`
- `authenticateUserPassword(username, password)`, `logoutUserPassword(authToken)`
- `buildPermissionResponse(row, appSettings, pwAuth)`
- `getCurrentUserPermission(authToken)`, `getUserAllowedSites(authToken)`
- `listUserPermissions(authToken)`, `saveUserPermission(entry, authToken)`
- `deactivateUserPermission(identifier, authToken)`

#### SettingsService.gs (29 functions)
- `getDefaultAppSettings()`, `getAppSettingDescriptions()`, `getPublicAppSettings(settings, options)`
- `ensureAppSettingsSheet()`, `getAppSettingsInternal(skipCache)`, `getAppSettings(authToken)`
- `getStickerSettings(authToken)`
- `isImageAppSettingKey(k)`, `getAppSettingChunkKey(k,i)`, `splitAppSettingValue(v)`
- `getStoredAppSettingValue(key, rawByKey)`
- `clearAppSettingsCache()`, `putAppSettingsCache(s)`
- `bumpStickerTemplateVersion()` ⭐ ใหม่
- `normalizeAppSettingsForSave(settings, defaults, current)`
- `upsertAppSettingRows(settings)`, `updateAppSettings(settings, authToken)`
- **Sticker Template Library:**
  - `buildDefaultStickerTemplate()` ⭐ ใหม่
  - `getStickerTemplates(authToken)` ⭐ ใหม่
  - `saveStickerTemplateEntry(entry, authToken)` ⭐ ใหม่
  - `deleteStickerTemplate(id, authToken)` ⭐ ใหม่
  - `setActiveStickerTemplate(id, authToken)` ⭐ ใหม่
  - `getActiveStickerTemplate(authToken)` ⭐ ใหม่
- `sendTelegramNotification(settings, text)`
- `sendLineNotifyNotification(settings, text)`
- `sendLineOANotification(settings, text)`
- `sendAppNotification(eventKey, subject, body)`

### Frontend Functions (330 functions in javascript.html)

#### Sticker-related (50+ functions)
- `printDeviceSticker(assetNo)`, `renderDeviceSticker(assetNo)`
- `renderDeviceStickerSingle(assetNo, targetEl)` — single source of truth
- `renderDeviceStickerLegacy(assetNo, targetEl)` — last-resort fallback
- `triggerStickerPrint(printArea)` — dynamic @page size
- `printSelectedDeviceStickers()`, `renderBulkStickers(assetNos)`
- `loadActiveStickerTemplateForRendering(onDone)`
- `stickerSettingsNeedsReload()`, `resetStickerCache()` ⭐ ใหม่
- `renderStickerFromTemplate(device, template, targetEl)` — JSON renderer
- `openStickerEditor()`, `loadStickerEditorTab()`
- `renderTemplateLibrary()`, `selectTemplateForEdit(id)`
- `createNewTemplate()`, `duplicateTemplate(id)`
- `deleteTemplate(id)`, `setActiveTemplate(id)`
- `onPaperSizePresetChange(selectEl)`, `applyPaperSizeFromInputs()`
- `applyPaperSizeToTemplate(w, h)`, `updatePaperSizePresetSelection()`
- `onTemplateNameChange(inputEl)`, `updateTemplateEditHeader()`
- `renderStickerEditor()`, `renderEditorElementPreview(el)`
- `startDragElement(e, elId)`, `startResizeElement(e, elId)`
- `selectStickerElement(elId, skipRender)`, `updatePropertyPanel(el)`
- `updateSelectedStickerElement(prop, value)`
- `addStickerElement(type)`, `deleteSelectedStickerElement()`
- `resetStickerTemplateToDefault()`, `saveStickerTemplate()`
- `previewStickerTemplate()`, `setTemplateOverflow(mode)` ⭐ ใหม่
- `ensureOverflowToggle(wsPad, tplW)` ⭐ ใหม่

---

## 12. การแก้ปัญหา (Troubleshooting)

### ปัญหาทั่วไป

#### สติกเกอร์พิมพ์ไม่ตรงกับ Settings ล่าสุด
**สาเหตุ:** Client cache ค้าง
**วิธีแก้:**
1. กดปุ่ม "🔄 รีเฟรชการตั้งค่า" ใน bulk-sticker-bar
2. หรือรีเฟรชหน้าเว็บ (F5)
3. หรือรอ 60 วินาที (cache auto-expire)

#### ชื่อ template พิมพ์ไม่ติด
**สาเหตุ:** `updateTemplateEditHeader()` เขียนทับ input
**วิธีแก้:** อัปเดตเป็นเวอร์ชันล่าสุด (commit `8303206`)

#### Bulk print ขนาดไม่ตรง
**สาเหตุ:** `75.2mm` hardcoded ใน CSS + JS
**วิธีแก้:** อัปเดตเป็นเวอร์ชันล่าสุด (commit `9e24d0b`)

#### ข้อความ 3 บรรทัดหัวสติกเกอร์หาย
**สาเหตุ:** fallback values ว่าง
**วิธีแก้:** อัปเดตเป็นเวอร์ชันล่าสุด (commit `245043f`)

#### Logo ไม่แสดง
**สาเหตุ:** หลายสาเหตุ:
1. `stickerLogoUrl` ว่าง → ตรวจสอบใน App_Settings
2. Logo URL ไม่ถูกต้อง → ตรวจสอบ URL
3. data:image/... ใหญ่เกิน 50,000 ตัวอักษร → ใช้ chunking
4. Browser block รูปจาก external domain → ใช้ data URL แทน

#### Login ไม่ได้
**สาเหตุ:** Rate limit หรือ password ผิด
**วิธีแก้:**
1. รอ 5 นาที (lockout หมดอายุ)
2. ตรวจสอบ User_Permissions sheet ว่า Active = TRUE
3. ตรวจสอบ PasswordHash + PasswordSalt

#### Sheet ไม่พบ
**สาเหตุ:** ชื่อ sheet ผิด
**วิธีแก้:** ตรวจสอบชื่อ sheet ตรงกับ CONFIG ใน Code.gs

### Debug Tips
1. เปิด Browser Console (F12) ดู console.warn/error
2. ดู Apps Script Logs: `console.log()` ในโค้ด
3. ใช้ Stackdriver Logging (Apps Script editor → Executions)
4. ตรวจสอบ Audit_Log sheet ดูการกระทำล่าสุด

---

## 13. ความเสี่ยงและข้อจำกัด

### ความเสี่ยงด้านความปลอดภัย

| # | ความเสี่ยง | ระดับ | สถานะ |
|---|-----------|-------|-------|
| 1 | ฟังก์ชันซ้ำใน `modules/` vs `Code.gs` (10 ฟังก์ชัน) | ✅ แก้แล้ว | ย้าย 13 ฟังก์ชันเข้า Code.gs + ลบ modules/ |
| 2 | `appsscript.json` access = `ANYONE_ANONYMOUS` | 🔴 P0 | ยังไม่ได้แก้ |
| 3 | `setXFrameOptionsMode(ALLOWALL)` — clickjacking | 🟡 P1 | ยังไม่ได้แก้ |
| 4 | Password hash เปรียบเทียบแบบ non-constant-time | 🟡 P1 | ยังไม่ได้แก้ |
| 5 | XSS protection ฝั่ง client ดีแต่ไม่สม่ำเสมอ | 🟡 P1 | บางส่วน |

### ข้อจำกัดของ Google Apps Script

| ข้อจำกัด | ค่า | ผลกระทบ |
|---------|-----|---------|
| Execution timeout | 6 นาที | งานยาวต้องแบ่งเป็น batch |
| UrlFetchApp | 20,000/day | QR codes ผ่าน quickchart.io |
| MailApp | 100/day | ส่ง email แจ้งเตือน |
| CacheService | 100KB/value | ใช้ chunking สำหรับข้อมูลใหญ่ |
| Cell text limit | 50,000 ตัวอักษร | ใช้ chunking สำหรับรูปใหญ่ |

### ข้อจำกัดด้าน Performance

| ปัญหา | ผลกระทบ | วิธีแก้ |
|-------|---------|---------|
| โหลดทั้ง sheet ทุก query | ช้าเมื่อข้อมูลโต | เพิ่ม index sheet (future) |
| `appendRow` ใน loop | ช้าสำหรับ bulk insert | ใช้ batch insert (future) |
| `deleteDevice` ไม่ลบ orphan | ข้อมูลค้าง | เพิ่ม orphan cleanup (future) |

### ความเสี่ยงด้าน Browser Compatibility

| ฟีเจอร์ | Browser Support | หมายเหตุ |
|---------|----------------|---------|
| CSS Grid ใน @media print | Chrome ✅, Firefox ⚠️, Safari ⚠️ | ถ้าไม่รองรับ → ใช้ flexbox |
| `@page size` dynamic | Chrome ✅, อื่นๆ บางส่วน | ผู้ใช้อาจต้องเลือกขนาดใน print dialog |
| `window.print()` | ทุก browser | อาจถูก pop-up blocker บางครั้ง |
| Color picker (`<input type="color">`) | ทุก browser ยกเว้น IE | ใช้ text input เป็น fallback |

### Priority Recommendations (ถัดไป)

| Priority | งาน | เวลา |
|----------|-----|------|
| P0 | ลบไฟล์ `modules/` ที่ซ้ำกับ `Code.gs` | ✅ แก้แล้ว |
| P0 | เปลี่ยน `appsscript.json` access = `ANYONE_WITH_GOOGLE_ACCOUNT` | 5 นาที |
| P0 | ลบ `setXFrameOptionsMode(ALLOWALL)` | 5 นาที |
| P1 | เพิ่ม orphan cleanup ใน `deleteDevice` | 20 นาที |
| P1 | Batch insert ใน `saveMeterReading` | 30 นาที |
| P2 | เพิ่ม keyboard shortcuts ใน sticker editor | 30 นาที |
| P2 | เพิ่ม preview device selector | 20 นาที |
| P2 | เพิ่ม snap-to-grid ใน editor | 30 นาที |
| P3 | พิจารณา migration ไป Next.js + database จริง | หลายวัน |

---

## 📞 ติดต่อและสนับสนุน

- **Repository:** [nikorn2527-stack/IT-Asset-Management](https://github.com/nikorn2527-stack/IT-Asset-Management)
- **Branch พัฒนา:** `feature/sticker-bulk-print-and-template-editor`
- **พัฒนาโดย:** PNG TEAM
- **เอกสารนี้:** อัปเดตล่าสุดเมื่อ commit `9e24d0b`

---

## 📝 ประวัติการพัฒนา (สรุป)

| Commit | คำอธิบาย |
|--------|---------|
| `13d2849` | Initial — Fix_qr_code (master) |
| `7070530` | feat: bulk print + drag-move template editor (feature flag) |
| `693dfa9` | refactor: move editor from modal to dedicated Settings tab |
| `00e8ba7` | fix: balance left/right panel heights |
| `31f50ab` | feat: multi-template library + paper size selector + single-source renderer |
| `245043f` | fix: restore 3 missing header texts (company/hospital/contract) |
| `b52f9b8` | fix: restore 3 lines under right QR (Scan/instructions/hotline) |
| `cf4e01b` | feat: add Type row + font weight/color controls |
| `dd2973a` | feat: larger workspace + boundary box + overflow clip/visible |
| `62fee10` | fix: ensure print uses latest Settings — version stamp + auto-reload |
| `8303206` | fix: template name input now editable |
| `9e24d0b` | fix: bulk print now uses template's actual paper size |

---

*เอกสารนี้จัดทำเพื่อใช้ภายในองค์กร · Power by PNG TEAM*
