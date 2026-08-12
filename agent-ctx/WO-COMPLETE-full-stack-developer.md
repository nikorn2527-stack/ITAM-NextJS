# Task WO-COMPLETE — WorkOrder (แจ้งซ่อม) System Completion

**Agent:** full-stack-developer
**Task ID:** WO-COMPLETE
**Date:** 2025
**Parent project:** /home/z/my-project

## Goal

Complete the WorkOrder (แจ้งซ่อม) system for the Next.js ITAM project. The
legacy Services app had 7 features that needed to be replicated:

1. Guest reporting with contact-directory identity verification
2. External work orders (งานนอก — clients not in the system)
3. Subject options (หัวข้อปัญหา) with grouped dropdown + auto-set priority
4. Resolution options (ผลการแก้ไข) when completing a work order
5. Reporter self-edit (only when status = PENDING)
6. Complete work order with resolution + picAfter
7. Work order detail dialog showing ALL fields including timeline, images,
   external info, edit-unlock info, assignment, resolution, cancel reason

## Files Created / Modified

| File | Action | Notes |
|------|--------|-------|
| `prisma/schema.prisma` | **Modified** | Added `resolution String?` + `resolutionGroup String?` to WorkOrder |
| `src/lib/guest-validation.ts` | **Created** | `validateGuestContact()`, `loadContactDirectory()`, `normalizePhone()`, `normalizeName()` |
| `src/app/api/settings/options/route.ts` | **Created** | GET returns `{ subjects, resolutions }` from AppSetting (with 35-subject / 43-resolution defaults) |
| `src/app/api/work-orders/route.ts` | **Modified** | POST now validates guest contact for guest-submitted (non-external) WOs; supports `externalMeta` + `isExternal`; canonicalizes reporter info from contactDirectory |
| `src/app/api/work-orders/[id]/complete/route.ts` | **Modified** | POST now accepts `resolution` + `resolutionGroup`; writes them to WorkOrder |
| `src/app/api/work-orders/[id]/reporter-edit/route.ts` | **Created** | PUT — verifies guest identity then allows editing subject/building/location/details/tel while PENDING |
| `src/components/itam/work-orders-page.tsx` | **Replaced** | Full UI overhaul: external mode toggle, grouped subject dropdown, resolution picker on complete, full detail view, reporter-edit dialog |

## Implementation Details

### `guest-validation.ts`
- `loadContactDirectory()` reads the JSON-stringified array from AppSetting
  key `contactDirectory`. Format: `[{full_name, phone_primary, employee_code, department, active}]`.
  Also tolerates `phone` and `employeeCode` aliases.
- `normalizePhone()` strips non-digits and converts `+66`/leading `66` to `0`.
- `normalizeName()` lower-cases + collapses whitespace.
- `validateGuestContact({name, phone, employeeCode?})` requires both name +
  phone, skips inactive rows, matches case-insensitive name + digit-only
  phone, optionally narrows by employee_code. Returns canonical name/phone/
  code/department on success; returns a Thai error message on failure.

### `settings/options` route
- Reads AppSetting keys `subjectOptions` and `resolutionOptions`.
- Each supports both flat (`{group, value, default_priority}`) and nested
  (`{group, options: [...]}`) shapes.
- Falls back to `DEFAULT_SUBJECTS` (35 items, 4 groups: อาการทั่วไป/Printer/
  Network/อื่นๆ) and `DEFAULT_RESOLUTIONS` (43 items, 5 groups: ซ่อมสำเร็จ/
  เปลี่ยนอะไหล่/ปรับแต่ง-ตั้งค่า/ส่งซ่อมภายนอก/อื่นๆ) when unset.
- Validates `default_priority` against `{ปกติ, ปานกลาง, สูง, ด่วน}`.

