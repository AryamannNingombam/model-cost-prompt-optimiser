import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { BulkVariable, BulkJobState } from '@/lib/bulk-job-types'
import { parseBulkCsv, detectGroundTruth } from '@/lib/bulk-csv'
import { createJob, listJobs } from '@/lib/bulk-job-store'
import { cleanupExpiredJobs } from '@/lib/bulk-cleanup'
import { runBulkJob } from '@/lib/bulk-job-runner'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    cleanupExpiredJobs()

    // Check no job is currently running
    const existing = listJobs()
    const running = existing.find(j => j.status === 'running')
    if (running) {
      return NextResponse.json(
        { error: 'A job is already running. Wait for it to complete or let it expire.' },
        { status: 409 }
      )
    }

    const formData = await request.formData()
    const csvFile = formData.get('csv') as File | null
    const variablesJson = formData.get('variables') as string | null

    if (!csvFile) {
      return NextResponse.json({ error: 'CSV file is required' }, { status: 400 })
    }
    if (!variablesJson) {
      return NextResponse.json({ error: 'Variables JSON is required' }, { status: 400 })
    }

    // Parse variables
    let variables: BulkVariable[]
    try {
      variables = JSON.parse(variablesJson)
      if (!Array.isArray(variables) || variables.length === 0) {
        throw new Error('Variables must be a non-empty array')
      }
      for (const v of variables) {
        if (!v.var_name || !v.description) {
          throw new Error(`Variable missing var_name or description: ${JSON.stringify(v).slice(0, 100)}`)
        }
        if (!v.var_type) v.var_type = 'boolean'
      }
    } catch (e) {
      return NextResponse.json(
        { error: `Invalid variables JSON: ${e instanceof Error ? e.message : 'parse error'}` },
        { status: 400 }
      )
    }

    // Parse CSV
    const csvContent = await csvFile.text()
    let rows, headers
    try {
      const parsed = parseBulkCsv(csvContent)
      rows = parsed.rows
      headers = parsed.headers
    } catch (e) {
      return NextResponse.json(
        { error: `CSV parsing failed: ${e instanceof Error ? e.message : 'parse error'}` },
        { status: 400 }
      )
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 })
    }

    // Detect ground truth columns (value + reason)
    const { hasValue: hasGroundTruth, hasReason: hasGroundTruthReason } = detectGroundTruth(headers, variables)

    // Build validation warnings
    const warnings: string[] = []
    for (const v of variables) {
      const hasVal = hasGroundTruth[v.var_name]
      const hasRsn = hasGroundTruthReason[v.var_name]
      if (hasVal && !hasRsn) {
        warnings.push(`"${v.var_name}": found _value column but missing _reason column — difference analysis on mismatches will be limited`)
      }
      if (!hasVal && hasRsn) {
        warnings.push(`"${v.var_name}": found _reason column but missing _value column — ground truth comparison will be skipped`)
      }
    }

    // Create job
    const jobId = crypto.randomUUID()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000) // +2 hours

    const state: BulkJobState = {
      id: jobId,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      totalTasks: rows.length * variables.length,
      completedTasks: 0,
      currentRow: 0,
      currentVariable: '',
      variables,
      csvHeaders: headers,
      hasGroundTruth,
      hasGroundTruthReason,
      rowCount: rows.length,
    }

    createJob(state, rows)

    // Fire and forget — runs in background
    runBulkJob(jobId).catch(err =>
      console.error(`[bulk] Background job ${jobId} crashed:`, err)
    )

    return NextResponse.json({
      jobId,
      totalTasks: state.totalTasks,
      rowCount: rows.length,
      variableCount: variables.length,
      groundTruthDetected: Object.entries(hasGroundTruth)
        .filter(([, v]) => v)
        .map(([k]) => k),
      groundTruthReasonDetected: Object.entries(hasGroundTruthReason)
        .filter(([, v]) => v)
        .map(([k]) => k),
      warnings,
    })
  } catch (error) {
    console.error('[bulk/start] Error:', error)
    return NextResponse.json(
      { error: 'Failed to start bulk analysis' },
      { status: 500 }
    )
  }
}
