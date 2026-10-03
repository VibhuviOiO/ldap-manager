import { useConfirm } from './ui/confirm-dialog'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight, Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { clusterService } from '@/services'
import { useAuthStatus } from '@/hooks/useAuth'
import type { AciDatabase } from '@/types'
import { getErrorMessage, toast } from '@/lib/toast'

interface AciViewProps {
  clusterName: string
}

function DatabaseCard({
  database,
  clusterName,
  isAdmin,
  onChanged,
}: {
  database: AciDatabase
  clusterName: string
  isAdmin: boolean
  onChanged: () => void
}) {
  const confirm = useConfirm()
  const [showAdd, setShowAdd] = useState(false)
  // Collapsed by default: the rule text is long and most databases are not
  // being edited at any given moment.
  const [expanded, setExpanded] = useState(false)
  const [rule, setRule] = useState('')
  const [position, setPosition] = useState('')
  const [busy, setBusy] = useState(false)

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await clusterService.addAciRule(clusterName, {
        database_dn: database.dn,
        rule: rule.trim(),
        position: position.trim() === '' ? null : Number(position),
      })
      toast.success('Access rule added')
      setRule('')
      setPosition('')
      setShowAdd(false)
      onChanged()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (index: number | null, text: string) => {
    if (index === null) return
    const ok = await confirm({
      title: 'Remove this access rule?',
      description: `${text}\n\nA wrong change can lock users out of the database.`,
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (!ok) {
      return
    }
    setBusy(true)
    try {
      await clusterService.removeAciRule(clusterName, { database_dn: database.dn, index })
      toast.success('Access rule removed')
      onChanged()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex flex-wrap items-center gap-2 text-left hover:text-primary-readable transition-colors"
          >
            <ChevronRight
              className={`h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
              aria-hidden="true"
            />
            <span className="font-mono text-sm">{database.kind}</span>
            {database.suffix && (
              <span className="text-xs font-normal text-muted-foreground font-mono">{database.suffix}</span>
            )}
            <span className="text-xs font-normal text-muted-foreground">
              {database.access.length} rule(s)
            </span>
          </button>
          {isAdmin && expanded && (
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => setShowAdd((v) => !v)}>
              <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Add rule
            </Button>
          )}
        </CardTitle>
        <p className="text-[11px] text-muted-foreground font-mono break-all">{database.dn}</p>
      </CardHeader>
      {expanded && (
      <CardContent className="space-y-2">
        {database.access.length === 0 && (
          <p className="text-sm text-muted-foreground">No explicit olcAccess rules (defaults apply).</p>
        )}
        {database.access.map((entry) => (
          <div
            key={`${entry.index}-${entry.raw}`}
            className="group flex items-start gap-2 rounded border bg-muted/30 px-3 py-2"
          >
            <span className="mt-0.5 shrink-0 rounded bg-background border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              {entry.index ?? '?'}
            </span>
            <code className="flex-1 text-xs font-mono break-all leading-5">{entry.rule}</code>
            {isAdmin && entry.index !== null && (
              <button
                type="button"
                onClick={() => handleRemove(entry.index, entry.rule)}
                disabled={busy}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                title="Remove rule"
                aria-label={`Remove rule ${entry.index}`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        ))}

        {isAdmin && showAdd && (
          <form onSubmit={handleAdd} className="rounded border p-3 space-y-2 bg-background">
            <textarea
              value={rule}
              onChange={(e) => setRule(e.target.value)}
              rows={2}
              required
              spellCheck={false}
              placeholder='to attrs=userPassword by self write by * auth'
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
              aria-label={`New access rule for ${database.dn}`}
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground" htmlFor={`pos-${database.dn}`}>
                Position (blank = append):
              </label>
              <input
                id={`pos-${database.dn}`}
                type="number"
                min={0}
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="h-8 w-20 rounded-md border bg-background px-2 text-xs"
                aria-label="Insert position"
              />
              <Button type="submit" size="sm" disabled={busy || !rule.trim()}>
                {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" aria-hidden="true" /> : null}
                Add
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Rules are evaluated top-down: the first match wins. Must start with{' '}
              <code className="font-mono">to</code> and contain a{' '}
              <code className="font-mono">by &lt;who&gt; &lt;access&gt;</code> clause.
            </p>
          </form>
        )}
      </CardContent>
      )}
    </Card>
  )
}

export default function AciView({ clusterName }: AciViewProps) {
  const queryClient = useQueryClient()
  const { data: authStatus } = useAuthStatus()
  const isAdmin = authStatus?.role === 'admin'

  const { data, isLoading, error } = useQuery({
    queryKey: ['aci', clusterName],
    queryFn: () => clusterService.getAcis(clusterName),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['aci', clusterName] })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading access rules...
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
            Reading <code className="font-mono">olcAccess</code> needs a{' '}
            <code className="font-mono">config:</code> credential on this cluster.
          </p>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary-readable" aria-hidden="true" />
          Access Control
        </h2>
        <p className="text-sm text-muted-foreground">
          {data.rule_count} olcAccess rule(s) across {data.databases.length} database(s). Rules are
          evaluated top-down - the first match wins.
        </p>
      </div>

      {isAdmin && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
          <p className="text-muted-foreground">
            A wrong rule can lock users out. Add rules; don't delete the permissive ones until yours work.
          </p>
        </div>
      )}

      {data.databases.map((database) => (
        <DatabaseCard
          key={database.dn}
          database={database}
          clusterName={clusterName}
          isAdmin={isAdmin}
          onChanged={refresh}
        />
      ))}
    </div>
  )
}
