import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
const db = new PrismaClient();
(async () => {
  const user = await db.user.findFirst({
    where: { email: 'admin@itam.local' },
    select: { username: true, email: true, passwordHash: true }
  });
  console.log('Stored hash:', user?.passwordHash?.slice(0, 30));
  
  // Verify the hash we just set
  const match = await bcrypt.compare('admin123', user?.passwordHash || '');
  console.log('bcrypt compare admin123:', match);
  
  // Generate a new hash and compare
  const newHash = await bcrypt.hash('admin123', 10);
  console.log('New hash:', newHash.slice(0, 30));
  const match2 = await bcrypt.compare('admin123', newHash);
  console.log('New hash compare:', match2);
  
  await db.$disconnect();
})();
