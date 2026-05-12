import {
  fireworksChatCompletionsUrl,
  fireworksEvaluationModel,
} from '@/lib/fireworks-env'
import { NextRequest, NextResponse } from 'next/server'
import { fixTranscriptEncoding } from '@/lib/fix-encoding'

export const dynamic = 'force-dynamic'

interface Variable {
  id: string
  name: string
  type: 'boolean' | 'string' | 'number'
  description: string
}

interface OptimizationResult {
  variable: string
  originalPrompt: string
  optimizedPrompt: string
  improvements: string[]
  rationale: string
}

interface AnalysisResult {
  variable: string
  value: any
  reason: string
  latency: number
  rawOutput: string
  promptUsed: 'original' | 'optimized'
}

const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY

// Analyze transcript using selected prompt
async function analyzeVariable(
  prompt: string,
  variable: Variable,
  promptType: 'original' | 'optimized'
): Promise<AnalysisResult> {
  if (!FIREWORKS_API_KEY) {
    throw new Error('FIREWORKS_API_KEY not configured')
  }

  const startTime = Date.now()

  try {
    const response = await fetch(fireworksChatCompletionsUrl(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIREWORKS_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: fireworksEvaluationModel(),
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    })

    const endTime = Date.now()
    const latency = endTime - startTime

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[analyze] Fireworks API error for ${variable.name}: ${response.status} ${response.statusText}`, errorBody)
      throw new Error(`API request failed: ${response.status} ${response.statusText} — ${errorBody}`)
    }

    const data = await response.json()
    const rawOutput = data.choices[0]?.message?.content || ''

    if (!rawOutput) {
      throw new Error('No content in API response')
    }

    // Try to parse structured output first
    let value: any
    let reason: string

    try {
      // Look for JSON in the response
      const jsonMatch = rawOutput.match(/\{[\s\S]*?\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        value = parsed[variable.name] || parsed.value || parsed.result
        reason = parsed.reasoning || parsed.reason || parsed.explanation || 'Extracted from structured output'
      } else {
        // Fallback parsing
        value = parseValue(rawOutput, variable.type)
        reason = 'Extracted from unstructured output'
      }
    } catch (parseError) {
      value = parseValue(rawOutput, variable.type)
      reason = 'Parsed from raw output'
    }

    return {
      variable: variable.name,
      value,
      reason,
      latency,
      rawOutput: rawOutput.trim(),
      promptUsed: promptType
    }

  } catch (error) {
    const endTime = Date.now()
    const latency = endTime - startTime

    console.error(`Analysis error for ${variable.name}:`, error)

    return {
      variable: variable.name,
      value: getDefaultValue(variable.type),
      reason: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      latency,
      rawOutput: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      promptUsed: promptType
    }
  }
}

// Parse value based on expected type
function parseValue(text: string, type: 'boolean' | 'string' | 'number'): any {
  const cleanText = text.toLowerCase().trim()

  switch (type) {
    case 'boolean':
      if (cleanText.includes('true') || cleanText.includes('yes')) return true
      if (cleanText.includes('false') || cleanText.includes('no')) return false
      return cleanText.length > 0 // Default to true if any content

    case 'number':
      const numbers = text.match(/-?\d+(\.\d+)?/)
      if (numbers) return parseFloat(numbers[0])
      return 0

    case 'string':
      // Try to extract meaningful content
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
      return lines[0] || text.trim() || 'No value extracted'

    default:
      return text.trim()
  }
}

// Get default value for type
function getDefaultValue(type: 'boolean' | 'string' | 'number'): any {
  switch (type) {
    case 'boolean': return false
    case 'number': return 0
    case 'string': return 'Error'
    default: return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const {
      transcript: rawTranscript,
      variables,
      optimizationResults,
      promptChoices
    } = await request.json()

    if (!rawTranscript || typeof rawTranscript !== 'string' || !rawTranscript.trim()) {
      return NextResponse.json({ error: 'Transcript is required' }, { status: 400 })
    }

    // Fix encoding issues (e.g. MacRoman-garbled Hindi) before processing
    const { text: transcript } = fixTranscriptEncoding(rawTranscript)

    if (!variables || !Array.isArray(variables) || variables.length === 0) {
      return NextResponse.json({ error: 'Variables array is required' }, { status: 400 })
    }

    if (!optimizationResults || !Array.isArray(optimizationResults)) {
      return NextResponse.json({ error: 'Optimization results are required' }, { status: 400 })
    }

    if (!promptChoices || typeof promptChoices !== 'object') {
      return NextResponse.json({ error: 'Prompt choices are required' }, { status: 400 })
    }

    const results: AnalysisResult[] = []

    // Create a map of optimization results for quick lookup
    const optimizationMap = new Map(
      optimizationResults.map(result => [result.variable, result])
    )

    for (const variable of variables) {
      const choice = promptChoices[variable.name] || 'original'
      const optimization = optimizationMap.get(variable.name)

      if (!optimization) {
        console.error(`No optimization result found for variable: ${variable.name}`)
        continue
      }

      const promptTemplate = choice === 'optimized' ? optimization.optimizedPrompt : optimization.originalPrompt
      // Substitute the current transcript into the prompt template
      const prompt = promptTemplate.replace(/\{\{transcript\}\}/gi, transcript)

      try {
        const result = await analyzeVariable(prompt, variable, choice)
        results.push(result)

        // Add delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 1000))

      } catch (error) {
        console.error(`Failed to analyze variable ${variable.name}:`, error)

        results.push({
          variable: variable.name,
          value: getDefaultValue(variable.type),
          reason: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          latency: 0,
          rawOutput: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          promptUsed: choice
        })
      }
    }

    return NextResponse.json(results)

  } catch (error) {
    console.error('Analysis endpoint error:', error)
    return NextResponse.json(
      { error: 'Failed to analyze transcript' },
      { status: 500 }
    )
  }
}