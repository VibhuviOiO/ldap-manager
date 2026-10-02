import { useConfirm } from './ui/confirm-dialog'
import { useState, useEffect, useCallback } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  User,
  Users,
  Building2,
  Box,
  Loader2,
  Trash2,
  Database,
  AlertTriangle,
} from 'lucide-react'
import { entryService } from '@/services'
import { toast, getErrorMessage } from '@/lib/toast'
import type { DITChild } from '@/types'

interface DirectoryTreeProps {
  clusterName: string
  canWrite: boolean
}

function iconFor(child: DITChild, expanded: boolean) {
  if (child.is_ou) return expanded ? FolderOpen : Folder
  if (child.is_group) return Users
  if (child.is_user) return User
  return Box
}


export default function DirectoryTree({ clusterName, canWrite }: DirectoryTreeProps) {
  const confirm = useConfirm()
  const [rootChildren, setRootChildren] = useState<DITChild[] | null>(null)
  const [childrenByDn, setChildrenByDn] = useState<Record<string, DITChild[]>>({})
  const [leaves, setLeaves] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loadingDn, setLoadingDn] = useState<Set<string>>(new Set())
  const [selectedDn, setSelectedDn] = useState<string | null>(null)
  const [details, setDetails] = useState<{ dn: string; attributes: Record<string, string[] | string> } | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadChildren = useCallback(
    async (dn: string) => {
      setLoadingDn((prev) => new Set(prev).add(dn))
      try {
        const res = await entryService.getChildren(clusterName, dn)
        if (res.children.length === 0) {
          setLeaves((prev) => ({ ...prev, [dn]: true }))
        }
        setChildrenByDn((prev) => ({ ...prev, [dn]: res.children }))
      } catch (err) {
        toast.error(getErrorMessage(err))
        setLeaves((prev) => ({ ...prev, [dn]: true }))
      } finally {
        setLoadingDn((prev) => {
          const next = new Set(prev)
          next.delete(dn)
          return next
        })
      }
    },
    [clusterName]
  )

  const loadRoot = useCallback(async () => {
    setError(null)
    setRootChildren(null)
    setChildrenByDn({})
    setLeaves({})
    try {
      const res = await entryService.getChildren(clusterName)
      setRootChildren(res.children)
      // Everything starts collapsed: only the base DN's children are listed,
      // and nothing is preloaded until the operator expands it. Auto-expanding
      // OUs and groups made a busy directory unreadable on first paint.
      setExpanded(new Set())
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }, [clusterName, loadChildren])

  useEffect(() => {
    loadRoot()
  }, [loadRoot])

  const toggle = (dn: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(dn)) {
        next.delete(dn)
      } else {
        next.add(dn)
        if (!(dn in childrenByDn) && !leaves[dn]) loadChildren(dn)
      }
      return next
    })
  }

  const select = async (child: DITChild) => {
    setSelectedDn(child.dn)
    setDetailsLoading(true)
    try {
      const entry = await entryService.getEntry(clusterName, child.dn)
      setDetails(entry)
    } catch (err) {
      toast.error(getErrorMessage(err))
      setDetails(null)
    } finally {
      setDetailsLoading(false)
    }
  }

  const remove = async (dn: string) => {
    const ok = await confirm({
      title: 'Delete this entry?',
      description: `${dn}\n\nThis removes the entry from the directory. It cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      await entryService.deleteEntry(clusterName, dn)
      toast.success('Entry deleted')
      setSelectedDn(null)
      setDetails(null)
      loadRoot()
    } catch (err) {
      toast.error(`Delete failed: ${getErrorMessage(err)}`)
    }
  }

  // Recursive renderer bound to the live state.
  const renderRows = (children: DITChild[], depth: number): React.ReactNode => {
    return children.map((child) => {
      const kids = childrenByDn[child.dn] ?? null
      const isExpanded = expanded.has(child.dn)
      const isLoading = loadingDn.has(child.dn)
      return (
        <div key={child.dn}>
          <div
            className={`group flex items-center gap-1 py-1 pr-2 rounded-md transition-colors ${
              selectedDn === child.dn ? 'bg-primary/10 text-primary-readable' : 'hover:bg-accent'
            }`}
            style={{ paddingLeft: `${depth * 16 + 4}px` }}
          >
            <button
              type="button"
              onClick={() => toggle(child.dn)}
              className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:bg-foreground/10"
              aria-label={isExpanded ? `Collapse ${child.rdn}` : `Expand ${child.rdn}`}
              aria-expanded={isExpanded}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={() => select(child)}
              className="flex items-center gap-1.5 min-w-0 flex-1 text-left text-sm"
              title={child.dn}
            >
              {(() => {
                const I = iconFor(child, isExpanded)
                return <I className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              })()}
              <span className="truncate font-mono text-[13px]">{child.rdn}</span>
            </button>

            {canWrite && (
              <button
                type="button"
                onClick={() => remove(child.dn)}
                className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-opacity"
                aria-label={`Delete ${child.rdn}`}
                title={`Delete ${child.dn}`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          {isExpanded && kids !== null && kids.length === 0 && (
            <p className="text-xs text-muted-foreground py-1" style={{ paddingLeft: `${depth * 16 + 30}px` }}>
              No entries
            </p>
          )}

          {isExpanded && kids && renderRows(kids, depth + 1)}
        </div>
      )
    })
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm" role="alert">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
        <p className="text-destructive">{error}</p>
      </div>
    )
  }

  if (rootChildren === null) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading directory tree...
      </div>
    )
  }

  return (
    <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6">
      {/* Tree */}
      <div className="rounded-lg border bg-card p-3 min-h-[320px] max-h-[70vh] overflow-auto" role="tree" aria-label="Directory tree">
        {rootChildren.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">The directory is empty.</p>
        ) : (
          renderRows(rootChildren, 0)
        )}
      </div>

      {/* Selected entry detail */}
      <div className="rounded-lg border bg-card p-4 min-h-[320px] max-h-[70vh] overflow-auto">
        {detailsLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground justify-center py-10" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading entry...
          </div>
        ) : details ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b pb-3">
              <Database className="h-4 w-4 text-primary-readable shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold break-all">{details.dn}</p>
                <p className="text-xs text-muted-foreground">
                  {Object.keys(details.attributes).length} attribute(s)
                </p>
              </div>
            </div>
            <dl className="space-y-1">
              {Object.entries(details.attributes).map(([name, value]) => {
                const values = Array.isArray(value) ? value : [value]
                // Defensive: the API already omits password hashes, but never
                // render one if it slips through another path.
                const sensitive = /password|pwd|krb5key|pkcs12|ntpassword|lmpassword|hash/i.test(name)
                return (
                  <div key={name} className="grid grid-cols-[140px_1fr] gap-2 text-sm py-1 border-b border-dashed">
                    <dt className="font-mono text-xs text-muted-foreground break-all leading-5">{name}</dt>
                    <dd className="font-mono text-xs break-all leading-5">
                      {sensitive ? (
                        <div className="text-muted-foreground italic">•••••••• (hidden)</div>
                      ) : (
                        values.map((v, i) => <div key={i}>{v}</div>)
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-10">
            Select an entry to see its attributes.
          </p>
        )}
      </div>
    </div>
  )
}
