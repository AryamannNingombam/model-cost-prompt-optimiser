import { NextRequest, NextResponse } from 'next/server'
import { getJobState, getResultsFile } from '@/lib/bulk-job-store'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const fileType = request.nextUrl.searchParams.get('file') as 'results' | 'metrics' | null
  if (!fileType || !['results', 'metrics'].includes(fileType)) {
    return NextResponse.json({ error: 'Query param ?file=results or ?file=metrics required' }, { status: 400 })
  }

  const state = getJobState(params.jobId)
  if (!state) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Allow downloads while running (partial results) or completed
  const content = getResultsFile(params.jobId, fileType)
  if (!content) {
    return NextResponse.json(
      { error: state.status === 'running' ? 'Results not yet available, try again shortly' : `${fileType}.csv not found` },
      { status: 404 }
    )
  }

  const filename = `${fileType}-${params.jobId.slice(0, 8)}.csv`
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
