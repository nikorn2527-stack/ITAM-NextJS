# ITAM NextJS — Module Architecture Migration Guide

> เป้าหมาย: ยกระดับโครงสร้างจาก page/component/API ที่เติบโตแบบ feature-by-feature ไปสู่ **modular architecture ที่วัดผลได้ 95%+** โดยยังคง behavior เดิม, ลด cross-module coupling, และทำให้ทีมสามารถเปิด/ปิด module ได้อย่างปลอดภัย

## 1. สถานะปัจจุบัน

### Codebase snapshot

| รายการ | ค่า ณ commit เริ่มต้น |
| --- | ---: |
| Git branch | `work` |
| Starting commit | `8a0859b` |
| Files ใน repo (ไม่รวม `node_modules`, `.next`) | 574 |
| TypeScript/TSX files | 498 |
| API route handlers (`src/app/api/**/route.ts`) | 184 |
| React components (`src/components/**/*.tsx`) | 141 |
| Prisma models | 36 |

### Observations

- โค้ดหลักยังอยู่ในแนว **app-router + shared components + API routes** มากกว่า module boundary ที่ชัดเจน
- มี domain สำคัญหลายตัวปะปนใน `src/app/api`, `src/components/itam`, `src/lib`, และ `src/store`
- มี pre-commit hook แล้วที่ช่วยป้องกัน regression สำคัญ:
  - Prisma field case checker ผ่าน `scripts/check-prisma-fields.mjs --quiet`
  - TypeScript syntax check ผ่าน `npx tsc --noEmit --skipLibCheck`
- Migration ควรทำแบบ incremental เพื่อไม่ให้กระทบ QA pages เดิม โดยเริ่มจาก skeleton/manifest ก่อน แล้วค่อยย้าย DB access → service → UI

### Current setup commands

```bash
git clone https://github.com/nikorn2527-stack/ITAM-NextJS.git
cd ITAM-NextJS
git checkout 8a0859b
bun install
bun run db:push
node scripts/create-demo-users.js
bun scripts/seed-authorization-catalog.ts
git config core.hooksPath .githooks
bun run dev
```

## 2. Module Dependency Graph

### 4-layer target

```text
[Layer 4] App Shell / Composition
  └─ src/app, src/components/itam/sidebar.tsx, src/config/modules.ts

[Layer 3] Feature UI Modules
  └─ src/modules/<module>/components, pages, hooks

[Layer 2] Domain Services
  └─ src/modules/<module>/services, contracts, events

[Layer 1] Data Access / Infrastructure
  └─ src/modules/<module>/repositories, src/lib/db, adapters
```

### 16 target modules

| # | Module | Responsibility | Depends on | Can disable? |
| ---: | --- | --- | --- | --- |
| 1 | `auth` | login/session/RBAC/site scope | core | No |
| 2 | `dashboard` | KPI + landing summary | devices, meter, stock, work-orders | Yes |
| 3 | `devices` | asset lifecycle, transfer, search, import/export | auth, audit, sites | No |
| 4 | `meter` | readings, cycles, snapshots, paper usage | devices, sites, audit | Yes |
| 5 | `paper-analytics` | usage analytics/cost projection | meter, devices | Yes |
| 6 | `work-orders` | repair requests, assignment, completion | devices, stock, notifications | Yes |
| 7 | `stock` | items, transactions, approvals | auth, audit, sites | Yes |
| 8 | `reports` | unified/monthly/report hub/export | all read-only services | Yes |
| 9 | `settings` | app config, org profile, rates | auth, audit | No |
| 10 | `users` | user CRUD and grants | auth, sites, audit | No |
| 11 | `sites` | site catalog and site-level metadata | auth | No |
| 12 | `templates` | sticker/doc/work-order templates | devices, work-orders | Yes |
| 13 | `import` | CSV/Excel import pipelines | devices, stock, sites | Yes |
| 14 | `audit` | audit log/history | auth | No |
| 15 | `notifications` | LINE/Telegram/email/in-app | settings, users | Yes |
| 16 | `mobile` | phone-first repair/meter/stock flows | work-orders, meter, stock | Yes |

