import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, Boxes, Database, Download, FolderTree, Layers,
  RefreshCw, Server, Users,
} from 'lucide-react'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { clusterService } from '@/services'
import { useAuthStatus } from '@/hooks/useAuth'
import type { DashboardCluster } from '@/services/api/ClusterService'

const STATUS_STYLE: Record<string, { label: string; dot: string; pill: string }> = {
  ok: { label: 'Healthy', dot: 'bg-emerald-500', pill: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  password_required: { label: 'Password needed', dot: 'bg-amber-500', pill: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  unreachable: { label: 'Unreachable', dot: 'bg-red-500', pill: 'bg-red-500/10 text-red-700 dark:text-red-400' },
  slow: { label: 'Slow', dot: 'bg-amber-500', pill: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
}

/** Tiles that answer "what am I looking at?" in one glance. */
function Tile({
  icon: Icon, label, value, sub, tone,
}: {
  icon: typeof Database
  label: string
  value: number | string
  sub?: string
  tone: string
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-3xl font-bold mt-1 tabular-nums">{value.toLocaleString?.() ?? value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <span className={`p-2 rounded-lg ${tone}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

/** One cluster, with a proportional bar of what it actually contains. */
function ClusterCard({ cluster, isAdmin }: { cluster: DashboardCluster; isAdmin: boolean }) {
  const navigate = useNavigate()
  const status = STATUS_STYLE[cluster.status] ?? STATUS_STYLE.unreachable
  const total = Math.max(1, cluster.total)

  const segments = [
    { key: 'users', value: cluster.users, className: 'bg-emerald-500', label: 'Users' },
    { key: 'groups', value: cluster.groups, className: 'bg-sky-500', label: 'Groups' },
    { key: 'ous', value: cluster.ous, className: 'bg-violet-500', label: 'OUs' },
    { key: 'other', value: cluster.other, className: 'bg-slate-400', label: 'Other' },
  ]

  return (
    <Card
      className="hover:shadow-lg hover:border-primary/40 transition-all duration-200 cursor-pointer"
      onClick={() => navigate(`/cluster/${encodeURIComponent(cluster.name)}?view=users`)}
    >
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-lg truncate">{cluster.name}</h3>
            <p className="text-xs text-muted-foreground truncate">
              {cluster.description || cluster.host || '—'}
            </p>
          </div>
          <span className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full ${status.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </div>

        <div className="flex items-end gap-4">
          <div>
            <p className="text-2xl font-bold tabular-nums leading-none">{cluster.total.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground mt-1">entries</p>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground pb-0.5">
            <span><span className="font-semibold text-foreground tabular-nums">{cluster.users}</span> users</span>
            <span><span className="font-semibold text-foreground tabular-nums">{cluster.groups}</span> groups</span>
            <span><span className="font-semibold text-foreground tabular-nums">{cluster.ous}</span> OUs</span>
          </div>
        </div>

        {/* Composition bar - the point of the page: shape, not just size. */}
        <div className="h-2 w-full rounded-full overflow-hidden flex bg-muted" role="img"
             aria-label={`${cluster.users} users, ${cluster.groups} groups, ${cluster.ous} OUs, ${cluster.other} other`}>
          {segments.map((s) => (
            s.value > 0 ? (
              <span key={s.key} className={s.className} style={{ width: `${(s.value / total) * 100}%` }}
                    title={`${s.label}: ${s.value}`} />
            ) : null
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {cluster.nodes > 1 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              <Server className="h-3 w-3" aria-hidden="true" /> {cluster.nodes} nodes
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              <Database className="h-3 w-3" aria-hidden="true" /> single node
            </span>
          )}
          {cluster.tls_mode !== 'none' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium">
              {cluster.tls_mode === 'ldaps' ? 'LDAPS' : 'StartTLS'}
            </span>
          )}
          {cluster.readonly && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              read-only
            </span>
          )}
          <span className="ml-auto flex items-center gap-3">
            {isAdmin && (
              <a
                href={`${CONTEXT_PATH}/api/backup/${encodeURIComponent(cluster.name)}`}
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                title="Download this directory as LDIF"
              >
                <Download className="h-3 w-3" aria-hidden="true" /> Backup
              </a>
            )}
            <span className="inline-flex items-center gap-1 text-primary-readable font-medium">
              Open <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

const CONTEXT_PATH = import.meta.env.VITE_CONTEXT_PATH || ''

export default function HomeKpis() {
  // Backup is an admin-only full-directory dump; the card links to it so the
  // home page covers what the old management list used to.
  const { data: authStatus } = useAuthStatus()
  const isAdmin = authStatus?.role === 'admin'
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => clusterService.getDashboardSummary(),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4 h-24 animate-pulse bg-muted/40" /></Card>
        ))}
      </div>
    )
  }

  if (!data) return null

  const t = data.totals
  const attention = data.clusters.filter((c) => c.status !== 'ok')

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={Database} label="Clusters" value={t.clusters}
              sub={`${t.healthy} healthy${t.replicated ? ` · ${t.replicated} replicated` : ''}`}
              tone="bg-primary/15 text-primary-readable" />
        <Tile icon={Layers} label="Entries" value={t.entries}
              sub="across all clusters" tone="bg-violet-500/10 text-violet-600 dark:text-violet-400" />
        <Tile icon={Users} label="Users" value={t.users}
              tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" />
        <Tile icon={FolderTree} label="Groups + OUs" value={t.groups + t.ous}
              sub={`${t.groups} groups · ${t.ous} OUs`}
              tone="bg-sky-500/10 text-sky-600 dark:text-sky-400" />
      </div>

      {attention.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm">
              <p className="font-medium">
                {attention.length} cluster{attention.length > 1 ? 's' : ''} need attention
              </p>
              <p className="text-muted-foreground text-xs mt-0.5">
                {attention.map((c) => `${c.name} (${STATUS_STYLE[c.status]?.label ?? c.status})`).join(' · ')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Boxes className="h-5 w-5 text-primary-readable" aria-hidden="true" />
          Your directories
        </h2>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {data.clusters.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No clusters yet. Add one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.clusters.map((cluster) => (
            <ClusterCard key={cluster.name} cluster={cluster} isAdmin={isAdmin} />
          ))}
        </div>
      )}
    </div>
  )
}
