import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
const db = new PrismaClient();
(async () => {
  // Reset admin password to 'admin123'
  const hash = await bcrypt.hash('admin123', 10);
  await db.user.update({
    where: { username: 'admin' },
    data: { passwordHash: hash }
  });
  console.log('✅ admin password reset to admin123');
  
  // Reset superadmin too
  const hash2 = await bcrypt.hash('superadmin123', 10);
  await db.user.update({
    where: { username: 'superadmin' },
    data: { passwordHash: hash2 }
  });
  console.log('✅ superadmin password reset to superadmin123');
  
  await db.$disconnect();
})();
