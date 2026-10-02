import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronRight, Copy, Info, Wrench } from 'lucide-react'
import { Button } from './ui/button'
import { clusterService } from '@/services'
import type { Capability } from '@/services/api/ClusterService'

/**
 * Explains an optional server feature this cluster is missing, with the exact
 * steps to enable it on the operator's own server.
 *
 * Renders nothing when the capability is present, and never claims a feature is
 * "disabled" when we simply could not look - a false negative sends people
 * chasing a problem they do not have.
 */
export default function CapabilityNotice({
  clusterName,
  capabilityId,
}: {
  clusterName: string
  capabilityId: string
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const { data } = useQuery({
    queryKey: ['capabilities', clusterName],
    queryFn: () => clusterService.getCapabilities(clusterName),
    staleTime: 60000,
  })

  const capability: Capability | undefined = data?.capabilities.find((c) => c.id === capabilityId)
  if (!capability || capability.status === 'ok') return null

  const unknown = capability.status === 'unknown'

  const copy = async () => {
    if (!capability.enable_ldif) return
    try {
      await navigator.clipboard.writeText(capability.enable_ldif)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable - the text is selectable anyway */
    }
  }

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-start gap-2 p-3 text-left"
      >
        {unknown ? (
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <Wrench className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
        )}
        <span className="flex-1 text-sm">
          <span className="font-medium">
            {unknown
              ? `${capability.title}: cannot tell on this cluster`
              : `${capability.title} is not enabled on this server`}
          </span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            {unknown
              ? 'Add a config: credential for this cluster and this page can check.'
              : capability.why}
          </span>
        </span>
        {!unknown && (
          <ChevronRight
            className={`h-4 w-4 mt-0.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
        )}
      </button>

      {open && capability.enable_ldif && (
        <div className="px-3 pb-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Run this against your own OpenLDAP server as the config admin:
            </p>
            <Button size="sm" variant="outline" onClick={copy}>
              {copied ? (
                <Check className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <pre className="rounded border bg-background p-3 text-[11px] font-mono overflow-x-auto whitespace-pre">
            {capability.enable_ldif}
          </pre>
          <p className="text-xs text-muted-foreground">
            Save it as <code className="font-mono">enable.ldif</code> and apply it with:
          </p>
          <pre className="rounded border bg-background p-2 text-[11px] font-mono overflow-x-auto">
{`ldapmodify -Y EXTERNAL -H ldapi:/// -f enable.ldif`}
          </pre>
        </div>
      )}
    </div>
  )
}
