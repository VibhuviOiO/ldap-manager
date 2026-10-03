import { AlertCircle, Loader2 } from 'lucide-react'
import { useAuthStatus } from '@/hooks/useAuth'
import LoginScreen from './LoginScreen'
import SetupWizard from './SetupWizard'
import { Card, CardContent } from './ui/card'

/**
 * Decides what the app shows before rendering any directory UI:
 *
 *   mode=none            -> straight through. Auth is the proxy's job; the
 *                           visitor's role comes from auth.default_role.
 *   setup_required       -> first-run wizard (mode=local, no users yet).
 *   not authenticated    -> login form (mode=local or ldap).
 *   authenticated        -> the app.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { data: status, isLoading, error } = useAuthStatus()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground" role="status" aria-live="polite">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Loading...
        </div>
      </div>
    )
  }

  if (error || !status) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <Card className="w-full max-w-md border-destructive/50">
          <CardContent className="p-6 flex items-start gap-3" role="alert">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold text-destructive">Cannot reach the API</p>
              <p className="text-sm text-muted-foreground mt-1">
                Is the backend running?
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status.mode === 'none') return <>{children}</>
  if (status.setup_required) return <SetupWizard />
  if (!status.authenticated) return <LoginScreen status={status} />
  return <>{children}</>
}
