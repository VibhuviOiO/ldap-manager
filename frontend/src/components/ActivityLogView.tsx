import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, Loader2, Search, User } from 'lucide-react'
import { Card, CardContent } from './ui/card'
import { Input } from './ui/input'
import { auditService } from '@/services'
import CapabilityNotice from './CapabilityNotice'
import type { AuditEntry } from '@/services/api/AuditService'
import { getErrorMessage } from '@/lib/toast'

/** Turn an action id into something readable. */
const ACTION_LABEL: Record<string, string> = {
  'entry.create': 'created an entry',
  'entry.update': 'edited an entry',
  'entry.delete': 'deleted an entry',
  'entry.bulk_update': 'bulk-updated entries',
  'entry.group_add': 'added entries to a group',
  'entry.bulk_delete': 'bulk-deleted entries',
  'ldif.apply': 'applied LDIF',
  'auth.login': 'signed in',
  'auth.logout': 'signed out',
  'auth.setup': 'completed setup',
  'credential.set': 'set a cluster password',
  'credential.clear': 'cleared a cluster password',
  'cluster.create': 'created a cluster',
  'cluster.update': 'edited a cluster',
  'cluster.delete': 'removed a cluster',
  'schema.add_definition': 'added a schema definition',
  'schema.remove_definition': 'removed a schema definition',
  'aci.add': 'added an access rule',
  'aci.remove': 'removed an access rule',
  'password.change': 'changed a password',
}

function label(action: string): string {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action]
  return action.replace(/[._]/g, ' ')
}

/** Colour the row by what happened. */
function actionTone(action: string, result: string): string {
  if (result !== 'ok') return 'text-destructive'
  if (action.includes('delete') || action.includes('remove')) return 'text-amber-600 dark:text-amber-400'
  if (action.includes('create') || action.includes('add')) return 'text-primary-readable'
  return 'text-foreground'
}

const ROLE_TONE: Record<string, string> = {
  admin: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  readwrite: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  readonly: 'bg-muted text-muted-foreground',
}

/** "2m ago" beats an ISO timestamp for scanning. */
function relative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function ActivityLogView({ clusterName = '' }: { clusterName?: string }) {
  const [actor, setActor] = useState('')
  const [action, setAction] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit', actor, action],
    queryFn: () =>
      auditService.getAudit({ limit: 200, actor: actor || undefined, action: action || undefined }),
    refetchInterval: 15000,
  })

  const grouped = useMemo(() => {
    const buckets = new Map<string, AuditEntry[]>()
    for (const entry of data?.entries ?? []) {
      const day = entry.ts.slice(0, 10)
      const list = buckets.get(day) ?? []
      list.push(entry)
      buckets.set(day, list)
    }
    return [...buckets.entries()]
  }, [data])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading activity...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm" role="alert">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
        <div>
          <p className="text-destructive">{getErrorMessage(error)}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            The audit trail names who changed what, so it is admin-only.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary-readable" aria-hidden="true" />
            Activity
          </h2>
          <p className="text-sm text-muted-foreground">
            Who changed what, recorded at the point of the change. {data?.summary.total ?? 0} recent
            event(s){data?.summary.failures ? ` · ${data.summary.failures} failed` : ''}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-44">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              placeholder="Filter by user…"
              className="pl-9"
              aria-label="Filter by actor"
            />
          </div>
          <div className="relative w-44">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="Filter by action…"
              className="pl-9"
              aria-label="Filter by action"
            />
          </div>
        </div>
      </div>

      {/* Server-side change log: explained only when this server lacks it. */}
      <CapabilityNotice clusterName={clusterName} capabilityId="accesslog" />

      {(data?.entries.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No activity recorded yet. Create, edit or delete an entry and it will appear here.
          </CardContent>
        </Card>
      )}

      {grouped.map(([day, entries]) => (
        <div key={day} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{day}</p>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {entries.map((entry, index) => (
                  <li
                    key={`${entry.ts}-${index}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
                  >
                    <span className="w-16 shrink-0 text-xs text-muted-foreground font-mono" title={entry.ts}>
                      {relative(entry.ts)}
                    </span>
                    <span className="font-medium">{entry.actor}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ROLE_TONE[entry.role] ?? ROLE_TONE.readonly}`}
                    >
                      {entry.role}
                    </span>
                    <span className={actionTone(entry.action, entry.result)}>{label(entry.action)}</span>
                    {entry.target && (
                      <code className="text-xs text-muted-foreground break-all">{entry.target}</code>
                    )}
                    {entry.cluster && <span className="text-xs text-muted-foreground">· {entry.cluster}</span>}
                    {entry.result !== 'ok' && (
                      <span className="text-xs text-destructive ml-auto">{entry.result}</span>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        Append-only JSON Lines on the data volume. Follow it live from the container with{' '}
        <code className="font-mono">tail -f /app/.data/audit.log</code>.
      </p>
    </div>
  )
}
