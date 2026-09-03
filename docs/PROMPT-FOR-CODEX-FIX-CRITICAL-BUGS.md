# 📋 PROMPT FOR CODEX — Fix Critical Bugs (Production Can't Use)

วันที่: 2026-08-31
Project: ITAM-NextJS (Next.js 16 + Prisma + Supabase PostgreSQL)
Repo: https://github.com/nikorn2527-stack/ITAM-NextJS
Branch: main (commit ac68bb3)
Production: https://itam-next-js.vercel.app/

---

## 🚨 สถานะ: ระบบ deploy แล้ว แต่ใช้งานไม่ได้ เพราะมี 2 bugs ที่ block ทุกอย่าง

---

## 📋 Context ที่ Codex ต้องรู้:

1. ระบบมี 3 demo users:
   - `demo_admin` (role=superadmin, allowedSites=ALL, isDemo=true)
   - `demo_staff` (role=editor, allowedSites=ALL, isDemo=true)
   - `demo_viewer` (role=viewer, allowedSites=ALL, isDemo=true)

2. Auth ใช้ JWT (ผ่าน `/api/itam/auth/login`) → ได้ Bearer token

3. Database: Supabase PostgreSQL (ITAM-DB)
   - มีข้อมูลจริง: Device 2,386 + WorkOrder 4,927 + MeterReading 14,286

4. Demo users มี `isDemo: true` — อาจมีผลกับการเขียนข้อมูล

---

## 🔴 BUG 1 (P0 — BLOCKER): demo_staff + demo_viewer เห็นข้อมูล = 0

### อาการ:
- `demo_admin` เรียก `GET /api/devices?limit=5` → เห็น 2,386 devices ✅
- `demo_staff` เรียก `GET /api/devices?limit=5` → เห็น 0 devices ❌
- `demo_viewer` เรียก `GET /api/devices?limit=5` → เห็น 0 devices ❌

- เหมือนกันกับ Work Orders: admin เห็น 4,927, staff/viewer เห็น 0

### สาเหตุ:
ใน `src/lib/authorization-context.ts` ฟังก์ชัน `buildAuthorizationContext()`:

```typescript
// ปัจจุบัน: มีแค่ superadmin และ admin ที่ bypass site scope
if (isSuperAdmin || isGlobalAdmin) {
  // เห็นทุกอย่าง
  return { siteScope: { kind: 'all', siteCodes: [] }, ... }
}
// ถ้าไม่ใช่ superadmin/admin → ไป check UserSiteGrant
// demo_staff และ demo_viewer ไม่มี UserSiteGrant → fail-closed → เห็น 0
```

### สิ่งที่ควรแก้:
`allowedSites === "ALL"` ควรทำงานเหมือน admin — เห็นข้อมูลทั้งหมด

### ไฟล์ที่ต้องแก้:
`src/lib/authorization-context.ts` — ฟังก์ชัน `buildAuthorizationContext()`

### วิธีแก้:
```typescript
// เพิ่มเงื่อนไข: ถ้า user.allowedSites === "ALL" ให้ bypass site scope
const isGlobalAccess = isSuperAdmin || isGlobalAdmin || user.allowedSites === 'ALL'

if (isGlobalAccess) {
  // เห็นทุกอย่าง — เหมือน superadmin
  return {
    userId,
    email: user.email,
    globalRole,
    isSuperAdmin,
    grants: [],
    siteScope: { kind: 'all', siteCodes: [] },
    effectivePermissions: globalPerms,
    usedLegacyFallback: false,
    can: (perm) => globalPerms.includes(perm),
    canAtSite: () => true,
    canAccessSite: () => true,
    siteWhere: () => ({}),
    roleAtSite: () => globalRole,
    permissionsAtSite: () => globalPerms,
  }
}
```

### ทดสอบหลังแก้:
```bash
# Login as demo_staff
TOKEN=$(curl -s -X POST https://itam-next-js.vercel.app/api/itam/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo_staff","password":"demo123"}' | jq -r .token)

# ต้องเห็น devices > 0
curl -s "https://itam-next-js.vercel.app/api/devices?limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq '.pagination.total'
# คาดหวัง: 2386 (ไม่ใช่ 0)
```

---

