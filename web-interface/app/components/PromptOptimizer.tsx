'use client'

import { useState } from 'react'
import { PlayIcon, CheckIcon, SparklesIcon } from '@heroicons/react/24/outline'

interface OptimizationResult {
  variable: string
  originalPrompt: string
  optimizedPrompt: string
  improvements: string[]
  rationale: string
}

interface PromptOptimizerProps {
  optimizationResults: OptimizationResult[]
  onRunAnalysis: (promptChoices: Record<string, 'original' | 'optimized'>) => void
  isAnalyzing: boolean
}

export default function PromptOptimizer({ optimizationResults, onRunAnalysis, isAnalyzing }: PromptOptimizerProps) {
  const [promptChoices, setPromptChoices] = useState<Record<string, 'original' | 'optimized'>>(() => {
    const initialChoices: Record<string, 'original' | 'optimized'> = {}
    optimizationResults.forEach(result => {
      initialChoices[result.variable] = 'optimized' // Default to optimized
    })
    return initialChoices
  })

  const handleChoiceChange = (variable: string, choice: 'original' | 'optimized') => {
    setPromptChoices(prev => ({
      ...prev,
      [variable]: choice
    }))
  }

  const handleRunAnalysis = () => {
    onRunAnalysis(promptChoices)
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Prompt Optimization Results</h2>
        <p className="text-gray-600">
          Review the optimized prompts and choose which version to use for analysis
        </p>
      </div>

      {optimizationResults.map((result) => (
        <div key={result.variable} className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">{result.variable}</h3>
            <div className="flex space-x-2">
              <button
                onClick={() => handleChoiceChange(result.variable, 'original')}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  promptChoices[result.variable] === 'original'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Original
              </button>
              <button
                onClick={() => handleChoiceChange(result.variable, 'optimized')}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  promptChoices[result.variable] === 'optimized'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Optimized
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Original Prompt */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                <h4 className="font-medium text-gray-700">Original Prompt</h4>
              </div>
              <div className="bg-gray-50 p-3 rounded border-l-4 border-gray-400">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                  {result.originalPrompt}
                </pre>
              </div>
            </div>

            {/* Optimized Prompt */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <h4 className="font-medium text-gray-700">Optimized Prompt</h4>
                {promptChoices[result.variable] === 'optimized' && (
                  <CheckIcon className="w-4 h-4 text-green-600" />
                )}
              </div>
              <div className="bg-green-50 p-3 rounded border-l-4 border-green-500">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                  {result.optimizedPrompt}
                </pre>
              </div>
            </div>
          </div>

          {/* Improvements & Rationale */}
          <div className="mt-6 pt-4 border-t">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h5 className="font-medium text-gray-700 mb-2">Key Improvements</h5>
                <ul className="space-y-1">
                  {result.improvements.map((improvement, idx) => (
                    <li key={idx} className="text-sm text-gray-600 flex items-start space-x-2">
                      <SparklesIcon className="w-3 h-3 text-primary-600 mt-0.5 flex-shrink-0" />
                      <span>{improvement}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h5 className="font-medium text-gray-700 mb-2">Optimization Rationale</h5>
                <p className="text-sm text-gray-600">{result.rationale}</p>
              </div>
            </div>
          </div>
        </div>
      ))}

      <div className="flex justify-center pt-6">
        <button
          onClick={handleRunAnalysis}
          disabled={isAnalyzing}
          className="btn-primary px-8 py-3 flex items-center space-x-2 text-lg"
        >
          <PlayIcon className="w-5 h-5" />
          <span>{isAnalyzing ? 'Running Analysis...' : 'Run Analysis'}</span>
        </button>
      </div>

      <div className="text-center text-sm text-gray-500">
        <p>Selected: {Object.values(promptChoices).filter(choice => choice === 'optimized').length} optimized, {Object.values(promptChoices).filter(choice => choice === 'original').length} original</p>
      </div>
    </div>
  )
}