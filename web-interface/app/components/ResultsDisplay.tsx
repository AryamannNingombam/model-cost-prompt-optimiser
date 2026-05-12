'use client'

import { CheckCircleIcon, XCircleIcon, ClockIcon, DocumentTextIcon, ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'

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
  onNewTranscript?: () => void
  onRetry?: (variableNames: string[]) => void
  isRetrying?: boolean
}

function isFailedResult(result: AnalysisResult): boolean {
  const reason = result.reason.toLowerCase()
  const raw = result.rawOutput.toLowerCase()
  return (
    reason.includes('analysis failed') ||
    reason.includes('api_error') ||
    reason.includes('json_parse_error') ||
    raw.startsWith('error:') ||
    reason.includes('api request failed')
  )
}

export default function ResultsDisplay({ results, onStartOver, onNewTranscript, onRetry, isRetrying }: ResultsDisplayProps) {
  const averageLatency = results.reduce((acc, result) => acc + result.latency, 0) / results.length
  const optimizedCount = results.filter(r => r.promptUsed === 'optimized').length
  const failedResults = results.filter(isFailedResult)
  const failedCount = failedResults.length

  const formatValue = (value: any) => {
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No'
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2)
    }
    return String(value)
  }

  const getValueIcon = (result: AnalysisResult) => {
    if (isFailedResult(result)) {
      return <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />
    }
    if (typeof result.value === 'boolean') {
      return result.value ? (
        <CheckCircleIcon className="w-5 h-5 text-green-600" />
      ) : (
        <XCircleIcon className="w-5 h-5 text-red-600" />
      )
    }
    return <DocumentTextIcon className="w-5 h-5 text-blue-600" />
  }

  const getValueColor = (result: AnalysisResult) => {
    if (isFailedResult(result)) return 'text-amber-600'
    if (typeof result.value === 'boolean') {
      return result.value ? 'text-green-700' : 'text-red-700'
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
          {failedCount > 0 && (
            <div className="flex items-center space-x-1">
              <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
              <span className="text-amber-600 font-medium">{failedCount} failed</span>
            </div>
          )}
        </div>
      </div>

      {/* Retry All Failed Banner */}
      {failedCount > 0 && onRetry && (
        <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-600" />
            <span className="text-sm text-amber-800">
              {failedCount} variable{failedCount > 1 ? 's' : ''} failed during analysis (likely a temporary API issue).
            </span>
          </div>
          <button
            onClick={() => onRetry(failedResults.map(r => r.variable))}
            disabled={isRetrying}
            className="flex items-center space-x-1.5 px-4 py-1.5 text-sm font-medium text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-md border border-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowPathIcon className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
            <span>{isRetrying ? 'Retrying...' : 'Retry All Failed'}</span>
          </button>
        </div>
      )}

      {/* Results Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-1">
        {results.map((result) => {
          const failed = isFailedResult(result)

          return (
            <div key={result.variable} className={`card p-6 ${failed ? 'border-amber-300 bg-amber-50/30' : ''}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  {getValueIcon(result)}
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
                      <span>·</span>
                      <span>{result.latency}ms</span>
                      {failed && (
                        <>
                          <span>·</span>
                          <span className="text-amber-600 font-medium">Failed</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  {failed && onRetry && (
                    <button
                      onClick={() => onRetry([result.variable])}
                      disabled={isRetrying}
                      className="flex items-center space-x-1 px-3 py-1 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded border border-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Retry this variable"
                    >
                      <ArrowPathIcon className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                      <span>Retry</span>
                    </button>
                  )}
                  <div className={`text-right ${getValueColor(result)}`}>
                    <div className="text-lg font-semibold">
                      {failed ? 'Error' : formatValue(result.value)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {/* Reasoning */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-1">Reasoning</h4>
                  <p className={`text-sm ${failed ? 'text-amber-700' : 'text-gray-600'}`}>{result.reason}</p>
                </div>

                {/* Raw Output */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-1">Raw Model Output</h4>
                  <div className={`p-3 rounded border text-xs font-mono max-h-32 overflow-y-auto ${
                    failed ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-gray-50 text-gray-700'
                  }`}>
                    <pre className="whitespace-pre-wrap">{result.rawOutput}</pre>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex justify-center space-x-4 pt-6">
        <button
          onClick={onStartOver}
          className="btn-secondary px-6 py-2"
        >
          Start Over
        </button>
        {onNewTranscript && (
          <button
            onClick={onNewTranscript}
            className="btn-secondary px-6 py-2 flex items-center space-x-2"
          >
            <DocumentTextIcon className="w-4 h-4" />
            <span>Try Another Transcript</span>
          </button>
        )}
        <button
          onClick={() => {
            const csvContent = [
              ['Variable', 'Value', 'Prompt Used', 'Latency (ms)', 'Status', 'Reason'].join(','),
              ...results.map(r => [
                r.variable,
                isFailedResult(r) ? 'ERROR' : formatValue(r.value),
                r.promptUsed,
                r.latency,
                isFailedResult(r) ? 'Failed' : 'Success',
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
