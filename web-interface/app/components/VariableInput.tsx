'use client'

import { useState } from 'react'
import { PlusIcon, XMarkIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'

interface Variable {
  id: string
  name: string
  type: 'boolean' | 'string' | 'number'
  description: string
}

interface VariableInputProps {
  variables: Variable[]
  onVariablesChange: (variables: Variable[]) => void
}

export default function VariableInput({ variables, onVariablesChange }: VariableInputProps) {
  const [newVariable, setNewVariable] = useState<Omit<Variable, 'id'>>({
    name: '',
    type: 'boolean',
    description: ''
  })

  const addVariable = () => {
    if (!newVariable.name.trim() || !newVariable.description.trim()) {
      alert('Please fill in all fields')
      return
    }

    const variable: Variable = {
      id: Date.now().toString(),
      ...newVariable
    }

    onVariablesChange([...variables, variable])
    setNewVariable({ name: '', type: 'boolean', description: '' })
  }

  const removeVariable = (id: string) => {
    onVariablesChange(variables.filter(v => v.id !== id))
  }

  const updateVariable = (id: string, updates: Partial<Variable>) => {
    onVariablesChange(variables.map(v =>
      v.id === id ? { ...v, ...updates } : v
    ))
  }

  return (
    <div className="card p-6">
      <div className="flex items-center space-x-2 mb-4">
        <Cog6ToothIcon className="w-5 h-5 text-primary-600" />
        <h2 className="text-lg font-semibold text-gray-900">Variables to Extract</h2>
      </div>

      {/* Existing Variables */}
      {variables.length > 0 && (
        <div className="space-y-3 mb-6">
          {variables.map((variable) => (
            <div key={variable.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Variable Name
                  </label>
                  <input
                    type="text"
                    value={variable.name}
                    onChange={(e) => updateVariable(variable.id, { name: e.target.value })}
                    className="input"
                    placeholder="e.g. customer_sentiment"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Type
                  </label>
                  <select
                    value={variable.type}
                    onChange={(e) => updateVariable(variable.id, { type: e.target.value as Variable['type'] })}
                    className="input"
                  >
                    <option value="boolean">Boolean</option>
                    <option value="string">String</option>
                    <option value="number">Number</option>
                  </select>
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={variable.description}
                    onChange={(e) => updateVariable(variable.id, { description: e.target.value })}
                    className="input"
                    placeholder="What should this variable capture?"
                  />
                </div>
              </div>
              <button
                onClick={() => removeVariable(variable.id)}
                className="mt-6 p-1 text-gray-400 hover:text-red-600 transition-colors"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add New Variable */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Add New Variable</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <input
              type="text"
              value={newVariable.name}
              onChange={(e) => setNewVariable({ ...newVariable, name: e.target.value })}
              placeholder="Variable name"
              className="input"
            />
          </div>
          <div>
            <select
              value={newVariable.type}
              onChange={(e) => setNewVariable({ ...newVariable, type: e.target.value as Variable['type'] })}
              className="input"
            >
              <option value="boolean">Boolean</option>
              <option value="string">String</option>
              <option value="number">Number</option>
            </select>
          </div>
          <div>
            <input
              type="text"
              value={newVariable.description}
              onChange={(e) => setNewVariable({ ...newVariable, description: e.target.value })}
              placeholder="Description"
              className="input"
            />
          </div>
        </div>
        <button
          onClick={addVariable}
          className="btn-secondary px-3 py-1 text-sm flex items-center space-x-1"
        >
          <PlusIcon className="w-4 h-4" />
          <span>Add Variable</span>
        </button>
      </div>

      <div className="mt-4 text-sm text-gray-500">
        <p>Define the variables you want to extract from the call transcript. Each variable will get its own optimized prompt.</p>
      </div>
    </div>
  )
}