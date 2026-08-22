import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')
const settingsSource = readFileSync(
  resolve(root, 'src/components/itam/itam-settings.tsx'),
  'utf8',
)
const typesSource = readFileSync(
  resolve(root, 'src/components/itam/types.ts'),
  'utf8',
)
const updateRouteSource = readFileSync(
  resolve(root, 'src/app/api/itam/master-items/[id]/route.ts'),
  'utf8',
)
const legacySource = readFileSync(
  '/home/ubuntu/analysis/IT-Asset-Management/Code.gs',
  'utf8',
)
const legacyUiSource = readFileSync(
  '/home/ubuntu/analysis/IT-Asset-Management/index.html',
  'utf8',
)


describe('Master Item legacy parity boundary', () => {
  it('keeps the legacy Master_Items header contract as the source reference', () => {
    expect(legacySource).toContain("Master_Items: ['Category_Key','Item_Value','Description','Display_Order','Active']")
    expect(legacySource).toContain("function readMasterItemsSheet()")
    expect(legacySource).toContain('AllowedSites')
    expect(legacySource).toContain('DepartmentCode')
  })

  it('keeps the legacy table columns and filters visible in the active UI', () => {
    expect(legacyUiSource).toContain('master-filter-category')
    expect(legacyUiSource).toContain('master-filter-status')
    expect(legacyUiSource).toContain('master-search')
    expect(legacyUiSource).toContain('Allowed Sites')
    expect(settingsSource).toContain('Active เท่านั้น')
    expect(settingsSource).toContain('ข้อมูลเพิ่มเติม')
    expect(settingsSource).toContain('Dept Code')
    expect(settingsSource).toContain('Allowed Sites')
    expect(settingsSource).toContain("queryKey: ['itam-master']")
  })

  it('supports the legacy category vocabulary without removing Type compatibility', () => {
    for (const category of ['Site', 'Building', 'Floor', 'Department', 'DepartmentCode', 'DeviceType', 'Brand', 'Model', 'Status', 'Location', 'Contract', 'Vendor', 'DeviceGroup', 'CostCenter']) {
      expect(typesSource).toContain(`'${category}'`)
    }
    expect(typesSource).toContain("'Type'")
    expect(settingsSource).toContain("item.category === 'Type' ? 'DeviceType' : item.category")
  })

  it('preserves active status and legacy-compatible fields in the source contract', () => {
    expect(typesSource).toContain('active?: boolean')
    expect(typesSource).toContain('groupName?: string | null')
    expect(typesSource).toContain('allowedSites?: string | null')
    expect(typesSource).toContain('departmentCode?: string | null')
    expect(settingsSource).toContain('parentRef:')
    expect(settingsSource).toContain('siteCode:')
    expect(settingsSource).toContain('active: true')
    expect(updateRouteSource).toContain('const value = body.value !== undefined ? body.value : body.label')
    expect(updateRouteSource).toContain('parentRef: body.parentRef !== undefined')
    expect(updateRouteSource).toContain('active: body.active !== undefined')
  })

  it('does not introduce a database migration or a MasterItem schema change', () => {
    expect(settingsSource).not.toContain('prisma')
    expect(typesSource).not.toContain('db.masterItem')
    expect(updateRouteSource).not.toContain('prisma migrate')
  })
})
