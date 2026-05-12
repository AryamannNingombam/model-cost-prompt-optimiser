import { listJobs, deleteJob } from './bulk-job-store'

/**
 * Delete jobs whose expiresAt has passed, or running jobs older than 2h (stale).
 * Called lazily when the user interacts with bulk features.
 */
export function cleanupExpiredJobs(): number {
  const now = Date.now()
  let deleted = 0

  for (const job of listJobs()) {
    const expired = new Date(job.expiresAt).getTime() < now
    const staleRunning =
      job.status === 'running' &&
      new Date(job.createdAt).getTime() + 2 * 60 * 60 * 1000 < now

    if (expired || staleRunning) {
      deleteJob(job.id)
      deleted++
    }
  }

  return deleted
}
