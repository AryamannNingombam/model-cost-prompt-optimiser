import { BulkVariable, BulkAnalysisCell, TranscriptRow, MetricsRow } from './bulk-job-types'

function parseBooleanValue(val: string): boolean | null {
  if (!val) return null
  const v = val.trim().toLowerCase()
  if (v === 'true' || v === 'yes' || v === '1') return true
  if (v === 'false' || v === 'no' || v === '0') return false
  return null
}

export function computeMetrics(
  rows: TranscriptRow[],
  variables: BulkVariable[],
  results: Map<number, Map<string, BulkAnalysisCell>>,
  hasGroundTruth: Record<string, boolean>
): MetricsRow[] {
  const metricsRows: MetricsRow[] = []

  for (const v of variables) {
    if (!hasGroundTruth[v.var_name]) continue

    let tp = 0, fp = 0, tn = 0, fn = 0

    for (let i = 0; i < rows.length; i++) {
      const cell = results.get(i)?.get(v.var_name)
      if (!cell) continue

      const gtRaw = rows[i][`${v.var_name}_value`]
      if (!gtRaw) continue

      if (v.var_type === 'boolean') {
        const gt = parseBooleanValue(gtRaw)
        const pred = typeof cell.predicted_value === 'boolean'
          ? cell.predicted_value
          : parseBooleanValue(String(cell.predicted_value))

        if (gt === null || pred === null) continue

        if (pred && gt) tp++
        else if (pred && !gt) fp++
        else if (!pred && !gt) tn++
        else if (!pred && gt) fn++
      } else {
        // For string/number: exact match treated as TP, mismatch as FP+FN
        const match = String(cell.predicted_value).trim().toLowerCase() ===
          String(gtRaw).trim().toLowerCase()
        if (match) { tp++; tn++ }
        else { fp++; fn++ }
      }
    }

    const total = tp + fp + tn + fn
    const accuracy = total > 0 ? (tp + tn) / total : 0
    const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0
    const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0
    const f1 = (precision + recall) > 0
      ? 2 * (precision * recall) / (precision + recall)
      : 0

    metricsRows.push({
      variable_name: v.var_name,
      accuracy: Math.round(accuracy * 10000) / 10000,
      precision: Math.round(precision * 10000) / 10000,
      recall: Math.round(recall * 10000) / 10000,
      f1_score: Math.round(f1 * 10000) / 10000,
      total_rows: total,
      true_positives: tp,
      false_positives: fp,
      true_negatives: tn,
      false_negatives: fn,
    })
  }

  return metricsRows
}