### Allowed dependency direction

```text
app-shell -> modules/*/ui -> modules/*/services -> modules/*/repositories -> db
reports   -> modules/*/services read APIs only
module A  -> module B contracts only, never B repositories
```

## 3. Target folder structure

```text
src/
  app/
    api/                         # thin route handlers only after migration
    page.tsx                     # composition only
  config/
    modules.ts                   # module manifest + enable/disable
  modules/
    devices/
      index.ts                   # barrel export (public API)
      manifest.ts                # optional module-local manifest metadata
      contracts/
        device.types.ts
        device.filters.ts
        device.events.ts
      repositories/
        device.repository.ts
        device-transfer.repository.ts
      services/
        device.service.ts
        device-import.service.ts
        device-export.service.ts
      components/
        devices-page.tsx
        device-detail-sheet.tsx
      hooks/
        use-devices.ts
      api/
        route-handlers.ts        # handlers imported by src/app/api wrappers
      tests/
        device.service.test.ts
        device.repository.test.ts
        device.boundary.test.ts
    meter/
      index.ts
      contracts/
      repositories/
      services/
      components/
      hooks/
      api/
      tests/
    work-orders/
      index.ts
      contracts/
      repositories/
      services/
      components/
      hooks/
      api/
      tests/
  lib/
    db.ts                        # db singleton only; no domain logic
    module-boundary.ts           # helpers used by tests/lint rules
```

### Migration principle

- `src/app/api/**/route.ts` ต้องเหลือเป็น **transport adapter**: parse request → call service → return response
- `src/components/itam/**` ค่อย ๆ กลายเป็น re-export wrapper หรือย้ายเข้า `src/modules/<name>/components`
- `src/lib/**` ควรเหลือเฉพาะ shared infra ที่ไม่รู้จัก domain เช่น db, utils, auth primitives, logger

## 4. Module Interface (Contract)

### Barrel export rule

ทุก module ต้องมี `src/modules/<name>/index.ts` เป็น public API เดียวของ module นั้น

```ts
// src/modules/devices/index.ts
export type {
  DeviceDTO,
  DeviceFilters,
  DeviceStatus,
} from './contracts/device.types'
export { createDeviceService } from './services/device.service'
export { DevicesPage } from './components/devices-page'
```

ห้าม module อื่น import แบบ deep path เช่น:

```ts
// ❌ ห้าม
import { DeviceRepository } from '@/modules/devices/repositories/device.repository'

// ✅ ให้ใช้ public contract/service
import { createDeviceService, type DeviceDTO } from '@/modules/devices'
```

### Service pattern

```ts
// src/modules/devices/services/device.service.ts
import type { AuditService } from '@/modules/audit'
import type { DeviceRepository } from '../repositories/device.repository'
import type { DeviceDTO, DeviceFilters } from '../contracts/device.types'

export interface DeviceService {
  list(filters: DeviceFilters): Promise<DeviceDTO[]>
  getById(id: string): Promise<DeviceDTO | null>
  retire(id: string, actor: string): Promise<DeviceDTO>
}

export function createDeviceService(deps: {
  devices: DeviceRepository
  audit: AuditService
}): DeviceService {
  return {
    async list(filters) {
      return deps.devices.findMany(filters)
    },
    async getById(id) {
      return deps.devices.findById(id)
    },
    async retire(id, actor) {
      const device = await deps.devices.updateStatus(id, 'Retired')
      await deps.audit.record({ actor, entity: 'Device', entityId: id, action: 'RETIRE' })
      return device
    },
  }
}
```

### Repository pattern

