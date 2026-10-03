import { useState } from 'react'
import { Loader2, ShieldCheck, UserCog, Eye, Check } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { useSetup } from '@/hooks/useAuth'
import type { Role } from '@/services/api/AuthService'
import { getErrorMessage } from '@/lib/toast'
import logo from '@/assets/ldap.svg'

const MIN_PASSWORD = 8

interface RoleDraft {
  enabled: boolean
  username: string
  password: string
}

const ROLE_INFO: Array<{
  role: Role
  title: string
  description: string
  optional: boolean
  icon: typeof ShieldCheck
  defaultUsername: string
}> = [
  {
    role: 'admin',
    title: 'Administrator',
    description: 'Everything: entries, clusters, credentials, backups.',
    optional: false,
    icon: ShieldCheck,
    defaultUsername: 'admin',
  },
  {
    role: 'readwrite',
    title: 'Operator',
    description: 'Create, edit and delete entries. Cannot change clusters or credentials.',
    optional: true,
    icon: UserCog,
    defaultUsername: 'operator',
  },
  {
    role: 'readonly',
    title: 'Viewer',
    description: 'Browse entries and monitoring. No changes.',
    optional: true,
    icon: Eye,
    defaultUsername: 'viewer',
  },
]

export default function SetupWizard() {
  const setup = useSetup()
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<Role, RoleDraft>>({
    admin: { enabled: true, username: 'admin', password: '' },
    readwrite: { enabled: false, username: 'operator', password: '' },
    readonly: { enabled: false, username: 'viewer', password: '' },
  })

  const update = (role: Role, patch: Partial<RoleDraft>) =>
    setDrafts((prev) => ({ ...prev, [role]: { ...prev[role], ...patch } }))

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const chosen = ROLE_INFO.filter((info) => drafts[info.role].enabled)
    if (!drafts.admin.enabled) {
      setError('An administrator account is required.')
      return
    }
    for (const info of chosen) {
      const draft = drafts[info.role]
      if (!draft.username.trim()) {
        setError(`${info.title}: username is required.`)
        return
      }
      if (draft.password.length < MIN_PASSWORD) {
        setError(`${info.title}: password must be at least ${MIN_PASSWORD} characters.`)
        return
      }
    }
    const names = chosen.map((info) => drafts[info.role].username.trim().toLowerCase())
    if (new Set(names).size !== names.length) {
      setError('Usernames must be different.')
      return
    }

    try {
      await setup.mutateAsync(
        chosen.map((info) => ({
          username: drafts[info.role].username.trim(),
          password: drafts[info.role].password,
          role: info.role,
        }))
      )
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-10">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-3">
          <img src={logo} alt="" className="h-12" aria-hidden="true" />
          <CardTitle className="text-2xl">Create your accounts</CardTitle>
          <p className="text-sm text-muted-foreground">
            One-time setup. Stored encrypted in the container.
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6">
            {ROLE_INFO.map((info) => {
              const draft = drafts[info.role]
              const Icon = info.icon
              return (
                <div
                  key={info.role}
                  className={`rounded-lg border p-4 transition-colors ${
                    draft.enabled ? 'border-primary/40 bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 mt-0.5">
                        <Icon className="h-5 w-5 text-primary-readable" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="font-semibold">
                          {info.title}{' '}
                          <span className="text-xs font-normal text-muted-foreground">({info.role})</span>
                        </p>
                        <p className="text-sm text-muted-foreground">{info.description}</p>
                      </div>
                    </div>
                    {info.optional ? (
                      <Button
                        type="button"
                        variant={draft.enabled ? 'outline' : 'default'}
                        size="sm"
                        onClick={() => update(info.role, { enabled: !draft.enabled })}
                      >
                        {draft.enabled ? 'Remove' : 'Add'}
                      </Button>
                    ) : (
                      <span className="text-xs font-medium text-primary-readable flex items-center gap-1">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" /> required
                      </span>
                    )}
                  </div>

                  {draft.enabled && (
                    <div className="grid sm:grid-cols-2 gap-3 mt-4">
                      <div className="space-y-2">
                        <Label htmlFor={`${info.role}-username`}>Username</Label>
                        <Input
                          id={`${info.role}-username`}
                          value={draft.username}
                          onChange={(e) => update(info.role, { username: e.target.value })}
                          autoComplete="off"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${info.role}-password`}>Password</Label>
                        <Input
                          id={`${info.role}-password`}
                          type="password"
                          value={draft.password}
                          onChange={(e) => update(info.role, { password: e.target.value })}
                          autoComplete="new-password"
                          placeholder={`${MIN_PASSWORD}+ characters`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={setup.isPending}>
              {setup.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  Creating accounts...
                </>
              ) : (
                'Create accounts and sign in'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
