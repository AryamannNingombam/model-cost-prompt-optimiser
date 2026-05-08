'use client'

import { CheckCircleIcon, XCircleIcon, ClockIcon, DocumentTextIcon } from '@heroicons/react/24/outline'

interface AnalysisResult {
  variable: string
  value: any
  reason: string
  latency: number
  rawOutput: string
  promptUsed: 'original' | 'optimized'
}

interface ResultsDisplayProps {
  results: AnalysisResult[]
  onStartOver: () => void
}

export default function ResultsDisplay({ results, onStartOver }: ResultsDisplayProps) {
  const averageLatency = results.reduce((acc, result) => acc + result.latency, 0) / results.length
  const optimizedCount = results.filter(r => r.promptUsed === 'optimized').length

  const formatValue = (value: any) => {
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No'
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2)
    }
    return String(value)
  }

  const getValueIcon = (value: any) => {
    if (typeof value === 'boolean') {
      return value ? (
        <CheckCircleIcon className="w-5 h-5 text-green-600" />
      ) : (
        <XCircleIcon className="w-5 h-5 text-red-600" />
      )
    }
    return <DocumentTextIcon className="w-5 h-5 text-blue-600" />
  }

  const getValueColor = (value: any) => {
    if (typeof value === 'boolean') {
      return value ? 'text-green-700' : 'text-red-700'
    }
    return 'text-blue-700'
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Analysis Results</h2>
        <div className="flex justify-center space-x-8 text-sm text-gray-600">
          <div className="flex items-center space-x-1">
            <ClockIcon className="w-4 h-4" />
            <span>Avg Latency: {averageLatency.toFixed(0)}ms</span>
          </div>
          <div className="flex items-center space-x-1">
            <CheckCircleIcon className="w-4 h-4 text-green-600" />
            <span>{optimizedCount} optimized prompts used</span>
          </div>
          <div className="flex items-center space-x-1">
            <DocumentTextIcon className="w-4 h-4 text-blue-600" />
            <span>{results.length} variables analyzed</span>
          </div>
        </div>
      </div>

      {/* Results Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-1">
        {results.map((result) => (
          <div key={result.variable} className="card p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                {getValueIcon(result.value)}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{result.variable}</h3>
                  <div className="flex items-center space-x-2 text-sm text-gray-500">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      result.promptUsed === 'optimized'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {result.promptUsed} prompt
                    </span>
                    <span>•</span>
                    <span>{result.latency}ms</span>
                  </div>
                </div>
              </div>
              <div className={`text-right ${getValueColor(result.value)}`}>
                <div className="text-lg font-semibold">
                  {formatValue(result.value)}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {/* Reasoning */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-1">Reasoning</h4>
                <p className="text-sm text-gray-600">{result.reason}</p>
              </div>

              {/* Raw Output */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-1">Raw Model Output</h4>
                <div className="bg-gray-50 p-3 rounded border text-xs font-mono text-gray-700 max-h-32 overflow-y-auto">
                  <pre className="whitespace-pre-wrap">{result.rawOutput}</pre>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex justify-center space-x-4 pt-6">
        <button
          onClick={onStartOver}
          className="btn-secondary px-6 py-2"
        >
          Start Over
        </button>
        <button
          onClick={() => {
            const csvContent = [
              ['Variable', 'Value', 'Prompt Used', 'Latency (ms)', 'Reason'].join(','),
              ...results.map(r => [
                r.variable,
                formatValue(r.value),
                r.promptUsed,
                r.latency,
                `"${r.reason.replace(/"/g, '""')}"`
              ].join(','))
            ].join('\n')

            const blob = new Blob([csvContent], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `analysis-results-${new Date().toISOString().slice(0, 10)}.csv`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
          }}
          className="btn-primary px-6 py-2"
        >
          Export Results
        </button>
      </div>
    </div>
  )
}