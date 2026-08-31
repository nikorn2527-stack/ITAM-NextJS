/**
 * seed-all.ts — master seed script.
 * Run: bun scripts/seed-all.ts
 * Or: bun run db:seed
 *
 * Seeds ALL required data after a DB reset:
 *   1. Authorization catalog (roles + permissions)
 *   2. Demo users (demo_admin, demo_manager, demo_staff, demo_viewer)
 *   3. Default templates (2 sticker + 5 document)
 *   4. Master data (departments, buildings, etc.)
 *   5. Material cost sample data
 *
 * Idempotent: safe to run multiple times.
 */
import { execSync } from 'child_process'

const scripts = [
  { name: 'Authorization catalog', file: 'scripts/seed-authorization-catalog.ts' },
  { name: 'Demo users', file: 'scripts/create-demo-users.js' },
  { name: 'Default templates', file: 'scripts/seed-default-templates.ts' },
  { name: 'Master data', file: 'scripts/seed-master-data.ts' },
  { name: 'Material cost sample', file: 'scripts/seed-material-cost.ts' },
]

async function main() {
  console.log('═══════════════════════════════════════════')
  console.log('  ITAM-NextJS Master Seed Script')
  console.log('═══════════════════════════════════════════\n')

  for (const script of scripts) {
    console.log(`\n▶ ${script.name} (${script.file})`)
    try {
      execSync(`bun ${script.file}`, {
        stdio: 'inherit',
        cwd: '/home/z/my-project',
        env: { ...process.env },
      })
      console.log(`  ✓ ${script.name} completed`)
    } catch (e) {
      console.error(`  ✗ ${script.name} failed:`, e instanceof Error ? e.message : e)
      console.log('  Continuing to next script...')
    }
  }

  console.log('\n═══════════════════════════════════════════')
  console.log('  Seed complete!')
  console.log('  Login: demo_admin / demo123')
  console.log('═══════════════════════════════════════════')
}

main().catch((e) => {
  console.error('Seed failed:', e)
  process.exit(1)
})
