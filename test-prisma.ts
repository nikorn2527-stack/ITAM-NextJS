import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
(async () => {
  try {
    const users = await db.user.findMany({ select: { username: true, email: true, role: true }, take: 5 });
    console.log('Users:', JSON.stringify(users, null, 2));
    await db.$disconnect();
  } catch (e) {
    console.error('ERROR:', e.message.slice(0, 300));
    process.exit(1);
  }
})();
