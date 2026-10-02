import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { Home, Moon, Sun, BookOpen, LogOut, ShieldCheck } from 'lucide-react'
import axios from 'axios'
import { Toaster } from 'sonner'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Dashboard from './components/Dashboard'
import ClusterDetails from './components/ClusterDetails'
import { ErrorBoundary } from './components/ErrorBoundary'
import AuthGate from './components/AuthGate'
import { ConfirmProvider } from './components/ui/confirm-dialog'
import { useAppStore } from './store/appStore'
import { useClusterInfo } from './hooks/useClusterInfo'
import { useAuthStatus, useLogout } from './hooks/useAuth'
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

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  readwrite: 'Operator',
  readonly: 'Viewer',
}

// Colour the badge by privilege, so the active access level is obvious at a
// glance rather than having to infer it from which buttons are missing.
const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  readwrite: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  readonly: 'bg-muted text-muted-foreground',
}

/**
 * The access level in force right now, in every auth mode.
 *
 * This used to render nothing when auth.mode was 'none', which left operators
 * unable to tell whether the anonymous default was admin or read-only.
 */
function UserMenu() {
  const { data: status } = useAuthStatus()
  const logout = useLogout()

  if (!status) return null

  const label = ROLE_LABEL[status.role] ?? status.role
  const anonymous = status.mode === 'none'

  const text = anonymous ? `No login · ${label}` : `${status.subject} · ${label}`
  const title = anonymous
    ? `Anonymous access from auth.mode: none (auth.default_role: ${status.default_role}). Change it in config.yml.`
    : `Signed in as ${status.subject} (${status.mode} auth), role: ${status.role}`

  return (
    <div className="flex items-center gap-1">
      <span
        className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_BADGE[status.role] ?? ROLE_BADGE.readonly}`}
        title={title}
      >
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        {text}
      </span>
      {status.authenticated && !anonymous && (
        <button
          onClick={() => logout.mutate()}
          className="p-2 hover:bg-accent rounded-md transition-colors"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

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
            <UserMenu />
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
        <ConfirmProvider>
        <BrowserRouter basename={basename}>
          <Toaster position="top-right" richColors closeButton aria-live="polite" />
          <div className="min-h-screen bg-background flex flex-col">
            <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md">
              Skip to main content
            </a>
            <Header />

            <main id="main-content" className="flex-1">
              <AuthGate>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
                </Routes>
              </AuthGate>
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
        </ConfirmProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
