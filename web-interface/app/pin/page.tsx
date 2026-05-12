'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { LockClosedIcon, KeyIcon } from '@heroicons/react/24/outline'

export default function PinPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><p>Loading...</p></div>}>
      <PinPageInner />
    </Suspense>
  )
}

function PinPageInner() {
  const searchParams = useSearchParams()
  const nextUrl = searchParams.get('next') || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setPin(null)
    setIsLoading(true)

    try {
      // Login sets session cookie
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!loginRes.ok) {
        setError('Invalid credentials')
        return
      }

      // Fetch today's PIN (now authenticated)
      const pinRes = await fetch('/api/auth/pin')
      if (!pinRes.ok) {
        setError('Failed to fetch PIN')
        return
      }

      const data = await pinRes.json()
      setPin(data.pin)
    } catch {
      setError('Network error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleContinue = () => {
    window.location.href = nextUrl
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {!pin ? (
          <form onSubmit={handleLogin} className="card p-8 space-y-5">
            <div className="text-center">
              <LockClosedIcon className="w-10 h-10 mx-auto text-primary-600 mb-2" />
              <h2 className="text-xl font-bold text-gray-900">Login</h2>
              <p className="text-sm text-gray-500 mt-1">Enter your credentials to access the app</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input w-full"
                placeholder="email@example.com"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input w-full"
                placeholder="Password"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-2.5 disabled:opacity-50"
            >
              {isLoading ? 'Verifying...' : 'Login'}
            </button>
          </form>
        ) : (
          <div className="card p-8 text-center space-y-5">
            <KeyIcon className="w-10 h-10 mx-auto text-green-600" />
            <h2 className="text-xl font-bold text-gray-900">Today's PIN</h2>
            <div className="text-4xl font-mono font-bold tracking-[0.3em] text-primary-600 bg-gray-50 rounded-lg py-4">
              {pin}
            </div>
            <p className="text-xs text-gray-500">This PIN changes daily at midnight UTC. Share it with your team for app access today.</p>
            <button
              onClick={handleContinue}
              className="btn-primary w-full py-2.5"
            >
              Continue to App
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
