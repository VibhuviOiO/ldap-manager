/**
 * Loading spinner component.
 * Used to show loading state during authentication initialization.
 */

export function LoadingSpinner() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center space-y-4">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
        <p className="text-lg text-muted-foreground">Loading LDAP Manager...</p>
      </div>
    </div>
  )
}