```ts
// src/modules/devices/repositories/device.repository.ts
import type { PrismaClient } from '@prisma/client'
import type { DeviceDTO, DeviceFilters } from '../contracts/device.types'

export interface DeviceRepository {
  findMany(filters: DeviceFilters): Promise<DeviceDTO[]>
  findById(id: string): Promise<DeviceDTO | null>
  updateStatus(id: string, status: string): Promise<DeviceDTO>
}

export function createPrismaDeviceRepository(db: PrismaClient): DeviceRepository {
  return {
    async findMany(filters) {
      return db.device.findMany({ where: buildDeviceWhere(filters) })
    },
    async findById(id) {
      return db.device.findUnique({ where: { id } })
    },
    async updateStatus(id, status) {
      return db.device.update({ where: { id }, data: { status } })
    },
  }
}
```

## 5. Cross-Module Rules

1. **Service-only write rule** — module อื่นเขียนข้อมูลได้ผ่าน service ของ module เจ้าของเท่านั้น ห้าม import repository ข้าม module
2. **Interface-only dependency rule** — ถ้าต้องพึ่งพา module อื่น ให้ import จาก barrel export (`@/modules/<name>`) เท่านั้น
3. **Aggregation-read rule** — reports/dashboard อ่านข้าม module ได้เฉพาะ read service/DTO ที่ประกาศไว้ ห้าม query Prisma ตรง
4. **UI-in-module rule** — UI ที่มี business behavior ของ module ใด ต้องอยู่ใน `src/modules/<name>/components`; shared UI แบบ generic เท่านั้นที่อยู่ `src/components/ui`

### Enforcement checklist

```bash
# ห้าม direct db import นอก repositories/API migration exceptions
rg "from '@/lib/db'|from \"@/lib/db\"" src/modules src/components src/app/api

# ห้าม deep import ข้าม module
rg "@/modules/.+/(repositories|services|components|hooks)/" src/modules

# ห้าม Prisma client ใน service tests เว้นแต่ repository tests
rg "PrismaClient|db\." src/modules/*/services src/modules/*/components
```

## 6. Module Manifest

สร้าง `src/config/modules.ts` เพื่อควบคุม enable/disable และ dependency validation

```ts
export type ModuleName =
  | 'auth'
  | 'dashboard'
  | 'devices'
  | 'meter'
  | 'paper-analytics'
  | 'work-orders'
  | 'stock'
  | 'reports'
  | 'settings'
  | 'users'
  | 'sites'
  | 'templates'
  | 'import'
  | 'audit'
  | 'notifications'
  | 'mobile'

export interface ModuleManifestItem {
  name: ModuleName
  enabled: boolean
  required: boolean
  dependencies: ModuleName[]
  routeIds: string[]
  navLabel?: string
}

export const MODULES: Record<ModuleName, ModuleManifestItem> = {
  auth: { name: 'auth', enabled: true, required: true, dependencies: [], routeIds: [] },
  audit: { name: 'audit', enabled: true, required: true, dependencies: ['auth'], routeIds: ['itam-audit'] },
  sites: { name: 'sites', enabled: true, required: true, dependencies: ['auth'], routeIds: [] },
  users: { name: 'users', enabled: true, required: true, dependencies: ['auth', 'sites', 'audit'], routeIds: [] },
  settings: { name: 'settings', enabled: true, required: true, dependencies: ['auth', 'audit'], routeIds: ['itam-settings', 'settings-v2'] },
  devices: { name: 'devices', enabled: true, required: true, dependencies: ['auth', 'sites', 'audit'], routeIds: ['itam-devices', 'devices-page'] },
  meter: { name: 'meter', enabled: true, required: false, dependencies: ['devices', 'sites', 'audit'], routeIds: ['itam-meter', 'itam-meter-keyboard', 'meter-page'] },
  stock: { name: 'stock', enabled: true, required: false, dependencies: ['auth', 'sites', 'audit'], routeIds: ['itam-stock', 'stock'] },
  'work-orders': { name: 'work-orders', enabled: true, required: false, dependencies: ['devices', 'stock', 'notifications'], routeIds: ['itam-work-orders', 'work-orders'] },
  'paper-analytics': { name: 'paper-analytics', enabled: true, required: false, dependencies: ['meter', 'devices'], routeIds: ['itam-paper-analytics', 'paper-analytics-page'] },
  reports: { name: 'reports', enabled: true, required: false, dependencies: ['devices', 'meter', 'stock', 'work-orders'], routeIds: ['reports-hub', 'monthly-report'] },
  templates: { name: 'templates', enabled: true, required: false, dependencies: ['devices', 'work-orders'], routeIds: ['templates'] },
  import: { name: 'import', enabled: true, required: false, dependencies: ['devices', 'stock', 'sites'], routeIds: ['import'] },
  notifications: { name: 'notifications', enabled: true, required: false, dependencies: ['settings', 'users'], routeIds: [] },
  dashboard: { name: 'dashboard', enabled: true, required: false, dependencies: ['devices', 'meter', 'stock', 'work-orders'], routeIds: ['dashboard', 'itam'] },
  mobile: { name: 'mobile', enabled: true, required: false, dependencies: ['work-orders', 'meter', 'stock'], routeIds: ['mobile'] },
}
```