## 🔴 BUG 2 (P0 — BLOCKER): Create WO ตอบ 403 สำหรับ demo users

### อาการ:
- `demo_admin` (มี permission WO_CREATE) ส่ง `POST /api/work-orders` → 403 ❌
- `demo_staff` (มี permission WO_CREATE) ส่ง `POST /api/work-orders` → 403 ❌

### สาเหตุ:
ใน `src/app/api/work-orders/route.ts` ฟังก์ชัน POST:

```typescript
// ประมาณบรรทัด 333-337:
const peekSource =
  typeof rawBody.submissionSource === 'string' &&
  VALID_SOURCES.has(rawBody.submissionSource.trim())
    ? rawBody.submissionSource.trim()
    : 'guest'

if (peekSource === 'guest') {
  // Guest flow — optional auth
  const auth = await requireAuth(req).catch(() => null)
} else {
  // Authenticated staff — hard-require WO_CREATE
  const auth = await requireAuth(req, 'WO_CREATE')  // ← ตรงนี้อาจ fail
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
}
```

### สาเหตุที่เป็นไปได้:

#### สาเหตุ A: requireAuth ไม่รับ demo user token
ตรวจ `src/lib/auth-middleware.ts` — ฟังก์ชัน `requireAuth()`:
```typescript
const row = await db.user.findUnique({ where: { email: payload.email } })
if (!row || !row.active) {
  return { ok: false, status: 401, error: 'บัญชีถูกปิดใช้งานหรือไม่พบในระบบ' }
}
```
→ ตรวจว่า demo user มีใน DB ไหม (Supabase ITAM-DB, ไม่ใช่ SQLite sandbox)

#### สาเหตุ B: permission check ล้มเหลว
```typescript
if (permission && !hasResolvedPermission(user.permissions, permission)) {
  return { ok: false, status: 403, error: `ไม่มีสิทธิ์ (${permission})` }
}
```
→ ตรวจว่า `user.permissions` มี `WO_CREATE` จริงไหม

#### สาเหตุ C: demo user ถูก block จากการเขียน
→ ตรวจว่ามี code ที่ block `isDemo: true` จากการเขียนหรือไม่

### ไฟล์ที่ต้องตรวจ:
1. `src/app/api/work-orders/route.ts` — POST handler
2. `src/lib/auth-middleware.ts` — requireAuth()
3. `src/lib/auth.ts` — verifyToken() + toAuthUser() + hasResolvedPermission()

### วิธี debug:
```typescript
// เพิ่ม log ชั่วคราวใน requireAuth:
export async function requireAuth(req: Request, permission?: Permission) {
  const token = extractBearer(req)
  console.log('[requireAuth] token:', token?.slice(0, 20))
  
  const payload = await verifyToken(token)
  console.log('[requireAuth] payload:', payload?.email)
  
  const row = await db.user.findUnique({ where: { email: payload.email } })
  console.log('[requireAuth] user found:', !!row, 'active:', row?.active)
  console.log('[requireAuth] permissions:', row?.permissions)
  
  const user = toAuthUser(row)
  console.log('[requireAuth] hasResolvedPermission:', hasResolvedPermission(user.permissions, permission))
}
```

### ทดสอบหลังแก้:
```bash
# Login as demo_admin
TOKEN=$(curl -s -X POST https://itam-next-js.vercel.app/api/itam/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo_admin","password":"demo123"}' | jq -r .token)

# Create WO — ต้องได้ 201
curl -s -X POST https://itam-next-js.vercel.app/api/work-orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"subject":"Test","reporterName":"Test","tel":"0000000000","submissionSource":"session"}' \
  -w "\nHTTP: %{http_code}\n"
# คาดหวัง: HTTP 201 (ไม่ใช่ 403)
```

---

## 🟠 BUG 3 (P1): /api/users ตอบ 401

### อาการ:
- ส่ง `Authorization: Bearer <JWT>` → 401

### สาเหตุ:
`src/app/api/users/route.ts` ใช้ session cookie auth แทน JWT

### ไฟล์ที่ต้องแก้:
`src/app/api/users/route.ts`

