import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
(async () => {
  await db.user.update({
    where: { email: 'admin@itam.local' },
    data: { allowedSites: 'ALL' }
  });
  console.log('admin allowedSites = ALL');
  await db.user.update({
    where: { email: 'superadmin@itam.local' },
    data: { allowedSites: 'ALL' }
  });
  console.log('superadmin allowedSites = ALL');
  const count = await db.device.count();
  console.log(`Devices: ${count}`);
  const bySite = await db.device.groupBy({ by: ['site'], _count: { _all: true } });
  for (const s of bySite) console.log(`  ${s.site}: ${s._count._all}`);
  await db.$disconnect();
})();