### Runtime rules

- ถ้า module ถูก disable ให้ sidebar ซ่อน nav item และ direct route แสดง “Module disabled” state
- validate dependency graph ตอน app boot หรือ test: module ที่ enabled ต้องมี dependencies enabled ทั้งหมด
- required modules (`auth`, `settings`, `users`, `sites`, `audit`, `devices`) ไม่ควร disable ใน production

## 7. Migration Plan

| Phase | ระยะเวลา | เป้าหมาย | ผลลัพธ์ |
| --- | --- | --- | --- |
| Phase 1 | Week 1 | Module skeleton + manifest + sidebar | Folder structure พร้อม, manifest บังคับ nav visibility ได้ |
| Phase 2 | Week 2 | Repository pattern (ย้าย db access) | ESLint/guard บังคับ — 0 direct db import นอก repositories |
| Phase 3 | Week 3 | Service layer (ย้าย business logic) | Cross-module เรียกผ่าน service contracts |
| Phase 4 | Week 4-6 | UI migration + boundary enforcement | 95%+ modular score และ QA pages ยังผ่าน |

### Phase 1 — Skeleton + manifest + sidebar

- สร้าง `src/modules/<name>` สำหรับ 16 modules
- เพิ่ม `src/config/modules.ts`
- map sidebar nav → manifest routeIds
- เพิ่ม test `modules.manifest.test.ts` ตรวจ dependency graph ไม่มี cycle
- Acceptance: disable module แล้ว nav หาย, direct route ไม่ crash

### Phase 2 — Repository pattern

- เริ่มจาก modules ROI สูง: `devices`, `meter`, `stock`, `work-orders`, `reports`
- ย้าย Prisma query ไป `repositories`
- API route เรียก repository ผ่าน service factory เท่านั้น
- เพิ่ม guard script ตรวจ direct `@/lib/db` import
- Acceptance: 0 direct db import ใน UI/service, repository tests ผ่าน

### Phase 3 — Service layer

- แยก business logic จาก route/component ไป service
- ประกาศ DTO/contract ชัดเจน
- Cross-module write ต้องผ่าน service เจ้าของ module
- Acceptance: reports/dashboard ใช้ read service ไม่ query db ตรง

### Phase 4 — UI migration + boundary enforcement

- ย้าย component จาก `src/components/itam` เข้า module เจ้าของ
- เหลือ wrapper/re-export เฉพาะเพื่อ backward compatibility
- เพิ่ม ESLint boundary rules หรือ custom script ใน pre-commit/CI
- Acceptance: 95%+ checklist, regression QA pages ผ่าน, build/lint ผ่าน

## 8. Testing Strategy

### Per-module tests

- Repository tests: query mapping, where filters, transaction behavior
- Service tests: validation, authorization, audit side effects, domain rules
- Component tests: loading/empty/error states, controlled tabs, refresh toast
- Contract tests: DTO shape และ backward compatibility

