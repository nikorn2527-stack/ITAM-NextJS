import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
const db = new PrismaClient();
(async () => {
  const users = await db.user.findMany({
    select: { username: true, email: true, passwordHash: true, role: true, isDemo: true }
  });
  for (const u of users) {
    const passwords = ['admin123', 'superadmin123', 'demo123', 'password', '123456', 'admin', 'test', 'Demo@123', 'Admin@123', 'itam'];
    for (const p of passwords) {
      if (u.passwordHash) {
        const match = await bcrypt.compare(p, u.passwordHash);
        if (match) {
          console.log(`✅ ${u.username} (${u.role}) — password: ${p}`);
          break;
        }
      }
    }
  }
  await db.$disconnect();
})();
