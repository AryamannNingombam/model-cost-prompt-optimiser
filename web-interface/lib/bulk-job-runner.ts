import { BulkAnalysisCell, BulkVariable, TranscriptRow } from './bulk-job-types'
import {
  getInputRows,
  getJobState,
  updateJobState,
  writeResultsCsv,
  writeMetricsCsv,
} from './bulk-job-store'
import { generateResultsCsv, generateMetricsCsv } from './bulk-csv'
import { computeMetrics } from './bulk-metrics'
import {
  fireworksChatCompletionsUrl,
  fireworksEvaluationModel,
  fireworksOptimizerModel,
} from './fireworks-env'

const CONCURRENCY = 10
const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY

interface Task {
  rowIdx: number
  variable: BulkVariable
}

async function callModel(
  model: string,
  prompt: string,
  temperature: number = 0.3,
  maxTokens: number = 500
): Promise<string> {
  const res = await fetch(fireworksChatCompletionsUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${FIREWORKS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

function countChar(str: string, char: string): number {
  let n = 0
  for (let i = 0; i < str.length; i++) {
    if (str[i] === char) n++
  }
  return n
}

function cleanJsonContent(raw: string): string {
  let content = raw.trim()

  if (content.startsWith('```')) {
    const lines = content.split('\n')
    content = lines.slice(1, -1).join('\n')
    content = content.replace(/```json/g, '').replace(/```/g, '').trim()
  }

  if (!content.endsWith('}') && countChar(content, '{') > countChar(content, '}')) {
    content += '}'
  }

  return content
}

/**
 * Parse the model response and extract value + reason for a specific variable.
 *
 * Handles these response formats:
 *   1. { "var_name": { "value": true, "reason": "..." } }
 *   2. { "var_name": true }
 *   3. { "value": true, "reason": "..." }
 */
function parseVariableResponse(raw: string, varName: string): { value: any; reason: string } {
  const content = cleanJsonContent(raw)

  try {
    const parsed = JSON.parse(content)

    // Format 1 & 2: response keyed by variable name
    if (varName in parsed) {
      const varResult = parsed[varName]
      if (typeof varResult === 'object' && varResult !== null) {
        return {
          value: varResult.value ?? varResult.result ?? false,
          reason: varResult.reason || varResult.reasoning || '',
        }
      }
      // Format 2: { "var_name": true/false }
      return { value: varResult, reason: parsed.reason || parsed.reasoning || '' }
    }

    // Format 3: { "value": ..., "reason": ... }
    if ('value' in parsed) {
      return {
        value: parsed.value,
        reason: parsed.reason || parsed.reasoning || '',
      }
    }

    // Unknown format — return the whole parsed object as-is
    return { value: parsed, reason: '' }
  } catch {
    const lower = content.toLowerCase()
    if (lower.includes('"value": true') || lower.includes('"value":true')) {
      return { value: true, reason: content.slice(0, 500) }
    }
    if (lower.includes('"value": false') || lower.includes('"value":false')) {
      return { value: false, reason: content.slice(0, 500) }
    }
    return { value: false, reason: `PARSE_ERROR: ${content.slice(0, 300)}` }
  }
}

function normalizeBoolForComparison(val: any): boolean | null {
  if (typeof val === 'boolean') return val
  const s = String(val).trim().toLowerCase()
  if (s === 'true' || s === 'yes' || s === '1') return true
  if (s === 'false' || s === 'no' || s === '0') return false
  return null
}

function valuesMatch(predicted: any, groundTruth: string, varType: string): boolean {
  if (varType === 'boolean') {
    const p = normalizeBoolForComparison(predicted)
    const g = normalizeBoolForComparison(groundTruth)
    if (p === null || g === null) return false
    return p === g
  }
  return String(predicted).trim().toLowerCase() === groundTruth.trim().toLowerCase()
}

/**
 * Process a single (row, variable) task: call evaluation model,
 * compare with ground truth, call minimax for diff if needed.
 */
async function processTask(
  row: TranscriptRow,
  variable: BulkVariable,
  hasGroundTruth: Record<string, boolean>
): Promise<BulkAnalysisCell> {
  const cell: BulkAnalysisCell = {
    predicted_value: false,
    predicted_reason: '',
  }

  try {
    const transcript = row.transcript || ''
    const now = new Date()
    const istOffset = 5.5 * 60 * 60 * 1000
    const istDate = new Date(now.getTime() + istOffset)
    const utcStr = now.toISOString().slice(0, 16).replace('T', ' ')
    const istStr = istDate.toISOString().slice(0, 16).replace('T', ' ')

    const entity = {
      [variable.var_name]: {
        type: variable.var_type,
        description: variable.description,
      },
    }

    const prompt = `Extract the following entities from the conversation transcript between the prospect and the conversation agent. Return only a valid JSON object with the entity names as keys and extracted values as values. Always assign a value based on the description, never have null in the answer.

Entities to extract:
${JSON.stringify(entity, null, 2)}

Conversation transcript:
${transcript}

For reference, use these date/time values when extracting temporal entities:
Current UTC time: ${utcStr}
Current IST time: ${istStr}

Use these timestamps as reference points when extracting time-sensitive information like callback times, check-in dates, check-out dates, etc.

## IMPORTANT:
- Under any circumstances, do not hallucinate any of the entities from the conversation transcript.
- If you cannot find an entity, return null as the value.

Return only the JSON object, no additional text:`

    const rawResponse = await callModel(fireworksEvaluationModel(), prompt, 0.3, 500)
    const parsed = parseVariableResponse(rawResponse, variable.var_name)
    cell.predicted_value = parsed.value
    cell.predicted_reason = parsed.reason

    // Compare with ground truth if available
    if (hasGroundTruth[variable.var_name]) {
      const gtValue = row[`${variable.var_name}_value`] || ''
      if (gtValue) {
        cell.match = valuesMatch(cell.predicted_value, gtValue, variable.var_type)

        if (!cell.match) {
          try {
            const gtReason = row[`${variable.var_name}_reason`] || 'No ground truth reason provided'
            const diffPrompt = `Compare the following two analyses of a call transcript for the variable "${variable.var_name}".

Ground truth value: ${gtValue}
Ground truth reasoning: ${gtReason}

Predicted value: ${cell.predicted_value}
Predicted reasoning: ${cell.predicted_reason}

Explain concisely why the prediction differs from the ground truth. What did the model miss or get wrong?

Return JSON: {"difference": "your analysis here"}`

            const diffRaw = await callModel(fireworksOptimizerModel(), diffPrompt, 0.5, 300)
            try {
              const diffParsed = JSON.parse(
                diffRaw.replace(/```json\n?/g, '').replace(/```/g, '').trim()
              )
              cell.difference = diffParsed.difference || diffRaw.slice(0, 500)
            } catch {
              cell.difference = diffRaw.slice(0, 500)
            }
          } catch (e) {
            cell.difference = `Diff analysis failed: ${e instanceof Error ? e.message : 'unknown'}`
          }
        }
      }
    }
  } catch (e) {
    cell.predicted_reason = `ERROR: ${e instanceof Error ? e.message : 'unknown'}`
  }

  return cell
}

/**
 * Write intermediate results CSVs so partial downloads are available.
 */
function writePartialResults(
  jobId: string,
  rows: TranscriptRow[],
  csvHeaders: string[],
  variables: BulkVariable[],
  allResults: Map<number, Map<string, BulkAnalysisCell>>,
  hasGroundTruth: Record<string, boolean>
) {
  try {
    const resultsCsv = generateResultsCsv(rows, csvHeaders, variables, allResults, hasGroundTruth)
    writeResultsCsv(jobId, resultsCsv)

    const metrics = computeMetrics(rows, variables, allResults, hasGroundTruth)
    if (metrics.length > 0) {
      const metricsCsv = generateMetricsCsv(metrics)
      writeMetricsCsv(jobId, metricsCsv)
    }
  } catch (e) {
    console.error(`[bulk] Failed to write partial results for ${jobId}:`, e)
  }
}

/**
 * Run the bulk analysis job with concurrent batches of CONCURRENCY tasks.
 * Writes partial results after each batch so downloads are available mid-run.
 */
export async function runBulkJob(jobId: string): Promise<void> {
  try {
    const state = getJobState(jobId)
    if (!state) throw new Error('Job not found')

    updateJobState(jobId, { status: 'running' })

    const rows = getInputRows(jobId)
    const { variables, hasGroundTruth, csvHeaders } = state

    // Flatten all (row, variable) pairs into a task list
    const tasks: Task[] = []
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      for (const variable of variables) {
        tasks.push({ rowIdx, variable })
      }
    }

    // rowIndex -> varName -> cell
    const allResults = new Map<number, Map<string, BulkAnalysisCell>>()
    for (let i = 0; i < rows.length; i++) {
      allResults.set(i, new Map())
    }

    let completedTasks = 0

    // Process in batches of CONCURRENCY
    for (let batchStart = 0; batchStart < tasks.length; batchStart += CONCURRENCY) {
      // Check for cancellation before each batch
      const currentState = getJobState(jobId)
      if (currentState?.status === 'cancelled') {
        console.log(`[bulk] Job ${jobId} cancelled at task ${completedTasks}/${tasks.length}`)
        // Write whatever we have so far
        writePartialResults(jobId, rows, csvHeaders, variables, allResults, hasGroundTruth)
        return
      }

      const batch = tasks.slice(batchStart, batchStart + CONCURRENCY)

      // Update progress with first task in batch
      const firstTask = batch[0]
      updateJobState(jobId, {
        currentRow: firstTask.rowIdx + 1,
        currentVariable: batch.map(t => t.variable.var_name).join(', '),
        completedTasks,
      })

      // Run batch concurrently
      const results = await Promise.allSettled(
        batch.map(task => processTask(rows[task.rowIdx], task.variable, hasGroundTruth))
      )

      // Store results
      for (let i = 0; i < batch.length; i++) {
        const task = batch[i]
        const result = results[i]

        const cell: BulkAnalysisCell =
          result.status === 'fulfilled'
            ? result.value
            : { predicted_value: false, predicted_reason: `ERROR: ${result.reason}` }

        allResults.get(task.rowIdx)!.set(task.variable.var_name, cell)
        completedTasks++
      }

      // Write partial results after each batch for mid-run downloads
      writePartialResults(jobId, rows, csvHeaders, variables, allResults, hasGroundTruth)

      // Small delay between batches to avoid rate limit spikes
      if (batchStart + CONCURRENCY < tasks.length) {
        await delay(500)
      }
    }

    updateJobState(jobId, {
      status: 'completed',
      completedTasks,
    })

    console.log(`[bulk] Job ${jobId} completed: ${completedTasks} tasks`)
  } catch (e) {
    console.error(`[bulk] Job ${jobId} failed:`, e)
    updateJobState(jobId, {
      status: 'failed',
      errorMessage: e instanceof Error ? e.message : 'Unknown error',
    })
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