### Integration tests

- API route tests: request parsing + auth + service output
- Cross-module flow tests:
  - device transfer → audit log
  - meter reading → device latest meter update
  - stock out → work-order parts request
  - report hub → read services from devices/meter/stock/work-orders

### Isolation tests

- Disable each optional module and verify:
  - sidebar hides menu
  - direct navigation shows disabled state
  - dependent modules fail fast with readable message
  - no dynamic import crash

### Required test commands

```bash
node scripts/check-prisma-fields.mjs --quiet
npx tsc --noEmit --skipLibCheck
bun run lint
bun test
```

## 9. Success Metrics — 95%+ checklist

| Category | Metric | Target |
| --- | --- | ---: |
| Structural | 16 modules have `index.ts`, `contracts`, `services`, `repositories` as needed | 95%+ |
| Structural | No cross-module deep imports | 100% |
| Structural | No direct db import outside repositories/approved adapters | 100% |
| Behavioral | Existing QA flows remain functional | 95%+ pass |
| Behavioral | Optional modules disable without app crash | 100% |
| Functional | Reports/dashboard use aggregation read services | 95%+ |
| Functional | Admin/site scope behavior unchanged after migration | 100% |
| Quality | TypeScript check passes | 100% |
| Quality | Lint/boundary guard passes | 100% |
| Quality | New module tests cover services/repositories | 80%+ meaningful coverage |

### 95% scoring formula

```text
Modular Score =
  30% structural boundary
+ 25% service/repository separation
+ 20% behavior regression pass
+ 15% module enable/disable safety
+ 10% tests + documentation completeness
```


### 100% readiness gates

ระดับ 95%+ คือ “ใช้งานจริงได้และลด regression ได้ชัดเจน” แต่ถ้าต้องการเรียกว่า **100% modular-ready** ต้องเพิ่ม gates ที่ตรวจแบบอัตโนมัติและไม่มี exception ค้างอยู่ ดังนี้

| Gate | ต้องผ่านแบบ 100% | วิธีวัด |
| --- | --- | --- |
| Boundary enforcement | ไม่มี deep import ข้าม module และไม่มี direct db import นอก repository/approved adapter | CI job `module-boundary` fail ทันทีเมื่อพบ violation |
| Manifest integrity | ทุก route/nav/API ที่เป็น feature ต้องผูกกับ module manifest | test ตรวจ `routeIds`, sidebar mapping, disabled fallback |
| Ownership | ทุก module มี owner, README, public API, test command, rollback note | `docs/modules/<name>/README.md` ครบทุก module |
| Contract stability | Public DTO/service interfaces versioned หรือมี compatibility note | contract tests + changelog ต่อ module |
| Disable safety | optional modules ทั้งหมด disable ได้โดย app ไม่ crash | isolation tests loop ทุก optional module |
| Data access isolation | Prisma query อยู่ใน repository เท่านั้น ยกเว้น migration adapter ที่มี TODO/expiry | static scan + allowlist ที่มีวันหมดอายุ |
| Observability | service สำคัญมี audit/log/error boundary ที่สื่อสารได้ | integration tests ตรวจ audit/log side effects |
| QA parity | QA checklist ทุกหน้า core ≥ 95%, blocker = 0, critical = 0 | QA tracker + regression evidence ต่อ PR |
| CI completeness | `tsc`, lint, unit, integration, boundary, manifest tests ผ่านใน pipeline | required GitHub checks |
| Documentation sync | เอกสาร architecture, module README, handover checklist ตรงกับ code ล่าสุด | docs check ใน PR template |

### What to add beyond this guide for 100%

1. **Create real enforcement scripts**
   - `scripts/check-module-boundaries.mjs`
   - `scripts/check-module-manifest.mjs`
   - เพิ่มเข้า `.githooks/pre-commit` และ CI
