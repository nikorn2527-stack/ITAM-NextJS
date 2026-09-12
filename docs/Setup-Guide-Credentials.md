# 🔐 Setup Guide — SSH Keys + Service Credentials

คู่มือตั้งค่าสิทธิ์สำหรับ GitHub, Vercel, Supabase และอื่นๆ

---

## 1. SSH Key (ใช้ได้ทุก service ที่รองรับ SSH)

### 1.1 Public Key ที่สร้างให้แล้ว

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIN9LLo+2OQEelC9LLDJaAw4cak6QoAiEU4XwLVKY8TQwAAAADGl0YW0tc2FuZGJveA== itam-sandbox
```

### 1.2 เพิ่มบน GitHub

1. ไปที่ https://github.com/settings/keys
2. คลิก **New SSH key**
3. Title: `ITAM Sandbox`
4. Key type: `Authentication Key`
5. Paste public key ด้านบน
6. คลิก **Add SSH key**

### 1.3 เพิ่มบน Vercel (ถ้าต้อง deploy ผ่าน SSH)

1. ไปที่ https://vercel.com/account/tokens (ใช้ Access Token แทน SSH)
2. คลิก **Create Token**
3. Name: `ITAM Deploy`
4. Scope: `Full Account` หรือ `Specific Project`
5. Copy token → เก็บใน `.env.local`:
   ```
   VERCEL_TOKEN=<token>
   ```

### 1.4 เพิ่มบน Supabase (ใช้ Database Password ไม่ใช่ SSH)

Supabase ไม่ใช้ SSH แต่ใช้ Connection String:
1. ไปที่ https://supabase.com/dashboard → Project → Settings → Database
2. คลิก **Connection string** → copy URL
3. เก็บใน `.env.local`:
   ```
   SUPABASE_DATABASE_URL=postgresql://postgres.[project]:[NEW_PASSWORD]@[REDACTED_HOST]:5432/postgres
   ```

---

## 2. GitHub — วิธีใช้ SSH

หลังเพิ่ม SSH key บน GitHub:

```bash
# Push (ไม่ต้องใส่ token อีก)
git push origin main

# Pull
git pull origin main

# Clone (ถ้าต้องการ)
git clone git@github.com:nikorn2527-stack/ITAM-NextJS.git
```

---

## 3. Vercel — วิธี Deploy

### 3.1 ติดตั้ง Vercel CLI (ตอน deploy จริง)
```bash
npm i -g vercel
vercel login  # เข้าสู่ระบบผ่าน browser
```

### 3.2 Deploy
```bash
vercel --prod
```

### 3.3 Environment Variables บน Vercel
ไปที่ https://vercel.com/dashboard → Project → Settings → Environment Variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://...` (Supabase connection string) |
| `JWT_SECRET` | `itam-production-secret-2025-png-team-32bytes` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | `{...JSON...}` (ถ้าใช้ Google Sheets sync) |
| `GOOGLE_SHEETS_ID_ITAM` | `1Zi2sDW...` |
| `GOOGLE_SHEETS_ID_SERVICES` | `1_YPa5f...` |
| `GOOGLE_SHEETS_ID_STOCK` | `18unmy8...` |

### 3.4 Build Command บน Vercel
```
prisma generate && next build
```

### 3.5 ห้ามใช้ `db push` บน Vercel
ใช้ `prisma migrate deploy` แทน (มี migration file พร้อมแล้ว)

---

## 4. Supabase — การจัดการ

### 4.1 Rotate Database Password (ทำทันที!)

1. ไปที่ https://supabase.com/dashboard → Project → Settings → Database
2. คลิก **Reset database password**
3. Copy password ใหม่ → เก็บใน `.env.local` + Vercel Environment Variables

### 4.2 แยก Database Users ตามหน้าที่

ไปที่ Supabase Dashboard → SQL Editor → รัน:

```sql
-- Application User (read/write tables)
CREATE USER itam_app WITH PASSWORD '[STRONG_PASSWORD_1]';
GRANT CONNECT ON DATABASE postgres TO itam_app;
GRANT USAGE ON SCHEMA public TO itam_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO itam_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO itam_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO itam_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO itam_app;

-- Migration User (DDL only)
CREATE USER itam_migration WITH PASSWORD '[STRONG_PASSWORD_2]';
GRANT CONNECT ON DATABASE postgres TO itam_migration;
GRANT USAGE, CREATE ON SCHEMA public TO itam_migration;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO itam_migration;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO itam_migration;

-- Dev Readonly User
CREATE USER itam_dev_readonly WITH PASSWORD '[STRONG_PASSWORD_3]';
GRANT CONNECT ON DATABASE postgres TO itam_dev_readonly;
GRANT USAGE ON SCHEMA public TO itam_dev_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO itam_dev_readonly;
```

