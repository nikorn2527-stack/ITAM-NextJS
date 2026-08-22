import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
const db = new PrismaClient();
(async () => {
  const hash = await bcrypt.hash('admin123', 10);
  await db.user.update({
    where: { email: 'admin@itam.local' },
    data: { passwordHash: hash }
  });
  console.log('✅ admin password reset to admin123');
  
  const hash2 = await bcrypt.hash('superadmin123', 10);
  await db.user.update({
    where: { email: 'superadmin@itam.local' },
    data: { passwordHash: hash2 }
  });
  console.log('✅ superadmin password reset to superadmin123');
  
  await db.$disconnect();
})();
