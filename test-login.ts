import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
const db = new PrismaClient();
(async () => {
  const user = await db.user.findFirst({
    where: { OR: [{ username: 'admin' }, { email: 'admin@itam.local' }] },
    select: { username: true, email: true, passwordHash: true, passwordSalt: true, role: true }
  });
  console.log('User:', JSON.stringify(user, null, 2));
  
  if (user?.passwordHash) {
    // Try comparing 'admin123'
    const match = await bcrypt.compare('admin123', user.passwordHash);
    console.log('admin123 matches:', match);
    
    // Try comparing 'superadmin123'
    const match2 = await bcrypt.compare('superadmin123', user.passwordHash);
    console.log('superadmin123 matches:', match2);
    
    // Try comparing 'password'
    const match3 = await bcrypt.compare('password', user.passwordHash);
    console.log('password matches:', match3);
  }
  await db.$disconnect();
})();
