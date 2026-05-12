import { NextRequest, NextResponse } from 'next/server'
import { getJobState, updateJobState } from '@/lib/bulk-job-store'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const state = getJobState(params.jobId)
  if (!state) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (state.status !== 'running' && state.status !== 'pending') {
    return NextResponse.json({ error: 'Job is not running' }, { status: 400 })
  }

  updateJobState(params.jobId, { status: 'cancelled' })

  return NextResponse.json({ ok: true, message: 'Job cancellation requested' })
}
