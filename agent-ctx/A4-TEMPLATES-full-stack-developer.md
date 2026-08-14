# Task A4-TEMPLATES — Template Editor System

Agent: full-stack-developer
Task ID: A4-TEMPLATES

## Goal
Build the Template Editor system (ข้อ 5) for the ITAM Next.js project.
Lets users create/manage document templates — separated by work type:
`sticker | pdf | work-order | stock-out | stock-in | purchase-order`

## Reference model (prisma/schema.prisma — DocumentTemplate)
- id, name, type, category?, content (String JSON), isActive, isDefault, createdAt, updatedAt

## Files to create
1. `src/app/api/templates/route.ts` — GET (list, optional ?type=) + POST (create)
2. `src/app/api/templates/[id]/route.ts` — GET + PUT + DELETE (block delete when isDefault)
3. `src/components/itam/templates-page.tsx` — `'use client'` `export function TemplatesPage()`

## Files to update
- `src/store/app-store.ts` — add `'templates'` to `ActivePage` union
- `src/components/itam/sidebar.tsx` — add nav item `{ page: 'templates', icon: '📄', label: 'เทมเพลต' }`
- `src/app/page.tsx` — import + render `TemplatesPage`

## Default templates (auto-seed on first load when a type has zero templates)
- sticker: `{"width":100,"height":50,"elements":[{"type":"text","content":"{assetCode}","x":5,"y":5,"fontSize":8}]}`
- pdf: `{"format":"A4","orientation":"landscape"}`
- work-order: `{"sections":["header","details","images","timeline"]}`
- stock-out: `{"sections":["header","items","total","signatures"]}`
- stock-in: `{"sections":["header","items","total","receiver"]}`
- purchase-order: `{"sections":["header","supplier","items","total","approver"]}`

## Patterns observed in existing code
- API routes use `NextRequest`/`NextResponse`, `db` from `@/lib/db`, `logAudit` from `@/lib/audit`
- `[id]` route params are `Promise<{ id: string }>` → awaited
- Client uses `@tanstack/react-query`, `sonner` toast, shadcn/ui components, framer-motion
- Thai labels throughout, orange (`#f97316`) accent

## Status
- DONE. All files created/updated.

## Verification
- `bun run lint` → exit 0, no errors.
- API verified live against dev server (before a prisma-client regen briefly
  paused the auto-run dev server):
  - `GET /api/templates` → 200, `{"templates":[]}`
  - `POST /api/templates` (isDefault:true) → 201, returns created template
  - `GET /api/templates?type=sticker` → 200 (filter works)
  - `DELETE` on a default template → 400 with Thai error (delete protection works)
  - `PUT` to unset isDefault → 200, then `DELETE` → 200 (cleanup successful)
- All 6 default-template definitions stored in `src/lib/templates.ts`
  (`DEFAULT_TEMPLATES`), seeded automatically by the UI on first load via the
  `useSeedDefaults()` hook (one POST per type that has zero templates).

## Notes for downstream agents
- `content` is stored as a JSON **string** in SQLite (per the Prisma schema).
  The API accepts either a string or a plain object (object is stringified).
  The UI editor round-trips pretty-printed JSON and validates live.
- Only one `isDefault=true` template is allowed per `type` — both POST and PUT
  clear other defaults of the same type before setting the new one.
- `DELETE` refuses when `isDefault=true` (returns 400 with a Thai message). To
  remove a default, first PUT `isDefault:false` (or set another as default).