### วิธีแก้:
```diff
- import { getCurrentUser } from '@/lib/auth-session'
+ import { requireAuth } from '@/lib/auth-middleware'

  export async function GET(req: NextRequest) {
+   const auth = await requireAuth(req, 'USER_MANAGE')
+   if (!auth.ok) {
+     return NextResponse.json({ error: auth.error }, { status: auth.status })
+   }
-   const user = await getCurrentUser(req)
-   if (!user) {
-     return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
-   }
    // ... rest of handler
  }
```

---

## 🟠 BUG 4 (P1): /api/users/pending ตอบ 405

### อาการ:
- `GET /api/users/pending` → 405 Method Not Allowed

### สาเหตุ:
`src/app/api/users/pending/route.ts` ไม่มี GET handler

### วิธีแก้:
เพิ่ม GET handler:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'USER_MANAGE')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  
  const pendingUsers = await db.user.findMany({
    where: { active: false },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      department: true,
      createdAt: true,
    },
  })
  
  return NextResponse.json({ users: pendingUsers })
}
```

---

## 🟠 BUG 5 (P1): Device Edit ตอบ 405

### อาการ:
- `PATCH /api/devices/{id}` → 405 Method Not Allowed

### สาเหตุ:
`src/app/api/devices/[id]/route.ts` ไม่มี PATCH handler

### วิธีแก้:
เพิ่ม PATCH handler:
```typescript
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req, 'DEVICE_EDIT')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  
  const { id } = await params
  const body = await req.json()
  
  const allowedFields = [
    'name', 'brand', 'model', 'type', 'serialNumber', 'status',
    'site', 'department', 'departmentCode', 'location', 'building',
    'floor', 'room', 'vendor', 'contractNo', 'remark',
    'purchaseDate', 'purchasePrice', 'warrantyEnd', 'meterRequired',
    'meterMode', 'ip', 'mac', 'displayLabel'
  ]
  
  const updateData: Record<string, unknown> = {}
  for (const f of allowedFields) {
    if (body[f] !== undefined) updateData[f] = body[f]
  }
  
  const updated = await db.device.update({
    where: { id },
    data: updateData,
  })
  
  return NextResponse.json({ data: updated })
}
```

---

## 🟡 BUG 6 (P2): Cron daily-report ตอบ 500

### อาการ:
- `GET /api/cron/daily-report` → 500

### สาเหตุ:
ไม่ได้ตั้ง `CRON_SECRET` env var ใน Vercel

### วิธีแก้:
ตั้ง env var ใน Vercel:
```
CRON_SECRET=<random-string>
```

---

## 📋 ลำดับการแก้:

```
1. BUG 1 (site visibility) → แก้ก่อน — ทำให้ staff/viewer เห็นข้อมูล
2. BUG 2 (Create WO 403) → แก้ต่อ — ทำให้สร้างงานได้
3. BUG 3 + 4 (Settings) → แก้ทีหลัง
4. BUG 5 (Device Edit) → แก้ทีหลัง
5. BUG 6 (Cron) → ตั้ง env var
```

## ✅ หลังแก้ BUG 1 + BUG 2 → ระบบใช้งานได้ทันที

---

## 🧪 ทดสอบหลังแก้ทุก bug:

```bash
# 1. Login ทุก user
for user in demo_admin demo_staff demo_viewer; do
  TOKEN=$(curl -s -X POST https://itam-next-js.vercel.app/api/itam/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$user\",\"password\":\"demo123\"}" | jq -r .token)
  
  echo "=== $user ==="
  
  # 2. ตรวจ devices > 0
  curl -s "https://itam-next-js.vercel.app/api/devices?limit=1" \
    -H "Authorization: Bearer $TOKEN" | jq '.pagination.total'
  
  # 3. ตรวจ WO > 0
  curl -s "https://itam-next-js.vercel.app/api/work-orders?page=1&pageSize=1" \
    -H "Authorization: Bearer $TOKEN" | jq '.pagination.total'
  
  # 4. Create WO (ต้องได้ 201)
  curl -s -X POST https://itam-next-js.vercel.app/api/work-orders \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"subject\":\"Test by $user\",\"reporterName\":\"Test\",\"tel\":\"0000000000\",\"submissionSource\":\"session\"}" \
    -w "\nHTTP: %{http_code}\n"
done
```
