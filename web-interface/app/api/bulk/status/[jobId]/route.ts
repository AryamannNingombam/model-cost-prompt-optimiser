import { NextRequest, NextResponse } from 'next/server'
import { getJobState } from '@/lib/bulk-job-store'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const state = getJobState(params.jobId)
  if (!state) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  return NextResponse.json(state)
}
