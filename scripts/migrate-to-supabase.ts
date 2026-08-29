import { PrismaClient } from '@prisma/client'
import Database from 'better-sqlite3'

const db = new Database('/home/z/my-project/db/custom.db', { readonly: true })
const supabase = new PrismaClient()

function getAll(table: string): any[] {
  try { return db.prepare(`SELECT * FROM "${table}"`).all() } catch { return [] }
}

function fixDates(row: any, dateFields: string[] = ['createdAt', 'updatedAt']): any {
  const out = { ...row }
  for (const f of dateFields) {
    if (f in out && out[f] !== null && typeof out[f] === 'number') {
      out[f] = new Date(out[f])
    }
  }
  return out
}

function convertTypes(row: any, boolFields: string[] = [], intFields: string[] = [], floatFields: string[] = [], dateFields: string[] = ['createdAt', 'updatedAt']): any {
  const out = { ...row }
  for (const f of boolFields) if (f in out) out[f] = Boolean(out[f])
  for (const f of intFields) if (f in out && out[f] !== null) out[f] = Number(out[f])
  for (const f of floatFields) if (f in out && out[f] !== null) out[f] = Number(out[f])
  for (const f of dateFields) if (f in out && out[f] !== null && typeof out[f] === 'number') out[f] = new Date(out[f])
  return out
}

async function main() {
  console.log('📦 Migrating SQLite → Supabase...')

  // 1. Devices
  const devices = getAll('Device')
  console.log(`Devices: ${devices.length}`)
  for (let i = 0; i < devices.length; i++) {
    try {
      const d = convertTypes(devices[i], ['meterRequired'], ['warrantyMonths','lastMeterBw','lastMeterColor','usefulLife'], ['purchasePrice','salvageValue'])
      await supabase.device.upsert({ where: { assetCode: d.assetCode }, create: d, update: d })
    } catch (e) { if (i < 2) console.log('  err:', (e as Error).message.slice(-100)) }
    if ((i+1) % 500 === 0) console.log(`  ... ${i+1}/${devices.length}`)
  }

  // 2. WorkOrders
  const wos = getAll('WorkOrder')
  console.log(`WorkOrders: ${wos.length}`)
  for (let i = 0; i < wos.length; i++) {
    try {
      const w = convertTypes(wos[i], ['trackable','editUnlockActive'], [], [], ['createdAt','updatedAt','assignedAt','workCompletedAt','closedAt','canceledAt','editUnlockAt','editUnlockUpdatedAt','editUnlockClosedAt'])
      await supabase.workOrder.upsert({ where: { id: w.id }, create: w, update: {} })
    } catch {}
    if ((i+1) % 1000 === 0) console.log(`  ... ${i+1}/${wos.length}`)
  }

  // 3. StockItems
  const items = getAll('StockItem')
  console.log(`StockItems: ${items.length}`)
  for (const s of items) {
    try {
      const si = convertTypes(s, ['active'], ['quantity','minQuantity','maxQuantity'], ['unitCost','totalValue'])
      await supabase.stockItem.upsert({ where: { productCode: si.productCode }, create: si, update: {} })
    } catch {}
  }

  // 4. StockTransactions
  const txns = getAll('StockTransaction')
  console.log(`StockTransactions: ${txns.length}`)
  for (let i = 0; i < txns.length; i++) {
    try {
      const t = convertTypes(txns[i], [], ['quantity','balanceAfter'], ['cost','unitCost'])
      await supabase.stockTransaction.create({ data: t })
    } catch {}
    if ((i+1) % 1000 === 0) console.log(`  ... ${i+1}/${txns.length}`)
  }

  // 5. PurchaseOrders
  const pos = getAll('PurchaseOrder')
  console.log(`PurchaseOrders: ${pos.length}`)
  for (const p of pos) {
    try {
      const po = convertTypes(p, [], [], ['totalValue'])
      await supabase.purchaseOrder.upsert({ where: { id: po.id }, create: po, update: {} })
    } catch {}
  }

  // 6. Users
  const users = getAll('User')
  console.log(`Users: ${users.length}`)
  for (const u of users) {
    try {
      const usr = convertTypes(u, ['active'])
      await supabase.user.upsert({ where: { email: usr.email }, create: usr, update: {} })
    } catch {}
  }

  // 7. AppSettings
  const settings = getAll('AppSetting')
  console.log(`AppSettings: ${settings.length}`)
  for (const s of settings) {
    try {
      const st = convertTypes(s, [], [], [], ['updatedAt'])
      await supabase.appSetting.upsert({ where: { key: st.key }, create: st, update: {} })
    } catch {}
  }

  // 8. DocumentTemplates
  const templates = getAll('DocumentTemplate')
  console.log(`DocumentTemplates: ${templates.length}`)
  for (const t of templates) {
    try {
      const tpl = convertTypes(t, ['isActive','isDefault','isFixed'])
      await supabase.documentTemplate.upsert({ where: { id: tpl.id }, create: tpl, update: {} })
    } catch {}
  }

  // 9. Cycles
  const cycles = getAll('Cycle')
  console.log(`Cycles: ${cycles.length}`)
  for (const c of cycles) {
    try {
      const cy = convertTypes(c, [], [], [], ['createdAt','updatedAt'])
      await supabase.cycle.upsert({ where: { id: cy.id }, create: cy, update: {} })
    } catch {}
  }

  console.log('\n✅ Migration complete!')
  console.log('\n📊 Supabase counts:')
  console.log('  Devices:', await supabase.device.count())
  console.log('  WorkOrders:', await supabase.workOrder.count())
  console.log('  StockItems:', await supabase.stockItem.count())
  console.log('  StockTransactions:', await supabase.stockTransaction.count())
  console.log('  PurchaseOrders:', await supabase.purchaseOrder.count())
  console.log('  Users:', await supabase.user.count())

  db.close()
  await supabase.$disconnect()
}

main().catch(console.error)
