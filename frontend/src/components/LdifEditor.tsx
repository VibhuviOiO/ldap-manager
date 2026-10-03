import { useConfirm } from './ui/confirm-dialog'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, FileCode2, Loader2, AlertTriangle, XCircle } from 'lucide-react'
import { Button } from './ui/button'
import { ldifService } from '@/services'
import { toast, getErrorMessage } from '@/lib/toast'
import { LDIF_DRAFT_KEY, type LdifDraft } from '@/lib/ldifTemplate'
import type { LdifImportResult } from '@/services/api/LdifService'

const CONTEXT_PATH = import.meta.env.VITE_CONTEXT_PATH || ''

const SAMPLE_LDIF = `# Add a new user
dn: uid=jdoe,ou=People,dc=example,dc=com
changetype: add
objectClass: inetOrgPerson
uid: jdoe
cn: Jane Doe
sn: Doe
mail: jdoe@example.com
`

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Lightweight LDIF syntax highlighting - no editor dependency. */
function highlightLdif(text: string): string {
  const directives = new Set(['changetype', 'add', 'replace', 'delete', 'modify', 'modrdn'])
  return text
    .split('\n')
    .map((line) => {
      const escaped = escapeHtml(line)
      if (/^\s*#/.test(line) || /^\s*-$/.test(line) || line.trim() === '') {
        return `<span class="text-muted-foreground">${escaped}</span>`
      }
      const match = line.match(/^([^:]+)(::?)(.*)$/)
      if (!match) return escaped
      const [, attr, sep, value] = match
      const attrLower = attr.trim().toLowerCase()

      let attrClass = 'text-violet-600 dark:text-violet-400'
      if (attrLower === 'dn') attrClass = 'text-primary-readable font-semibold'
      else if (directives.has(attrLower)) attrClass = 'text-amber-600 dark:text-amber-400 font-semibold'

      const valueHtml = sep === '::'
        ? `<span class="text-sky-600 dark:text-sky-400 italic">${escapeHtml(value)}</span>`
        : `<span class="text-foreground">${escapeHtml(value)}</span>`

      return `<span class="${attrClass}">${escapeHtml(attr)}</span><span class="text-muted-foreground">${sep}</span>${valueHtml}`
    })
    .join('\n')
}

interface LdifEditorProps {
  clusterName: string
  /** readwrite and above: parse without writing */
  canValidate: boolean
  /** admin only: one payload can rewrite anything the bind DN can reach */
  canApply: boolean
  canExport: boolean
}

export default function LdifEditor({ clusterName, canValidate, canApply, canExport }: LdifEditorProps) {
  const confirm = useConfirm()
  const [value, setValue] = useState(SAMPLE_LDIF)
  const [result, setResult] = useState<LdifImportResult | null>(null)
  const [validating, setValidating] = useState(false)
  const [importing, setImporting] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const highlighted = useMemo(() => highlightLdif(value), [value])


  // A draft parked by "Create with LDIF" replaces the sample on arrival.
  useEffect(() => {
    const raw = sessionStorage.getItem(LDIF_DRAFT_KEY)
    if (!raw) return
    sessionStorage.removeItem(LDIF_DRAFT_KEY)
    try {
      const draft = JSON.parse(raw) as LdifDraft
      if (draft.cluster === clusterName && draft.body) {
        setValue(draft.body)
        toast.success('LDIF template ready - edit it, then Apply')
      }
    } catch {
      /* a malformed draft is simply ignored */
    }
  }, [clusterName])

  const syncScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    if (preRef.current) {
      preRef.current.scrollTop = event.currentTarget.scrollTop
      preRef.current.scrollLeft = event.currentTarget.scrollLeft
    }
  }

  const loadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      setValue(await file.text())
      toast.success(`Loaded ${file.name}`)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      event.target.value = ''
    }
  }

  const validate = async () => {
    setValidating(true)
    setResult(null)
    try {
      const res = await ldifService.import(clusterName, value, true)
      setResult(res)
      toast.success(`Valid LDIF: ${res.records} record(s)`)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setValidating(false)
    }
  }

  const doImport = async () => {
    const ok = await confirm({
      title: 'Apply this LDIF?',
      description: 'Changes take effect immediately and cannot be undone.',
      confirmLabel: 'Apply',
      destructive: true,
    })
    if (!ok) return
    setImporting(true)
    setResult(null)
    try {
      const res = await ldifService.import(clusterName, value, false)
      setResult(res)
      if (res.status === 'success') {
        toast.success(`Imported: ${res.added} added, ${res.modified} modified, ${res.deleted} deleted`)
      } else {
        toast.error(`Partial import: ${res.errors.length} record(s) failed`)
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <FileCode2 className="h-5 w-5 text-primary-readable" aria-hidden="true" />
            LDIF Editor
          </h2>
          <p className="text-sm text-muted-foreground">
            Validate is a dry run. Apply writes to the directory.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".ldif,.txt,text/plain"
            className="hidden"
            onChange={loadFile}
            aria-label="Load LDIF file"
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            Load LDIF
          </Button>
          <Button variant="outline" size="sm" onClick={() => setValue(SAMPLE_LDIF)}>
            Template
          </Button>
          <Button variant="outline" size="sm" onClick={validate} disabled={validating || !canValidate}>
            {validating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
            Validate
          </Button>
          {canExport && (
            <a
              href={`${CONTEXT_PATH}/api/backup/${encodeURIComponent(clusterName)}`}
              className="text-sm px-3 py-2 rounded-md border hover:bg-accent transition-colors"
            >
              Export
            </a>
          )}
          {canApply && (
            <Button size="sm" onClick={doImport} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
              Apply
            </Button>
          )}
        </div>
      </div>

      {/* Overlay editor: a highlighted <pre> behind a transparent <textarea>. */}
      <div className="relative rounded-lg border bg-background">
        <pre
          ref={preRef}
          aria-hidden="true"
          className="absolute inset-0 m-0 p-3 overflow-hidden whitespace-pre-wrap break-words pointer-events-none font-mono text-[13px] leading-6"
          dangerouslySetInnerHTML={{ __html: highlighted + '\n' }}
        />
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onScroll={syncScroll}
          spellCheck={false}
          aria-label="LDIF content"
          className="relative block w-full h-[380px] p-3 bg-transparent text-transparent caret-foreground resize-y whitespace-pre-wrap break-words outline-none font-mono text-[13px] leading-6"
        />
      </div>

      {!canApply && (
        <p className="text-xs text-muted-foreground">
          {canValidate
            ? 'Validate parses without writing. Applying LDIF requires the admin role.'
            : 'You have read-only access: you can view, load and export LDIF, but not validate or apply.'}
        </p>
      )}

      {result && (
        <div className="rounded-lg border p-4 space-y-3" role="status" aria-live="polite">
          {result.dry_run ? (
            <p className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              {result.records} valid record(s):
              {result.plan?.map((p, i) => (
                <span key={i} className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                  {p.changetype} {p.dn}
                </span>
              ))}
            </p>
          ) : (
            <>
              <p className="text-sm">
                <span className="font-medium">Imported:</span>{' '}
                {result.added} added · {result.modified} modified · {result.deleted} deleted
              </p>
              {result.errors.length > 0 && (
                <ul className="space-y-1">
                  {result.errors.map((err, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-destructive">
                      <XCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                      <span className="font-mono text-xs break-all">{err.dn}</span>
                      <span className="text-xs">({err.error})</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
