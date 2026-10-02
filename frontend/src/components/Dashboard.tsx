import { memo } from 'react'
import { FileCog } from 'lucide-react'
import HomeKpis from './HomeKpis'
import { useAuthStatus } from '@/hooks/useAuth'

function Dashboard() {
  const { data: authStatus } = useAuthStatus()
  const isAdmin = authStatus?.role === 'admin'

  return (
    <main className="container mx-auto px-6 py-8 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">LDAP Clusters</h2>
          <p className="text-lg text-muted-foreground">Manage and monitor your directory services</p>
        </div>
      </div>

      {/* Clusters are declared in config.yml only, so say where they come from. */}
      {isAdmin && (
        <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-4 py-3">
          <FileCog className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            Clusters come from <span className="font-medium text-foreground">config.yml</span>. Edit
            that file to add, change or remove one — it takes effect immediately, no restart. Bind
            passwords are supplied by each cluster's <code className="font-mono">credential</code>{' '}
            block (<code className="font-mono">env</code> or{' '}
            <code className="font-mono">file</code>), never stored by this app.
          </p>
        </div>
      )}

      <HomeKpis />
    </main>
  )
}

export default memo(Dashboard)
