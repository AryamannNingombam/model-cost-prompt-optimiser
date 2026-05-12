/**
 * Fireworks inference settings for Next.js API routes (server-side only).
 * Environment variable names align with prompt_optimizer.py / root .env.example.
 */

const DEFAULT_CHAT_URL = 'https://api.fireworks.ai/inference/v1/chat/completions'

export function fireworksChatCompletionsUrl(): string {
  const u = process.env.FIREWORKS_CHAT_COMPLETIONS_URL?.trim()
  return u || DEFAULT_CHAT_URL
}

export function fireworksOptimizerModel(): string {
  const m = process.env.FIREWORKS_OPTIMIZER_MODEL?.trim()
  return m || 'accounts/fireworks/models/minimax-m2p7'
}

/** Same semantics as CLI evaluation (call_qwen); used for transcript analysis here. */
export function fireworksEvaluationModel(): string {
  const m = process.env.FIREWORKS_EVALUATION_MODEL?.trim()
  return m || 'accounts/aryamann-ii2ajvi2ui7/deployments/gb1zhixe'
}
