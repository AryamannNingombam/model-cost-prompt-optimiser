import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Model Cost Optimizer - Testing Interface',
  description: 'Test and optimize AI model prompts for cost reduction',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <div className="min-h-screen">
          <header className="bg-white shadow-sm border-b">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <h1 className="text-2xl font-bold text-gray-900">
                    💰 Model Cost Optimizer
                  </h1>
                  <span className="ml-3 text-sm text-gray-500">
                    Testing Interface
                  </span>
                </div>
                <nav className="flex items-center space-x-4 text-sm">
                  <a href="/" className="text-gray-600 hover:text-gray-900 font-medium">Single</a>
                  <a href="/bulk" className="text-gray-600 hover:text-gray-900 font-medium">Bulk Analysis</a>
                </nav>
              </div>
            </div>
          </header>
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}