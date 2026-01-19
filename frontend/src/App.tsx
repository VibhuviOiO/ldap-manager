import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { Home, Moon, Sun } from 'lucide-react'
import Dashboard from './components/Dashboard'
import ClusterDetails from './components/ClusterDetails'
import logo from './assets/ldap.svg'

function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const isClusterPage = location.pathname.startsWith('/cluster/')
  const clusterName = isClusterPage ? decodeURIComponent(location.pathname.split('/cluster/')[1]) : ''
  const [clusterInfo, setClusterInfo] = useState<any>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme')
    return (saved as 'light' | 'dark') || 'light'
  })

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    if (isClusterPage && clusterName) {
      fetch('/api/clusters/list')
        .then(res => res.json())
        .then(data => {
          const cluster = data.clusters.find((c: any) => c.name === clusterName)
          setClusterInfo(cluster)
        })
        .catch(() => {})
    }
  }, [isClusterPage, clusterName])

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
              >
                <Home className="h-4 w-4" />
                <span>Clusters</span>
              </button>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="p-2 hover:bg-accent rounded-md transition-colors"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
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
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background flex flex-col">
        <Header />

        <main className="flex-1">
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
  )
}

export default App
