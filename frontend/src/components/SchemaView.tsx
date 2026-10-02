import { useConfirm } from './ui/confirm-dialog'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Boxes, Type, Loader2, AlertTriangle, Layers, Plus, Trash2, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { clusterService } from '@/services'
import { useAuthStatus } from '@/hooks/useAuth'
import type { SchemaDef, SchemaEntry } from '@/types'
import { getErrorMessage, toast } from '@/lib/toast'

interface SchemaViewProps {
  clusterName: string
}

interface DefRowProps {
  def: SchemaDef
  kind: 'oc' | 'at'
  onRemove?: (def: SchemaDef, kind: 'oc' | 'at') => void
}

function DefRow({ def, kind, onRemove }: DefRowProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-dashed py-1.5 last:border-0 group">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-2 text-left text-sm hover:bg-accent rounded px-1 -mx-1 min-w-0"
          title={def.definition}
        >
          <span className="font-semibold">{def.name || '(unnamed)'}</span>
          {def.single_value && (
            <span className="text-[10px] font-medium text-sky-600 dark:text-sky-400">single</span>
          )}
          <span className="font-mono text-xs text-muted-foreground truncate ml-auto">{def.oid}</span>
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(def, kind)}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
            title={`Remove ${def.name}`}
            aria-label={`Remove ${def.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground px-1 mt-0.5">
        {def.sup && (
          <span>
            <span className="text-muted-foreground/60">SUP</span> {def.sup}
          </span>
        )}
        {kind === 'at' && def.syntax && (
          <span className="font-mono">
            <span className="text-muted-foreground/60">SYNTAX</span> {def.syntax}
          </span>
        )}
        {kind === 'at' && def.equality && (
          <span className="font-mono">
            <span className="text-muted-foreground/60">EQ</span> {def.equality}
          </span>
        )}
      </div>
      {open && (
        <pre className="mt-1.5 px-2 py-1.5 rounded bg-muted/50 text-[11px] font-mono whitespace-pre-wrap break-words text-muted-foreground">
          {def.definition}
        </pre>
      )}
    </div>
  )
}

export default function SchemaView({ clusterName }: SchemaViewProps) {
  const confirm = useConfirm()
  const [filter, setFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newKind, setNewKind] = useState<'attribute_type' | 'object_class'>('attribute_type')
  const [newSchema, setNewSchema] = useState('')
  const [newDef, setNewDef] = useState('')
  const [busy, setBusy] = useState(false)
  // Schemas are collapsed by default: the list is long and usually only one
  // schema is being inspected at a time.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const queryClient = useQueryClient()
  const { data: authStatus } = useAuthStatus()
  const isAdmin = authStatus?.role === 'admin'

  const { data, isLoading, error } = useQuery({
    queryKey: ['schema', clusterName],
    queryFn: () => clusterService.getSchema(clusterName),
  })

  const filtered = useMemo(() => {
    if (!data) return []
    const q = filter.trim().toLowerCase()
    if (!q) return data.schemas
    return data.schemas
      .map((schema) => ({
        ...schema,
        object_classes: schema.object_classes.filter(
          (d) => d.name.toLowerCase().includes(q) || d.oid.includes(q)
        ),
        attribute_types: schema.attribute_types.filter(
          (d) => d.name.toLowerCase().includes(q) || d.oid.includes(q)
        ),
      }))
      .filter((s) => s.object_classes.length > 0 || s.attribute_types.length > 0)
  }, [data, filter])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['schema', clusterName] })

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await clusterService.addSchemaDefinition(clusterName, {
        schema_name: newSchema || defaultSchema,
        kind: newKind,
        definition: newDef,
      })
      toast.success(`Added ${newKind === 'object_class' ? 'object class' : 'attribute type'} '${result.name}'`)
      setNewDef('')
      setShowAdd(false)
      refresh()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (def: SchemaDef, kind: 'oc' | 'at', schemaName: string) => {
    const label = kind === 'oc' ? 'object class' : 'attribute type'
    const ok = await confirm({
      title: `Remove this ${label}?`,
      description: `${def.name} — from ${schemaName}\n\nThis changes the live directory schema.`,
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (!ok) {
      return
    }
    setBusy(true)
    try {
      await clusterService.removeSchemaDefinition(clusterName, def.name, {
        schema_name: schemaName,
        kind: kind === 'oc' ? 'object_class' : 'attribute_type',
      })
      toast.success(`Removed '${def.name}'`)
      refresh()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading schema...
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
            Schema browsing reads <code className="font-mono">cn=schema,cn=config</code>, which needs a
            separate <code className="font-mono">config:</code> credential on this cluster.
          </p>
        </div>
      </div>
    )
  }

  if (!data) return null

  const defaultSchema = data.schemas.find((s) => s.name !== 'core' && s.name !== 'cosine')?.name
    || data.schemas[0]?.name
    || ''

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary-readable" aria-hidden="true" />
            Schema
          </h2>
          <p className="text-sm text-muted-foreground">
            {data.counts.schemas} schema(s) · {data.counts.object_classes} object classes ·{' '}
            {data.counts.attribute_types} attribute types
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name or OID…"
              className="pl-9"
              aria-label="Filter schema"
            />
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setShowAdd((v) => !v)}>
              <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
              New definition
            </Button>
          )}
        </div>
      </div>

      {isAdmin && showAdd && (
        <form onSubmit={handleAdd} className="rounded-lg border p-4 space-y-3 bg-muted/30">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" htmlFor="new-kind">Kind</label>
              <select
                id="new-kind"
                value={newKind}
                onChange={(e) => setNewKind(e.target.value as 'attribute_type' | 'object_class')}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                <option value="attribute_type">Attribute type</option>
                <option value="object_class">Object class</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" htmlFor="new-schema">Schema</label>
              <select
                id="new-schema"
                value={newSchema || defaultSchema}
                onChange={(e) => setNewSchema(e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                {data.schemas.map((s) => (
                  <option key={s.dn} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" htmlFor="new-def">Definition (RFC 4512)</label>
            <textarea
              id="new-def"
              value={newDef}
              onChange={(e) => setNewDef(e.target.value)}
              rows={3}
              required
              spellCheck={false}
              placeholder={newKind === 'object_class'
                ? "( 1.3.6.1.4.1.99999.2.9 NAME 'myClass' SUP top STRUCTURAL MUST ( cn ) )"
                : "( 1.3.6.1.4.1.99999.1.9 NAME 'myAttr' EQUALITY caseIgnoreMatch SYNTAX 1.3.6.1.4.1.1466.115.121.1.15 )"}
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
              aria-label="Schema definition"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Validated server-side before writing to <code className="font-mono">cn=schema</code>. A bad
              definition is rejected by the directory.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !newDef.trim()}>
              {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
              Add
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">No schema matches “{filter}”.</p>
      )}

      {filtered.map((schema: SchemaEntry) => (
        <Card key={schema.dn}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              <button
                type="button"
                onClick={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev)
                    if (next.has(schema.dn)) next.delete(schema.dn)
                    else next.add(schema.dn)
                    return next
                  })
                }
                aria-expanded={expanded.has(schema.dn)}
                className="flex items-center gap-2 w-full text-left hover:text-primary-readable transition-colors"
              >
                <ChevronRight
                  className={`h-4 w-4 shrink-0 transition-transform ${expanded.has(schema.dn) ? 'rotate-90' : ''}`}
                  aria-hidden="true"
                />
                <span className="font-mono text-sm">{schema.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {schema.object_classes.length} object classes · {schema.attribute_types.length} attributes
                </span>
              </button>
            </CardTitle>
          </CardHeader>
          {expanded.has(schema.dn) && (
          <CardContent className="space-y-4">
            {schema.object_classes.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                  <Boxes className="h-3.5 w-3.5" aria-hidden="true" /> Object classes
                </p>
                {schema.object_classes.map((def) => (
                  <DefRow
                    key={def.oid + def.name}
                    def={def}
                    kind="oc"
                    onRemove={isAdmin ? (d, k) => handleRemove(d, k, schema.name) : undefined}
                  />
                ))}
              </div>
            )}
            {schema.attribute_types.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                  <Type className="h-3.5 w-3.5" aria-hidden="true" /> Attribute types
                </p>
                {schema.attribute_types.map((def) => (
                  <DefRow
                    key={def.oid + def.name}
                    def={def}
                    kind="at"
                    onRemove={isAdmin ? (d, k) => handleRemove(d, k, schema.name) : undefined}
                  />
                ))}
              </div>
            )}
          </CardContent>
          )}
        </Card>
      ))}
    </div>
  )
}
