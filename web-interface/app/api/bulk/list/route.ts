import { NextResponse } from 'next/server'
import { listJobs } from '@/lib/bulk-job-store'
import { cleanupExpiredJobs } from '@/lib/bulk-cleanup'

export const dynamic = 'force-dynamic'

export async function GET() {
  cleanupExpiredJobs()
  const jobs = listJobs()
  return NextResponse.json({ jobs })
}
