import pg from 'pg';
const client = new pg.Client({
  host: 'aws-0-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.afefimovenxnalhoezyv',
  password: 'itam-stg-rotated-2026',
  ssl: { rejectUnauthorized: false }
});
try {
  await client.connect();
  await client.query(`UPDATE "User" SET "allowedSites" = 'ALL' WHERE email = 'admin@itam.local'`);
  console.log('✅ admin allowedSites = ALL');
  await client.query(`UPDATE "User" SET "allowedSites" = 'ALL' WHERE email = 'superadmin@itam.local'`);
  console.log('✅ superadmin allowedSites = ALL');
  const count = await client.query('SELECT COUNT(*) as c FROM "Device"');
  console.log(`Devices in DB: ${count.rows[0].c}`);
  const bySite = await client.query('SELECT site, COUNT(*) as c FROM "Device" GROUP BY site ORDER BY c DESC');
  console.log('Devices by site:');
  for (const s of bySite.rows) console.log(`  ${s.site}: ${s.c}`);
  await client.end();
} catch (e) {
  console.error('ERROR:', e.message.slice(0, 200));
  process.exit(1);
}
