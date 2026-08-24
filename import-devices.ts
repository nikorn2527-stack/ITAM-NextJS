import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const db = new PrismaClient();

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === ',') { current.push(field); field = ''; i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    if (ch === '\n') { current.push(field); field = ''; if (current.some(c => c !== '')) rows.push(current); current = []; i += 1; continue; }
    field += ch; i += 1;
  }
  if (field !== '' || current.length > 0) { current.push(field); if (current.some(c => c !== '')) rows.push(current); }
  return rows;
}

function toStr(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  return s === '' ? null : s;
}

function toBool(v: string | undefined): boolean {
  if (!v) return false;
  return v.trim().toUpperCase() === 'TRUE' || v.trim() === '1' || v.trim().toUpperCase() === 'YES';
}

async function main() {
  const csvPath = '/home/z/my-project/upload/IT_Asset_Management_Database - All_Devices.csv';
  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCsv(csvText);
  
  console.log(`Total CSV rows: ${rows.length}`);
  
  const headers = rows[0].map(h => h.trim().toLowerCase());
  console.log(`Headers: ${headers.join(', ')}`);
  
  // Map headers to indices
  const idx = (name: string) => headers.indexOf(name.toLowerCase());
  
  const dataRows = rows.slice(1);
  console.log(`Data rows: ${dataRows.length}`);
  
  // Build device data
  const devices = dataRows.map((row, i) => {
    const assetNo = toStr(row[idx('asset_no')]) || `UNKNOWN-${i}`;
    const name = toStr(row[idx('device_type')]) || 'Unknown';
    const brand = toStr(row[idx('brand')]) || 'Unknown';
    const model = toStr(row[idx('model')]) || 'Unknown';
    const type = (toStr(row[idx('device_type')]) || 'OTHER').toUpperCase();
    
    // Map site names to site codes
    const siteName = toStr(row[idx('site')]) || 'HQ';
    let site = 'HQ';
    if (siteName.includes('อุดร')) site = 'UDH';
    else if (siteName.includes('นครปฐม')) site = 'NKP';
    else if (siteName.includes('เชียงใหม่')) site = 'CNX';
    else if (siteName.includes('กรุงเทพ')) site = 'BKK-1';
    else site = 'HQ';
    
    return {
      assetCode: assetNo,
      name: name,
      brand: brand,
      model: model,
      type: type,
      serialNumber: toStr(row[idx('serial')]),
      status: (toStr(row[idx('status')]) || 'Active').toLowerCase(),
      site: site,
      department: toStr(row[idx('department')]),
      departmentCode: toStr(row[idx('department_code')]),
      assetSiteCode: toStr(row[idx('asset_site_code')]),
      location: toStr(row[idx('location')]),
      building: toStr(row[idx('building')]),
      floor: toStr(row[idx('floor')]),
      purchaseDate: toStr(row[idx('install_date')]),
      warrantyEnd: toStr(row[idx('warranty_end')]),
      vendor: toStr(row[idx('vendor')]),
      contractNo: toStr(row[idx('contract_no')]),
      ip: toStr(row[idx('ip')]),
      mac: toStr(row[idx('mac')]),
      remoteId: toStr(row[idx('remote_id')]),
      meterRequired: toBool(row[idx('meter_required')]),
      meterMode: toStr(row[idx('meter_mode')]),
      deviceGroup: toStr(row[idx('device_group')]),
      costCenter: toStr(row[idx('cost_center')]),
      remark: toStr(row[idx('remark')]),
      uninstallDate: toStr(row[idx('uninstall_date')]),
      updatedBy: toStr(row[idx('updated_by')]) || 'System',
    };
  });
  
  // Insert in batches of 100
  const BATCH_SIZE = 100;
  let inserted = 0;
  let errors = 0;
  
  for (let i = 0; i < devices.length; i += BATCH_SIZE) {
    const batch = devices.slice(i, i + BATCH_SIZE);
    try {
      const result = await db.device.createMany({
        data: batch,
        skipDuplicates: true,
      });
      inserted += result.count;
      if ((i / BATCH_SIZE) % 5 === 0) {
        console.log(`  Batch ${i / BATCH_SIZE + 1}/${Math.ceil(devices.length / BATCH_SIZE)}: ${result.count} inserted (total: ${inserted})`);
      }
    } catch (err) {
      errors++;
      if (errors <= 3) {
        console.error(`  Batch ${i / BATCH_SIZE + 1} failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`);
      }
    }
  }
  
  console.log(`\n=== Import Summary ===`);
  console.log(`Total CSV rows: ${dataRows.length}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Errors: ${errors}`);
  
  // Verify
  const totalInDb = await db.device.count();
  console.log(`Devices in DB after import: ${totalInDb}`);
  
  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
