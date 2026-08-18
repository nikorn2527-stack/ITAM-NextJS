import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/auth'

export async function GET() {
  try {
    const users = await db.user.findMany({ select: { username: true, email: true, active: true, passwordHash: true, passwordSalt: true } })
    const results = users.map(u => {
      const testPw = u.username === 'nikorn.p' ? 'P@ssw0rd!2025' : '1234'
      const verify = verifyPassword(testPw, u.passwordHash, u.passwordSalt)
      return { username: u.username, active: u.active, hashLen: u.passwordHash?.length, saltLen: u.passwordSalt?.length, verify }
    })
    return NextResponse.json({ users: results })
  } catch (e) {
    return NextResponse.json({ error: String(e) })
  }
}