### 4.3 Connection Strings สำหรับแต่ละ user

```
# Application (Next.js runtime)
postgresql://itam_app:[PASS_1]@[REDACTED_HOST]:5432/postgres

# Migration (deploy only)
postgresql://itam_migration:[PASS_2]@[REDACTED_HOST]:5432/postgres

# Dev Readonly
postgresql://itam_dev_readonly:[PASS_3]@[REDACTED_HOST]:5432/postgres
```

---

## 5. Google Cloud — Service Account

### 5.1 สร้าง Service Account
1. ไปที่ https://console.cloud.google.com → IAM → Service Accounts
2. คลิก **Create Service Account**
3. Name: `itam-sheets-reader`
4. Role: ไม่ต้องใส่ (ใช้ Sheets API แบบ readonly)
5. คลิก **Create Key** → JSON → Download

### 5.2 Enable Google Sheets API
1. ไปที่ https://console.cloud.google.com → APIs & Services → Enable APIs
2. ค้นหา **Google Sheets API** → Enable

### 5.3 แชร์ Spreadsheets กับ Service Account
1. เปิด Google Sheet ของแอปเดิม
2. คลิก **Share**
3. ใส่ email ของ Service Account: `itam-qa-dev-reader@ageless-parity-500505-b3.iam.gserviceaccount.com`
4. สิทธิ์: **Viewer**
5. ทำทั้ง 3 spreadsheets (ITAM, Services, Stock)

### 5.4 เก็บ JSON key
```bash
# .env.local
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"ageless-parity-500505-b3",...}
GOOGLE_SHEETS_ID_ITAM=1Zi2sDW1xeAUdHb6MSt0AdpZttRY8C3-WB5agHLaeUpc
GOOGLE_SHEETS_ID_SERVICES=1_YPa5fvNnsoKA0I3JFk38x7A7kTGHCVfDhsvQ-aCmgw
GOOGLE_SHEETS_ID_STOCK=18unmy8rRwQYgFuunZkKueMwBUFvpVtqvokb6l-YihaM
```

---

## 6. สรุป Environment Variables ทั้งหมด

### `.env.local` (development — ไม่ commit)

```bash
# Database
DATABASE_URL=file:./db/custom.db

# Auth
JWT_SECRET=itam-production-secret-2025-png-team-32bytes

# Supabase (for scripts only)
SUPABASE_DATABASE_URL=postgresql://itam_dev_readonly:[PASS]@host:5432/postgres

# Google Sheets
GOOGLE_SERVICE_ACCOUNT_KEY={...}
GOOGLE_SHEETS_ID_ITAM=...
GOOGLE_SHEETS_ID_SERVICES=...
GOOGLE_SHEETS_ID_STOCK=...

# Restore guard
RESTORE_CONFIRM=YES
DEV_DB_PUSH=1
```

### Vercel Environment Variables (production)

```bash
DATABASE_URL=postgresql://itam_app:[PASS]@host:5432/postgres
JWT_SECRET=itam-production-secret-2025-png-team-32bytes
GOOGLE_SERVICE_ACCOUNT_KEY={...}
GOOGLE_SHEETS_ID_ITAM=...
GOOGLE_SHEETS_ID_SERVICES=...
GOOGLE_SHEETS_ID_STOCK=...
```

---

## 7. Security Checklist

| รายการ | สถานะ |
|---|---|
| SSH key สร้างแล้ว | ✅ |
| SSH key เพิ่มบน GitHub | 📋 คุณต้องทำ |
| Supabase password rotate | 📋 คุณต้องทำ |
| แยก Database users | 📋 คุณต้องทำ |
| Google Service Account | ✅ มีแล้ว (key ใน upload/) |
| .env ใน .gitignore | ✅ |
| .env.example สร้างแล้ว | ✅ |
| 0 credentials ใน source code | ✅ |
| Vercel env vars | 📋 ตอน deploy |
