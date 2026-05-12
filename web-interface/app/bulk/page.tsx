'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ArrowUpTrayIcon,
  DocumentTextIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  ArrowDownTrayIcon,
  XCircleIcon,
  StopIcon,
} from '@heroicons/react/24/outline'

interface BulkJobState {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  createdAt: string
  expiresAt: string
  totalTasks: number
  completedTasks: number
  currentRow: number
  currentVariable: string
  rowCount: number
  errorMessage?: string
  hasGroundTruth: Record<string, boolean>
  hasGroundTruthReason: Record<string, boolean>
  variables: { var_name: string; var_type: string }[]
}

export default function BulkAnalysisPage() {
  // Upload form state
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rowCount: number; sampleRows: string[][] } | null>(null)
  const [variablesText, setVariablesText] = useState('')
  const [variablesParsed, setVariablesParsed] = useState<{ var_name: string; var_type: string }[] | null>(null)
  const [variablesError, setVariablesError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitWarnings, setSubmitWarnings] = useState<string[]>([])
  const [validationWarnings, setValidationWarnings] = useState<string[]>([])

  // Jobs state
  const [jobs, setJobs] = useState<BulkJobState[]>([])
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Load jobs on mount
  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/bulk/list')
      const data = await res.json()
      setJobs(data.jobs || [])
    } catch {}
  }, [])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  // Poll while any job is running
  useEffect(() => {
    const hasRunning = jobs.some(j => j.status === 'running' || j.status === 'pending')
    if (hasRunning) {
      pollRef.current = setInterval(fetchJobs, 3000)
    } else if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [jobs, fetchJobs])

  // CSV file handling
  const handleCsvChange = (file: File | null) => {
    setCsvFile(file)
    setCsvPreview(null)
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split('\n').filter(l => l.trim())
      if (lines.length === 0) return

      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
      const sampleRows = lines.slice(1, 4).map(line => {
        // Simple CSV split (handles basic cases)
        return line.split(',').map(c => c.trim().replace(/^"|"$/g, '').slice(0, 50))
      })

      setCsvPreview({
        headers,
        rowCount: lines.length - 1,
        sampleRows,
      })
    }
    reader.readAsText(file)
  }

  // Variables JSON handling
  const handleVariablesChange = (text: string) => {
    setVariablesText(text)
    setVariablesError('')
    setVariablesParsed(null)

    if (!text.trim()) return

    try {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setVariablesError('Must be a non-empty JSON array')
        return
      }
      for (const v of parsed) {
        if (!v.var_name || !v.description) {
          setVariablesError(`Missing var_name or description in: ${v.var_name || 'unknown'}`)
          return
        }
      }
      setVariablesParsed(parsed.map((v: any) => ({ var_name: v.var_name, var_type: v.var_type || 'boolean' })))
    } catch {
      setVariablesError('Invalid JSON')
    }
  }

  // Variables JSON file upload
  const handleVariablesFileUpload = (file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      handleVariablesChange(text)
    }
    reader.readAsText(file)
  }

  // Cross-validate CSV headers against variables
  useEffect(() => {
    if (!csvPreview || !variablesParsed) {
      setValidationWarnings([])
      return
    }
    const warnings: string[] = []
    const headers = csvPreview.headers

    if (!headers.includes('transcript')) {
      warnings.push('CSV is missing required "transcript" column')
    }
    if (!headers.includes('interaction_id')) {
      warnings.push('CSV is missing "interaction_id" column')
    }

    for (const v of variablesParsed) {
      const hasValue = headers.includes(`${v.var_name}_value`)
      const hasReason = headers.includes(`${v.var_name}_reason`)
      if (hasValue && !hasReason) {
        warnings.push(`"${v.var_name}": has _value column but no _reason column — difference analysis on mismatches will be limited`)
      }
      if (!hasValue && hasReason) {
        warnings.push(`"${v.var_name}": has _reason column but no _value column — ground truth comparison will be skipped`)
      }
      if (!hasValue && !hasReason) {
        warnings.push(`"${v.var_name}": no ground truth columns (${v.var_name}_value, ${v.var_name}_reason) found — will run analysis only, no comparison`)
      }
    }

    setValidationWarnings(warnings)
  }, [csvPreview, variablesParsed])

  // Submit
  const handleSubmit = async () => {
    if (!csvFile || !variablesText.trim() || variablesError) return

    setIsSubmitting(true)
    setSubmitError('')
    setSubmitWarnings([])

    try {
      const formData = new FormData()
      formData.append('csv', csvFile)
      formData.append('variables', variablesText)

      const res = await fetch('/api/bulk/start', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setSubmitError(data.error || 'Failed to start job')
        return
      }

      if (data.warnings?.length > 0) {
        setSubmitWarnings(data.warnings)
      }

      // Reset form and refresh jobs
      setCsvFile(null)
      setCsvPreview(null)
      setVariablesText('')
      setVariablesParsed(null)
      await fetchJobs()
    } catch (e) {
      setSubmitError('Network error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const cancelJob = async (jobId: string) => {
    try {
      await fetch(`/api/bulk/cancel/${jobId}`, { method: 'POST' })
      await fetchJobs()
    } catch {}
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">Pending</span>
      case 'running':
        return <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">Running</span>
      case 'completed':
        return <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">Completed</span>
      case 'failed':
        return <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">Failed</span>
      case 'cancelled':
        return <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800">Cancelled</span>
    }
  }

  const formatTimeRemaining = (expiresAt: string) => {
    const ms = new Date(expiresAt).getTime() - Date.now()
    if (ms <= 0) return 'Expired'
    const mins = Math.floor(ms / 60000)
    if (mins < 60) return `${mins}m remaining`
    return `${Math.floor(mins / 60)}h ${mins % 60}m remaining`
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bulk Transcript Analysis</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload a CSV of transcripts and a variables JSON to run batch analysis in the background.
        </p>
      </div>

      {/* Upload Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CSV Upload */}
        <div className="card p-6">
          <div className="flex items-center space-x-2 mb-4">
            <ArrowUpTrayIcon className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">CSV File</h2>
          </div>

          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition-colors border-gray-300">
            <div className="text-center">
              {csvFile ? (
                <>
                  <DocumentTextIcon className="w-8 h-8 mx-auto text-green-600 mb-1" />
                  <p className="text-sm font-medium text-gray-900">{csvFile.name}</p>
                  <p className="text-xs text-gray-500">{(csvFile.size / 1024).toFixed(1)} KB</p>
                </>
              ) : (
                <>
                  <ArrowUpTrayIcon className="w-8 h-8 mx-auto text-gray-400 mb-1" />
                  <p className="text-sm text-gray-500">Click to upload CSV</p>
                  <p className="text-xs text-gray-400">Must have transcript column</p>
                </>
              )}
            </div>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => handleCsvChange(e.target.files?.[0] || null)}
            />
          </label>

          {csvPreview && (
            <div className="mt-4">
              <p className="text-sm text-gray-700 mb-2">
                <span className="font-medium">{csvPreview.rowCount}</span> rows,{' '}
                <span className="font-medium">{csvPreview.headers.length}</span> columns
              </p>
              <div className="overflow-x-auto">
                <table className="text-xs border w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      {csvPreview.headers.map((h, i) => (
                        <th key={i} className="px-2 py-1 border text-left font-medium text-gray-600 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.sampleRows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} className="px-2 py-1 border text-gray-500 whitespace-nowrap max-w-[150px] truncate">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Variables JSON */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <DocumentTextIcon className="w-5 h-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-gray-900">Variables JSON</h2>
            </div>
            <label className="text-xs text-primary-600 hover:text-primary-700 cursor-pointer font-medium">
              Upload .json
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={e => handleVariablesFileUpload(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <textarea
            value={variablesText}
            onChange={e => handleVariablesChange(e.target.value)}
            placeholder='[{"var_name": "...", "var_type": "boolean", "description": "..."}]'
            className="textarea w-full h-32 font-mono text-xs"
          />

          {variablesError && (
            <p className="text-xs text-red-600 mt-1">{variablesError}</p>
          )}

          {variablesParsed && (
            <div className="mt-3">
              <p className="text-sm text-gray-700 mb-2">
                <span className="font-medium">{variablesParsed.length}</span> variables detected:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {variablesParsed.map(v => (
                  <span
                    key={v.var_name}
                    className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded"
                  >
                    {v.var_name} ({v.var_type})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Format Guidance */}
      <div className="card p-5 bg-gray-50 border-gray-200">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Expected Formats</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600">
          <div>
            <p className="font-medium text-gray-700 mb-1">CSV Columns</p>
            <p>Required: <code className="bg-gray-200 px-1 rounded">interaction_id</code>, <code className="bg-gray-200 px-1 rounded">contact_id</code>, <code className="bg-gray-200 px-1 rounded">transcript</code></p>
            <p className="mt-1">Optional: <code className="bg-gray-200 px-1 rounded">scheduled_time</code>, <code className="bg-gray-200 px-1 rounded">campaign_name</code>, <code className="bg-gray-200 px-1 rounded">schedule_start_at</code>, <code className="bg-gray-200 px-1 rounded">schedule_end_at</code></p>
            <p className="mt-1">Ground truth: For each variable, include <code className="bg-gray-200 px-1 rounded">{'{var_name}'}_value</code> and <code className="bg-gray-200 px-1 rounded">{'{var_name}'}_reason</code> columns to enable comparison and metrics.</p>
          </div>
          <div>
            <p className="font-medium text-gray-700 mb-1">Variables JSON</p>
            <p>Array of objects, each with:</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li><code className="bg-gray-200 px-1 rounded">var_name</code> (required) — variable identifier</li>
              <li><code className="bg-gray-200 px-1 rounded">var_type</code> — <code>boolean</code>, <code>string</code>, or <code>number</code></li>
              <li><code className="bg-gray-200 px-1 rounded">description</code> (required) — prompt instructions for extraction</li>
            </ul>
            <p className="mt-1">Model output must return JSON with <code className="bg-gray-200 px-1 rounded">value</code> and <code className="bg-gray-200 px-1 rounded">reason</code> keys.</p>
          </div>
        </div>
      </div>

      {/* Validation Warnings */}
      {validationWarnings.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center space-x-2 mb-2">
            <ExclamationTriangleIcon className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">Validation Warnings</span>
          </div>
          <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
            {validationWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* Submit Warnings (from server) */}
      {submitWarnings.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center space-x-2 mb-2">
            <ExclamationTriangleIcon className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">Job started with warnings</span>
          </div>
          <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
            {submitWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* Submit */}
      {submitError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {submitError}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={!csvFile || !variablesParsed || !!variablesError || isSubmitting}
          className="btn-primary px-6 py-2 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowUpTrayIcon className="w-4 h-4" />
          <span>{isSubmitting ? 'Starting...' : 'Start Bulk Analysis'}</span>
        </button>
      </div>

      {/* Jobs List */}
      {jobs.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Jobs</h2>
          <div className="space-y-4">
            {jobs.map(job => {
              const progress = job.totalTasks > 0
                ? Math.round((job.completedTasks / job.totalTasks) * 100)
                : 0
              const gtVars = Object.entries(job.hasGroundTruth || {}).filter(([, v]) => v).map(([k]) => k)

              return (
                <div key={job.id} className={`card p-5 ${job.status === 'failed' ? 'border-red-200' : ''}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        {getStatusBadge(job.status)}
                        <span className="text-xs text-gray-400 font-mono">{job.id.slice(0, 8)}</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {job.rowCount} rows x {job.variables?.length || 0} variables = {job.totalTasks} tasks
                      </p>
                      {gtVars.length > 0 && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Ground truth: {gtVars.join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-start space-x-3">
                      {(job.status === 'running' || job.status === 'pending') && (
                        <button
                          onClick={() => cancelJob(job.id)}
                          className="flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors"
                        >
                          <StopIcon className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                      )}
                      <div className="text-right text-xs text-gray-500">
                        <p>{new Date(job.createdAt).toLocaleString()}</p>
                        <p>{formatTimeRemaining(job.expiresAt)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {(job.status === 'running' || job.status === 'pending') && (
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>
                          {job.status === 'running'
                            ? `Row ${job.currentRow}/${job.rowCount} — ${job.currentVariable}`
                            : 'Waiting to start...'}
                        </span>
                        <span>{progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-primary-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Error message */}
                  {job.status === 'failed' && job.errorMessage && (
                    <div className="flex items-start space-x-2 p-3 bg-red-50 rounded-lg mb-3">
                      <XCircleIcon className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-red-700">{job.errorMessage}</p>
                    </div>
                  )}

                  {/* Download buttons — available during run (partial) and after completion */}
                  {(job.status === 'completed' || job.status === 'cancelled' || (job.status === 'running' && job.completedTasks > 0)) && (
                    <div className="flex items-center space-x-3 pt-2 border-t">
                      <a
                        href={`/api/bulk/download/${job.id}?file=results`}
                        className="flex items-center space-x-1.5 px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded border border-primary-200 transition-colors"
                      >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                        <span>{job.status === 'running' ? 'Partial Results' : job.status === 'cancelled' ? 'Partial Results' : 'Results CSV'}</span>
                      </a>
                      {gtVars.length > 0 && (
                        <a
                          href={`/api/bulk/download/${job.id}?file=metrics`}
                          className="flex items-center space-x-1.5 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded border border-green-200 transition-colors"
                        >
                          <ArrowDownTrayIcon className="w-4 h-4" />
                          <span>{job.status === 'completed' ? 'Metrics CSV' : 'Partial Metrics'}</span>
                        </a>
                      )}
                      <span className="text-xs text-gray-400 ml-auto">
                        {job.status === 'completed' ? (
                          <><CheckCircleIcon className="w-4 h-4 inline text-green-500 mr-1" />{job.completedTasks} tasks completed</>
                        ) : (
                          <><ArrowPathIcon className="w-4 h-4 inline text-blue-500 mr-1 animate-spin" />{job.completedTasks}/{job.totalTasks} done so far</>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