### `POST /api/work-orders` updates
- For `submissionSource='guest'` (default) and non-external WOs: validates
  guest contact; on failure returns 403 with the Thai error message. On
  success, the WO's reporter info is canonicalized from the directory
  (so the stored name/phone matches the directory's casing & format).
- For `isExternal=true`/`externalMeta` provided: requires `clientName`,
  stores the normalized JSON in `externalMeta`. Skips guest validation
  (these are off-site jobs for clients NOT in the system).
- `skipGuestValidation=true` can be passed to bypass (used by the external
  path automatically).

### `PUT /api/work-orders/[id]/reporter-edit`
- Only allowed when `status === 'PENDING'`.
- Body requires `verifyName` + `verifyPhone` (and optional `employeeCode`).
- Re-validates against contactDirectory AND requires the verified identity
  to match the WO's stored reporter (so a guest can only edit their own WO).
- Editable fields: `subject, building, location, details, tel`.
- Writes a system message "ผู้แจ้งแก้ไขรายละเอียดใบงานเอง" + AuditLog
  with `action=WO_REPORTER_EDIT`.

### `POST /api/work-orders/[id]/complete` updates
- New optional body fields: `resolution`, `resolutionGroup`.
- Stored on the WorkOrder row; included in the audit detail and the
  system message: `ปิดงานเรียบร้อย — ผลการแก้ไข: <resolution> (<note>)`.

### UI overhaul (`work-orders-page.tsx`)
- WorkOrder type extended with `externalMeta`, `resolution`,
  `resolutionGroup`, `editUnlockActive/By/At/Note`, `acceptStatus`,
  `assignedBy`.
- New `optionsQuery` fetches `/api/settings/options` once (5min stale).
- CreateWorkOrderDialog:
  - Switch toggle for "ลูกค้าภายนอก / นอกสถานที่".
  - Subject is a grouped `<Select>` (with `SelectGroup` + `SelectLabel`);
    selecting a subject auto-sets `priority` from the option's
    `default_priority` (shown as a hint text below).
  - Internal mode: building/location inputs + device lookup (debounced
    fetch to `/api/devices?search=...`) that auto-fills building/location.
  - External mode: clientName, place, contactPhone, multi-S/N input
    (Enter to add, X to remove).
  - Optional picBefore upload with client-side canvas compression
    (`compressImage()` resizes to ≤1280px and JPEG-qualities down to fit
    ≤1MB).
- WorkOrderCard: shows "งานนอก" badge + external client name when applicable.
- WorkOrderDetailContent: comprehensive view of every field:
  - External block (teal) with clientName/place/contactPhone/serials
  - Info grid: building, location, reporter, tel, employeeCode, device,
    assignedTo, assignedAt, assignedBy, workCompletedAt, closedAt
  - Assignment note + Details + Admin note + Resolution (emerald box
    with group chip) + Cancel reason + Edit-unlock info
  - Images (before/onsite/after)
  - Timeline (created → assigned → completed → cancelled)
  - Chat (with reporter/admin/system bubbles)
- Reporter Edit button (only when `status === 'PENDING'`) opens a dialog
  that requires name+phone verification and lets the user edit
  subject/building/location/details/tel.
- Complete dialog now includes a grouped Resolution `<Select>` and a
  picAfter upload button.
- File is `~1700 lines` and still uses TanStack Query, sonner toasts,
  framer-motion, shadcn/ui components throughout.

## Verification

- `bun run db:push` → DB schema in sync (added 2 nullable columns;
  `--accept-data-loss` flag preserved; no data loss occurred).
- `bun run lint` → **0 errors, 0 warnings** ✅
- Prisma client regenerated and now exposes `WorkOrder.resolution` +
  `WorkOrder.resolutionGroup` (verified via grep on `index.d.ts`).
- Dev server log shows successful compile ("✓ Compiled in 1077ms") with
  no errors related to the new files. Pre-existing
  `/api/cost-analytics` PrismaClientValidationError (unknown arg `date`)
  is unrelated to this task and was already failing before — left as-is.

## Decisions / Notes

- `subjectOptions` / `resolutionOptions` AppSetting keys are not seeded by
  default — the API returns built-in defaults when the keys are missing,
  so the UI works out-of-the-box. Admins can override by PUTting to
  `/api/settings` with the same keys.
- The `contactDirectory` AppSetting is also not seeded — admin must add
  entries before guests can submit. Without it, `validateGuestContact`
  returns "ยังไม่มีข้อมูลผู้ติดต่อในระบบ" with a 403. This mirrors the
  legacy Services-app behavior.
- For external WOs we DO NOT require guest verification — the staff
  filling the form is the reporter.
- Reporter-edit dialog performs double verification: (1) name+phone must
  pass `validateGuestContact`, AND (2) the canonical name+phone must
  equal the WO's stored `reporterName`/`tel`. This prevents a different
  user (with a valid directory entry) from editing someone else's WO.
- Image compression runs only on the client (canvas). If the source is
  already small enough (<1MB), the original base64 is kept as-is.
- The subject dropdown has a "— ระบุเอง —" option (`__custom__`) that
  reveals a free-text input for one-off subjects not in the directory.
- `editUnlockActive/By/At/Note` are surfaced in the detail view but not
  editable from this UI — admin-only unlock flow is out of scope for
  this task; the schema and audit hooks are already in place.

## Files affected (summary)
- `prisma/schema.prisma` (+3 lines)
- `src/lib/guest-validation.ts` (new, ~180 lines)
- `src/app/api/settings/options/route.ts` (new, ~260 lines)
- `src/app/api/work-orders/route.ts` (modified POST)
- `src/app/api/work-orders/[id]/complete/route.ts` (modified POST)
- `src/app/api/work-orders/[id]/reporter-edit/route.ts` (new, ~150 lines)
- `src/components/itam/work-orders-page.tsx` (rewritten, ~1700 lines)
