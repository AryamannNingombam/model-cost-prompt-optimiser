import { NextRequest, NextResponse } from 'next/server'
import { validateSessionToken, getDailyPin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value || ''

  if (!validateSessionToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({ pin: getDailyPin() })
}
