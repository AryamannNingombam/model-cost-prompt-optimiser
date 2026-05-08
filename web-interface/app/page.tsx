'use client'

import { useState } from 'react'
import { PlayIcon, SparklesIcon, ClockIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import VariableInput from './components/VariableInput'
import ResultsDisplay from './components/ResultsDisplay'
import PromptOptimizer from './components/PromptOptimizer'

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

  const handleOptimizePrompts = async () => {
    if (!transcript.trim() || variables.length === 0) {
      alert('Please provide a transcript and at least one variable')
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
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste your call transcript here..."
              className="textarea h-32 w-full"
            />
            <p className="text-sm text-gray-500 mt-2">
              Provide the call transcript that you want to analyze for variable extraction.
            </p>
          </div>

          <VariableInput
            variables={variables}
            onVariablesChange={setVariables}
          />

          <div className="flex justify-between">
            <button
              onClick={resetForm}
              className="btn-secondary px-4 py-2"
            >
              Reset Form
            </button>
            <button
              onClick={handleOptimizePrompts}
              disabled={!transcript.trim() || variables.length === 0 || isOptimizing}
              className="btn-primary px-6 py-2 flex items-center space-x-2"
            >
              <SparklesIcon className="w-4 h-4" />
              <span>{isOptimizing ? 'Optimizing...' : 'Optimize Prompts'}</span>
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