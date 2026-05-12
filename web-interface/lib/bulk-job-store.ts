import fs from 'fs'
import path from 'path'
import { BulkJobState, TranscriptRow } from './bulk-job-types'

const DATA_DIR = path.join(process.cwd(), '.data', 'jobs')

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function getJobDir(jobId: string): string {
  return path.join(DATA_DIR, jobId)
}

export function createJob(state: BulkJobState, csvRows: TranscriptRow[]): void {
  const dir = getJobDir(state.id)
  ensureDir(dir)
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state, null, 2))
  fs.writeFileSync(path.join(dir, 'input.json'), JSON.stringify(csvRows))
}

export function getJobState(jobId: string): BulkJobState | null {
  const file = path.join(getJobDir(jobId), 'state.json')
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

export function updateJobState(jobId: string, patch: Partial<BulkJobState>): void {
  const current = getJobState(jobId)
  if (!current) return
  const updated = { ...current, ...patch }
  const dir = getJobDir(jobId)
  const tmpFile = path.join(dir, 'state.tmp.json')
  const targetFile = path.join(dir, 'state.json')
  fs.writeFileSync(tmpFile, JSON.stringify(updated, null, 2))
  fs.renameSync(tmpFile, targetFile)
}

export function getInputRows(jobId: string): TranscriptRow[] {
  const file = path.join(getJobDir(jobId), 'input.json')
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

export function listJobs(): BulkJobState[] {
  ensureDir(DATA_DIR)
  const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true })
  const jobs: BulkJobState[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const state = getJobState(entry.name)
    if (state) jobs.push(state)
  }
  return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function writeResultsCsv(jobId: string, content: string): void {
  fs.writeFileSync(path.join(getJobDir(jobId), 'results.csv'), content, 'utf-8')
}

export function writeMetricsCsv(jobId: string, content: string): void {
  fs.writeFileSync(path.join(getJobDir(jobId), 'metrics.csv'), content, 'utf-8')
}

export function getResultsFile(jobId: string, file: 'results' | 'metrics'): string | null {
  const filePath = path.join(getJobDir(jobId), `${file}.csv`)
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath, 'utf-8')
}

export function deleteJob(jobId: string): void {
  const dir = getJobDir(jobId)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
