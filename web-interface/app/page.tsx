'use client'

import { useState, useCallback } from 'react'
import { PlayIcon, SparklesIcon, ClockIcon, DocumentTextIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import VariableInput from './components/VariableInput'
import ResultsDisplay from './components/ResultsDisplay'
import PromptOptimizer from './components/PromptOptimizer'
import { fixTranscriptEncoding, hasMojibake } from '@/lib/fix-encoding'

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

export default function Home() {
  const [transcript, setTranscript] = useState('')
  const [variables, setVariables] = useState<Variable[]>([])
  const [optimizationResults, setOptimizationResults] = useState<OptimizationResult[]>([])
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([])
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [currentStep, setCurrentStep] = useState<'input' | 'optimize' | 'results'>('input')
  const [encodingFixed, setEncodingFixed] = useState(false)

  const handleTranscriptChange = useCallback((value: string) => {
    const { text, wasFixed } = fixTranscriptEncoding(value)
    setTranscript(text)
    setEncodingFixed(wasFixed)
  }, [])

  // True when we came back via "Try Another Transcript" and already have optimized prompts
  const hasExistingOptimization = optimizationResults.length > 0

  const handleOptimizePrompts = async () => {
    if (!transcript.trim() || variables.length === 0) {
      alert('Please provide a transcript and at least one variable')
      return
    }

    // If we already have optimization results (from a previous run), skip re-optimizing
    if (hasExistingOptimization) {
      setAnalysisResults([])
      setCurrentStep('optimize')
      return
    }

    setIsOptimizing(true)
    setCurrentStep('optimize')

    try {
      const response = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables, transcript })
      })

      const results = await response.json()
      setOptimizationResults(results)
    } catch (error) {
      console.error('Optimization failed:', error)
      alert('Optimization failed. Please try again.')
    } finally {
      setIsOptimizing(false)
    }
  }

  const handleRunAnalysis = async (promptChoices: Record<string, 'original' | 'optimized'>) => {
    setAnalysisResults([])
    setIsAnalyzing(true)
    setCurrentStep('results')

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          variables,
          optimizationResults,
          promptChoices
        })
      })

      const results = await response.json()
      setAnalysisResults(results)
    } catch (error) {
      console.error('Analysis failed:', error)
      alert('Analysis failed. Please try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const resetForm = () => {
    setTranscript('')
    setVariables([])
    setOptimizationResults([])
    setAnalysisResults([])
    setCurrentStep('input')
  }

  const handleNewTranscript = () => {
    setTranscript('')
    setAnalysisResults([])
    setEncodingFixed(false)
    setCurrentStep('input')
    // variables and optimizationResults are preserved
  }

  return (
    <div className="space-y-8">
      {/* Progress Indicator */}
      <div className="flex items-center justify-center space-x-8">
        <div className={`flex items-center space-x-2 ${
          currentStep === 'input'
            ? 'text-primary-600'
            : (currentStep === 'optimize' || currentStep === 'results')
              ? 'text-green-600'
              : 'text-gray-400'
        }`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
            currentStep === 'input'
              ? 'bg-primary-600'
              : (currentStep === 'optimize' || currentStep === 'results')
                ? 'bg-green-600'
                : 'bg-gray-400'
          }`}>
            1
          </div>
          <span className="font-medium">Input Data</span>
        </div>

        <div className={`w-16 h-0.5 ${(currentStep === 'optimize' || currentStep === 'results') ? 'bg-green-600' : 'bg-gray-300'}`} />

        <div className={`flex items-center space-x-2 ${currentStep === 'optimize' ? 'text-primary-600' : currentStep === 'results' ? 'text-green-600' : 'text-gray-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${currentStep === 'optimize' ? 'bg-primary-600' : currentStep === 'results' ? 'bg-green-600' : 'bg-gray-400'}`}>
            2
          </div>
          <span className="font-medium">Optimize Prompts</span>
        </div>

        <div className={`w-16 h-0.5 ${currentStep === 'results' ? 'bg-green-600' : 'bg-gray-300'}`} />

        <div className={`flex items-center space-x-2 ${currentStep === 'results' ? 'text-primary-600' : 'text-gray-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${currentStep === 'results' ? 'bg-primary-600' : 'bg-gray-400'}`}>
            3
          </div>
          <span className="font-medium">View Results</span>
        </div>
      </div>

      {/* Input Section */}
      {currentStep === 'input' && (
        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex items-center space-x-2 mb-4">
              <DocumentTextIcon className="w-5 h-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-gray-900">Call Transcript</h2>
            </div>
            <textarea
              value={transcript}
              onChange={(e) => handleTranscriptChange(e.target.value)}
              placeholder="Paste your call transcript here..."
              className="textarea h-32 w-full"
            />
            {encodingFixed && (
              <div className="flex items-start space-x-2 mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">Encoding auto-corrected</p>
                  <p>The transcript contained garbled Hindi text (MacRoman encoding issue). It has been automatically converted to proper Devanagari script.</p>
                </div>
              </div>
            )}
            <p className="text-sm text-gray-500 mt-2">
              Provide the call transcript that you want to analyze for variable extraction.
            </p>
          </div>

          <VariableInput
            variables={variables}
            onVariablesChange={setVariables}
          />

          {hasExistingOptimization && (
            <div className="flex items-center space-x-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <DocumentTextIcon className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <p className="text-sm text-blue-800">
                Variables and optimized prompts from your previous session are preserved. Paste a new transcript and continue to analysis.
              </p>
            </div>
          )}

          <div className="flex justify-between">
            <button
              onClick={resetForm}
              className="btn-secondary px-4 py-2"
            >
              Reset All
            </button>
            <button
              onClick={handleOptimizePrompts}
              disabled={!transcript.trim() || variables.length === 0 || isOptimizing}
              className="btn-primary px-6 py-2 flex items-center space-x-2"
            >
              <SparklesIcon className="w-4 h-4" />
              <span>{isOptimizing ? 'Optimizing...' : hasExistingOptimization ? 'Use Existing Prompts' : 'Optimize Prompts'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Optimization Section */}
      {currentStep === 'optimize' && optimizationResults.length > 0 && (
        <PromptOptimizer
          optimizationResults={optimizationResults}
          onRunAnalysis={handleRunAnalysis}
          isAnalyzing={isAnalyzing}
        />
      )}

      {/* Results Section */}
      {currentStep === 'results' && analysisResults.length > 0 && (
        <ResultsDisplay
          results={analysisResults}
          onStartOver={resetForm}
          onNewTranscript={handleNewTranscript}
          onRetry={async (variableNames) => {
            setIsAnalyzing(true)
            try {
              // Build promptChoices and filter variables for just the ones being retried
              const retryVariables = variables.filter(v => variableNames.includes(v.name))
              const promptChoices: Record<string, 'original' | 'optimized'> = {}
              for (const r of analysisResults) {
                if (variableNames.includes(r.variable)) {
                  promptChoices[r.variable] = r.promptUsed
                }
              }

              const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  transcript,
                  variables: retryVariables,
                  optimizationResults,
                  promptChoices
                })
              })

              const retryResults: AnalysisResult[] = await response.json()

              // Merge retry results back into the full results list
              setAnalysisResults(prev =>
                prev.map(existing => {
                  const updated = retryResults.find(r => r.variable === existing.variable)
                  return updated ?? existing
                })
              )
            } catch (error) {
              console.error('Retry failed:', error)
              alert('Retry failed. Please try again.')
            } finally {
              setIsAnalyzing(false)
            }
          }}
          isRetrying={isAnalyzing}
        />
      )}

      {/* Loading States */}
      {isOptimizing && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center space-x-3">
            <SparklesIcon className="w-8 h-8 text-primary-600 animate-spin" />
            <div>
              <p className="text-lg font-medium text-gray-900">Optimizing Prompts</p>
              <p className="text-sm text-gray-500">Using AI to improve prompt performance...</p>
            </div>
          </div>
        </div>
      )}

      {isAnalyzing && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center space-x-3">
            <ClockIcon className="w-8 h-8 text-primary-600 animate-pulse" />
            <div>
              <p className="text-lg font-medium text-gray-900">Analyzing Transcript</p>
              <p className="text-sm text-gray-500">Running variable extraction analysis...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}