2. **Add actual manifest implementation**
   - สร้าง `src/config/modules.ts`
   - ให้ sidebar และ app-shell อ่านจาก manifest จริง ไม่ใช่ hard-coded เพียงอย่างเดียว
3. **Add module README template**
   - ทุก module ต้องมี: owner, public exports, dependencies, env/config, tests, rollback
4. **Add route/API inventory mapping**
   - map `src/app/api/**` และ `activePage` ทุกตัวเข้ากับ module
   - route ที่ยังไม่ map ถือว่า migration ยังไม่ 100%
5. **Add exception register**
   - ไฟล์เช่น `docs/modules/BOUNDARY-EXCEPTIONS.md`
   - ทุก exception ต้องมี owner + reason + expiry date
6. **Add rollback strategy per phase**
   - Phase 1 rollback = disable manifest usage
   - Phase 2 rollback = adapter calls old query path
   - Phase 3 rollback = service wrapper delegates legacy logic
   - Phase 4 rollback = re-export old component path

### 100% acceptance checklist

- [ ] `src/config/modules.ts` exists and covers all 16 modules
- [ ] every sidebar item maps to exactly one enabled module
- [ ] every optional module has a disabled fallback state
- [ ] every module has `index.ts` barrel export
- [ ] every module with DB access has `repositories/`
- [ ] every module with business rules has `services/`
- [ ] no module imports another module's `repositories`, `services`, `components`, or `hooks` by deep path
- [ ] no UI component imports `@/lib/db`
- [ ] no service imports Prisma directly unless it is explicitly an approved temporary adapter
- [ ] reports/dashboard use read service contracts only
- [ ] test suite includes manifest graph/cycle validation
- [ ] test suite includes optional-module isolation checks
- [ ] PR template requires module impact + boundary checklist
- [ ] CI marks TypeScript, lint, module-boundary, manifest, and regression tests as required checks
- [ ] QA blockers are zero before merging any phase PR

## 10. Risks & Mitigation

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Big-bang migration ทำให้ QA regression สูง | หน้าเดิมพังหลายจุด | ทำ incremental wrapper + route adapter, ย้ายทีละ module |
| Cross-module imports แอบเพิ่มระหว่าง migration | boundary เสียและแก้ยาก | เพิ่ม lint/guard ใน pre-commit และ CI ตั้งแต่ Phase 1 |
| Repository/service abstraction มากเกินไป | ทีมช้าลงและ boilerplate เยอะ | บังคับเฉพาะ module ที่มี business/data access จริง; shared UI ไม่ต้องมี service |
| Disable module แล้ว dependency พัง | app crash ตอน runtime | manifest dependency validation + disabled fallback component + isolation tests |

## 11. Handover Checklist

### Starting point

- Branch: `work`
- Starting commit: `8a0859b`
- First migration PR should branch from current work branch after QA blocker commit

### Setup checklist

```bash
git checkout work
git pull --ff-only origin work || true
bun install
bun run db:push
node scripts/create-demo-users.js
bun scripts/seed-authorization-catalog.ts
git config core.hooksPath .githooks
bun run dev
```

### Before opening each migration PR

- [ ] Update `docs/MODULE-ARCHITECTURE-GUIDE.md` if module rules change
- [ ] Add/adjust module manifest entry
- [ ] Add tests for module dependency/disable behavior
- [ ] Run `node scripts/check-prisma-fields.mjs --quiet`
- [ ] Run `npx tsc --noEmit --skipLibCheck`
- [ ] Run relevant module tests
- [ ] Verify no direct db imports outside repositories/approved adapters
- [ ] Verify no deep cross-module imports
- [ ] Include before/after QA notes in PR body

### Recommended first work packages

1. `ARCH-01`: create `src/config/modules.ts` + manifest graph test
2. `ARCH-02`: create skeleton folders and barrel exports for 16 modules
3. `ARCH-03`: wire sidebar visibility to manifest
4. `ARCH-04`: add boundary guard script for direct db/deep module imports
5. `ARCH-05`: migrate `devices` repository/service as reference module
