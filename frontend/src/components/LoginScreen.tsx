import { useState } from 'react'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, LogIn, ShieldCheck } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { useLogin } from '@/hooks/useAuth'
import type { AuthStatus } from '@/services/api/AuthService'
import { getErrorMessage } from '@/lib/toast'
import logo from '@/assets/ldap.svg'

interface LoginScreenProps {
  status: AuthStatus
}

/**
 * Information-first sign-in: say which directory is being used, what to type,
 * and put errors on the field they belong to.
 */
export default function LoginScreen({ status }: LoginScreenProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({})
  const login = useLogin()

  const viaLdap = status.mode === 'ldap'
  const usernameLabel = viaLdap
    ? `Username${status.ldap_username_hint ? ` (${status.ldap_username_hint})` : ''}`
    : 'Username'

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const problems: { username?: string; password?: string } = {}
    if (!username.trim()) problems.username = 'Enter your username'
    if (!password) problems.password = 'Enter your password'
    setFieldErrors(problems)
    if (Object.keys(problems).length > 0) return

    try {
      await login.mutateAsync({ username: username.trim(), password })
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      // A rejected credential belongs on the fields, not in a banner alone.
      if (/credential|invalid|password/i.test(message)) {
        setFieldErrors({ password: 'Check your username and password' })
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <img src={logo} alt="" className="h-11" aria-hidden="true" />
          <CardTitle className="text-2xl">Sign in</CardTitle>

          {/* Which directory, and what to type. */}
          <p className="text-sm text-muted-foreground flex items-start gap-2">
            {viaLdap ? (
              <>
                <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Using your directory account
                  {status.ldap_cluster ? (
                    <>
                      {' '}from <span className="font-medium text-foreground">{status.ldap_cluster}</span>
                    </>
                  ) : null}
                  . Your role is decided by your group membership.
                </span>
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>Using a built-in account created during setup.</span>
              </>
            )}
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="username">{usernameLabel}</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  if (fieldErrors.username) setFieldErrors((p) => ({ ...p, username: undefined }))
                }}
                placeholder={viaLdap ? `your ${status.ldap_username_hint || 'username'}` : 'admin'}
                aria-invalid={Boolean(fieldErrors.username)}
                aria-describedby={fieldErrors.username ? 'username-error' : undefined}
              />
              {fieldErrors.username && (
                <p id="username-error" className="text-sm text-destructive" role="alert">
                  {fieldErrors.username}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }))
                  }}
                  className="pr-10"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="password-error" className="text-sm text-destructive" role="alert">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {error && (
              <div
                className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4 mr-2" aria-hidden="true" />
                  Sign in
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              You stay signed in for {status.session_lifetime_hours} hours
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
