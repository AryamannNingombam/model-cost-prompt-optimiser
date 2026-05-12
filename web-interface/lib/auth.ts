import crypto from 'crypto'

function getCredentials() {
  return {
    email: process.env.AUTH_EMAIL || '',
    password: process.env.AUTH_PASSWORD || '',
  }
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET environment variable is not set')
  return secret
}

/**
 * Generate a daily 6-digit PIN based on the current date.
 * Changes at midnight UTC.
 */
export function getDailyPin(): string {
  const today = new Date().toISOString().slice(0, 10)
  const hash = crypto.createHmac('sha256', getSessionSecret()).update(today).digest('hex')
  const num = parseInt(hash.slice(0, 8), 16) % 1000000
  return String(num).padStart(6, '0')
}

/**
 * Validate email + password credentials.
 */
export function validateCredentials(email: string, password: string): boolean {
  const creds = getCredentials()
  if (!creds.email || !creds.password) return false
  return email === creds.email && password === creds.password
}

/**
 * Create a session token (HMAC of date + secret). Valid for 24h.
 */
export function createSessionToken(): string {
  const today = new Date().toISOString().slice(0, 10)
  return crypto.createHmac('sha256', getSessionSecret()).update(`session-${today}`).digest('hex')
}

/**
 * Validate a session token — valid if it matches today's or yesterday's token.
 */
export function validateSessionToken(token: string): boolean {
  if (!token) return false

  const secret = getSessionSecret()
  const today = new Date().toISOString().slice(0, 10)
  const todayToken = crypto.createHmac('sha256', secret).update(`session-${today}`).digest('hex')
  if (token === todayToken) return true

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const yesterdayToken = crypto.createHmac('sha256', secret).update(`session-${yesterday}`).digest('hex')
  return token === yesterdayToken
}
