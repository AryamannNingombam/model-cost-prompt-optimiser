import { NextRequest, NextResponse } from 'next/server'

// Paths that don't require auth
const PUBLIC_PATHS = ['/pin', '/api/auth/']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p))
}

/**
 * Edge-compatible HMAC using Web Crypto API.
 */
async function hmacHex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function validateSession(token: string): Promise<boolean> {
  if (!token) return false

  const secret = process.env.SESSION_SECRET
  if (!secret) return false

  const today = new Date().toISOString().slice(0, 10)
  const todayToken = await hmacHex(secret, `session-${today}`)
  if (token === todayToken) return true

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const yesterdayToken = await hmacHex(secret, `session-${yesterday}`)
  return token === yesterdayToken
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Check session cookie
  const session = request.cookies.get('session')?.value || ''
  if (await validateSession(session)) {
    return NextResponse.next()
  }

  // Not authenticated
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const url = request.nextUrl.clone()
  url.pathname = '/pin'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
