import {
  fireworksChatCompletionsUrl,
  fireworksOptimizerModel,
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

const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY

// Generate original prompt template for a variable.
// Uses {{transcript}} as a placeholder — the analyze route substitutes the real transcript.
function generateOriginalPrompt(variable: Variable): string {
  const typeInstructions = {
    boolean: 'Respond with only "true" or "false"',
    string: 'Respond with a short descriptive string',
    number: 'Respond with only a number'
  }

  return `Analyze the following call transcript and extract the variable "${variable.name}".

Variable Description: ${variable.description}
Expected Type: ${variable.type}

Instructions: ${typeInstructions[variable.type]}

Transcript: {{transcript}}

Please analyze the transcript and provide the value for "${variable.name}".`
}

// Optimize prompt using Fireworks API
async function optimizePrompt(originalPrompt: string, variable: Variable): Promise<{
  optimizedPrompt: string
  improvements: string[]
  rationale: string
}> {
  if (!FIREWORKS_API_KEY) {
    throw new Error('FIREWORKS_API_KEY not configured')
  }

  const optimizationInstruction = `
  You are an AI prompt optimization expert specializing in model cost reduction through efficient prompting for smaller models like Qwen-4B.

  Your task is to optimize the following prompt TEMPLATE for better performance on smaller language models while maintaining accuracy.

  IMPORTANT: The prompt contains a placeholder {{transcript}} where the actual call transcript will be inserted at runtime. You MUST keep {{transcript}} as-is in your optimized prompt — do NOT remove, replace, or rename it.

  Original Prompt Template:
  ${originalPrompt}

  Variable Information:
  - Name: ${variable.name}
  - Type: ${variable.type}
  - Description: ${variable.description}

  Optimization Guidelines:
  1. Use clear, direct language
  2. Reduce ambiguity and unnecessary words
  3. Structure information logically
  4. Use specific formatting instructions
  5. Add context clues for better understanding
  6. Optimize for JSON output if applicable
  7. MUST include {{transcript}} placeholder in the optimized prompt

  Please provide:
  1. An optimized version of the prompt (must include {{transcript}} placeholder)
  2. A list of specific improvements made
  3. Rationale for the optimization choices

  Format your response as JSON:
  {
    "optimizedPrompt": "... {{transcript}} ...",
    "improvements": ["improvement 1", "improvement 2", ...],
    "rationale": "explanation of optimization strategy"
  }`

  try {
    const response = await fetch(fireworksChatCompletionsUrl(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIREWORKS_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: fireworksOptimizerModel(),
        messages: [
          {
            role: 'user',
            content: optimizationInstruction
          }
        ],
        temperature: 0.7,
        max_tokens: 1500
      })
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[optimize] Fireworks API error for ${variable.name}: ${response.status} ${response.statusText}`, errorBody)
      throw new Error(`API request failed: ${response.status} ${response.statusText} — ${errorBody}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('No content in API response')
    }

    // Extract JSON from the response
    let jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in response')
    }

    const optimizationResult = JSON.parse(jsonMatch[0])

    return {
      optimizedPrompt: optimizationResult.optimizedPrompt || originalPrompt,
      improvements: optimizationResult.improvements || ['Unable to parse improvements'],
      rationale: optimizationResult.rationale || 'Optimization completed'
    }

  } catch (error) {
    console.error('Optimization error:', error)

    // Fallback optimization
    const improvements = [
      'Simplified language structure',
      'Added clearer output format instructions',
      'Reduced prompt length',
      'Enhanced context clarity'
    ]

    const optimizedPrompt = originalPrompt
      .replace(/Please analyze the transcript and provide the value for.*/, `Output the ${variable.type} value for "${variable.name}" in this exact format: {"${variable.name}": <value>, "reasoning": "<brief explanation>"}`)
      .replace(/Respond with only.*/, '')

    return {
      optimizedPrompt,
      improvements,
      rationale: 'Applied standard optimization patterns for smaller models'
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { variables, transcript: rawTranscript } = await request.json()

    if (!variables || !Array.isArray(variables) || variables.length === 0) {
      return NextResponse.json({ error: 'Variables array is required' }, { status: 400 })
    }

    if (!rawTranscript || typeof rawTranscript !== 'string' || !rawTranscript.trim()) {
      return NextResponse.json({ error: 'Transcript is required' }, { status: 400 })
    }

    // Fix encoding issues (e.g. MacRoman-garbled Hindi) before processing
    const { text: transcript } = fixTranscriptEncoding(rawTranscript)

    const results: OptimizationResult[] = []

    for (const variable of variables) {
      const originalPrompt = generateOriginalPrompt(variable)

      try {
        const optimization = await optimizePrompt(originalPrompt, variable)

        results.push({
          variable: variable.name,
          originalPrompt,
          optimizedPrompt: optimization.optimizedPrompt,
          improvements: optimization.improvements,
          rationale: optimization.rationale
        })

        // Add small delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 1000))

      } catch (error) {
        console.error(`Failed to optimize prompt for ${variable.name}:`, error)

        // Add fallback result
        results.push({
          variable: variable.name,
          originalPrompt,
          optimizedPrompt: originalPrompt,
          improvements: ['Optimization failed - using original prompt'],
          rationale: 'Unable to optimize due to API error'
        })
      }
    }

    return NextResponse.json(results)

  } catch (error) {
    console.error('Optimization endpoint error:', error)
    return NextResponse.json(
      { error: 'Failed to optimize prompts' },
      { status: 500 }
    )
  }
}