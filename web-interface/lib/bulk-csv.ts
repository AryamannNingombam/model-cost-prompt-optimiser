import Papa from 'papaparse'
import { BulkVariable, TranscriptRow, BulkAnalysisCell } from './bulk-job-types'
import { fixTranscriptEncoding } from './fix-encoding'

const REQUIRED_COLUMNS = ['interaction_id', 'contact_id', 'transcript']

export function parseBulkCsv(content: string): { rows: TranscriptRow[]; headers: string[] } {
  const result = Papa.parse<TranscriptRow>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  })

  const headers = result.meta.fields || []

  // Validate required columns
  const missing = REQUIRED_COLUMNS.filter(c => !headers.includes(c))
  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`)
  }

  // Fix encoding on each transcript
  const rows = result.data.map(row => ({
    ...row,
    transcript: fixTranscriptEncoding(row.transcript || '').text,
  }))

  return { rows, headers }
}

export function detectGroundTruth(
  headers: string[],
  variables: BulkVariable[]
): { hasValue: Record<string, boolean>; hasReason: Record<string, boolean> } {
  const hasValue: Record<string, boolean> = {}
  const hasReason: Record<string, boolean> = {}
  for (const v of variables) {
    hasValue[v.var_name] = headers.includes(`${v.var_name}_value`)
    hasReason[v.var_name] = headers.includes(`${v.var_name}_reason`)
  }
  return { hasValue, hasReason }
}

export function generateResultsCsv(
  rows: TranscriptRow[],
  headers: string[],
  variables: BulkVariable[],
  results: Map<number, Map<string, BulkAnalysisCell>>,
  hasGroundTruth: Record<string, boolean>
): string {
  // Build output headers: original + per-variable prediction columns
  const outputHeaders = [...headers]
  for (const v of variables) {
    outputHeaders.push(`${v.var_name}_predicted_value`)
    outputHeaders.push(`${v.var_name}_predicted_reason`)
    if (hasGroundTruth[v.var_name]) {
      outputHeaders.push(`${v.var_name}_match`)
      outputHeaders.push(`${v.var_name}_difference`)
    }
  }

  const outputRows = rows.map((row, rowIdx) => {
    const out: Record<string, string> = {}

    // Copy original columns
    for (const h of headers) {
      out[h] = row[h] || ''
    }

    // Add prediction columns
    const rowResults = results.get(rowIdx)
    for (const v of variables) {
      const cell = rowResults?.get(v.var_name)
      out[`${v.var_name}_predicted_value`] = cell ? String(cell.predicted_value) : ''
      out[`${v.var_name}_predicted_reason`] = cell?.predicted_reason || ''
      if (hasGroundTruth[v.var_name]) {
        out[`${v.var_name}_match`] = cell?.match !== undefined ? String(cell.match) : ''
        out[`${v.var_name}_difference`] = cell?.difference || ''
      }
    }

    return out
  })

  return Papa.unparse(outputRows, { columns: outputHeaders })
}

export function generateMetricsCsv(
  metrics: Array<{
    variable_name: string
    accuracy: number
    precision: number
    recall: number
    f1_score: number
    total_rows: number
    true_positives: number
    false_positives: number
    true_negatives: number
    false_negatives: number
  }>
): string {
  return Papa.unparse(metrics)
}
