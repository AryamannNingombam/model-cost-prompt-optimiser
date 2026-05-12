export interface BulkVariable {
  var_name: string
  var_type: 'boolean' | 'string' | 'number'
  description: string
  agent_id?: number
  variable_id?: number
  destination_ids?: number[]
}

export interface TranscriptRow {
  interaction_id: string
  contact_id: string
  scheduled_time: string
  campaign_name: string
  schedule_start_at: string
  schedule_end_at: string
  transcript: string
  [key: string]: string
}

export interface BulkJobState {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  createdAt: string
  expiresAt: string
  totalTasks: number
  completedTasks: number
  currentRow: number
  currentVariable: string
  errorMessage?: string
  variables: BulkVariable[]
  csvHeaders: string[]
  hasGroundTruth: Record<string, boolean>
  hasGroundTruthReason: Record<string, boolean>
  rowCount: number
}

export interface BulkAnalysisCell {
  predicted_value: any
  predicted_reason: string
  match?: boolean
  difference?: string
}

export interface MetricsRow {
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
}
