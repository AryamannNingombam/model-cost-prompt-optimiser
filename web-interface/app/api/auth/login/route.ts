import { NextRequest, NextResponse } from 'next/server'
import { validateCredentials, createSessionToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const { email, password } = await request.json()

  if (!validateCredentials(email, password)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const token = createSessionToken()

  const response = NextResponse.json({ ok: true })
  response.cookies.set('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 86400, // 24 hours
  })

  return response
}
