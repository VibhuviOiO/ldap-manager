import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { Home, Moon, Sun, BookOpen } from 'lucide-react'
import axios from 'axios'
import { Toaster } from 'sonner'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Dashboard from './components/Dashboard'
import ClusterDetails from './components/ClusterDetails'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useAppStore } from './store/appStore'
import { useClusterInfo } from './hooks/useClusterInfo'
import logo from './assets/ldap.svg'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

// Configure axios base URL with context path
const contextPath = import.meta.env.VITE_CONTEXT_PATH || ''
axios.defaults.baseURL = contextPath

function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const isClusterPage = location.pathname.startsWith('/cluster/')
  const clusterName = isClusterPage ? decodeURIComponent(location.pathname.split('/cluster/')[1]) : ''
  const { data: clusterInfo } = useClusterInfo(clusterName)
  const { theme, setTheme } = useAppStore()

  return (
    <header className="border-b bg-card sticky top-0 z-50 backdrop-blur-sm bg-card/95">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <img src={logo} alt="Logo" className="h-10" />
              <div>
                <h1 className="text-xl font-bold text-foreground">LDAP Manager</h1>
                <p className="text-xs text-muted-foreground">Multi-cluster directory management</p>
              </div>
            </div>
            {isClusterPage && (
              <button
                onClick={() => navigate('/')}
                className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                aria-label="Back to clusters"
              >
                <Home className="h-4 w-4" aria-hidden="true" />
                <span>Clusters</span>
              </button>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <a
              href="https://vibhuvioio.com/ldap-manager/"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 hover:bg-accent rounded-md transition-colors"
              aria-label="Documentation"
            >
              <BookOpen className="h-5 w-5" aria-hidden="true" />
            </a>
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="p-2 hover:bg-accent rounded-md transition-colors"
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <Moon className="h-5 w-5" aria-hidden="true" /> : <Sun className="h-5 w-5" aria-hidden="true" />}
            </button>
          {isClusterPage && (
            <div className="text-right">
              <h2 className="text-lg font-semibold text-foreground">{clusterName}</h2>
              <p className="text-xs text-muted-foreground">{clusterInfo?.description || 'LDAP Directory'}</p>
            </div>
          )}
          </div>
        </div>
      </div>
    </header>
  )
}

function App() {
  const basename = import.meta.env.VITE_CONTEXT_PATH || '/'
  
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={basename}>
          <Toaster position="top-right" richColors closeButton aria-live="polite" />
          <div className="min-h-screen bg-background flex flex-col">
            <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md">
              Skip to main content
            </a>
            <Header />

            <main id="main-content" className="flex-1">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
              </Routes>
            </main>

            <footer className="border-t bg-card/50">
              <div className="container mx-auto px-6 py-4">
                <p 
                  className="text-xs text-muted-foreground text-center"
                  dangerouslySetInnerHTML={{ __html: import.meta.env.VITE_FOOTER_TEXT }}
                />
              </div>
            </footer>
          </div>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
