import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Database } from 'lucide-react'
import Dashboard from './components/Dashboard'
import ClusterDetails from './components/ClusterDetails'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card sticky top-0 z-50 shadow-sm">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Database className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">LDAP Manager</h1>
                <p className="text-xs text-muted-foreground">Multi-cluster directory management</p>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-6 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
          </Routes>
        </main>

        <footer className="border-t bg-card/50 mt-20">
          <div className="container mx-auto px-6 py-4">
            <p 
              className="text-xs text-muted-foreground text-center"
              dangerouslySetInnerHTML={{ __html: import.meta.env.VITE_FOOTER_TEXT }}
            />
          </div>
        </footer>
      </div>
    </BrowserRouter>
  )
}

export default App
