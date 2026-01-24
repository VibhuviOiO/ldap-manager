import { memo } from 'react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Server, XCircle, Database, ArrowRight, CheckCircle } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { passwordService } from '@/services'
import { sanitizeInput } from '@/lib/sanitize'
import { toast, getErrorMessage } from '@/lib/toast'
import { ClusterCardSkeleton } from './Skeleton'
import { useClusters, useConnect } from '@/hooks/useClusterInfo'

const passwordSchema = z.object({
  password: z.string().min(1, 'Password is required'),
})

type PasswordFormData = z.infer<typeof passwordSchema>

interface PasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clusterName: string
  onSuccess: () => void
}

function PasswordDialog({ open, onOpenChange, clusterName, onSuccess }: PasswordDialogProps) {
  const connectMutation = useConnect()
  const { register, handleSubmit, formState: { errors }, reset } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  })

  const onSubmit = async (data: PasswordFormData) => {
    try {
      const sanitizedPwd = sanitizeInput(data.password)
      await connectMutation.mutateAsync({ clusterName, password: sanitizedPwd })
      reset()
      onOpenChange(false)
      toast.success(`Connected to ${clusterName}`)
      onSuccess()
    } catch (err: any) {
      toast.error(`Connection failed: ${getErrorMessage(err)}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Setup Password for {clusterName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              {...register('password')}
              placeholder="Enter bind password"
              aria-describedby="password-help"
            />
            {errors.password && (
              <p className="text-sm text-destructive mt-1" role="alert">{errors.password.message}</p>
            )}
            <p id="password-help" className="text-xs text-muted-foreground mt-1">
              Password will be cached securely for future connections
            </p>
          </div>
          <Button type="submit" disabled={connectMutation.isPending} className="w-full">
            {connectMutation.isPending ? (
              <>
                <span className="animate-spin mr-2" aria-hidden="true">⏳</span>
                Saving...
              </>
            ) : (
              'Save Password'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Dashboard() {
  const navigate = useNavigate()
  const { data: clusters = [], isLoading: loadingClusters, error: queryError } = useClusters()
  const [showPasswordDialog, setShowPasswordDialog] = React.useState(false)
  const [selectedCluster, setSelectedCluster] = React.useState<string>('')
  const [passwordCache, setPasswordCache] = React.useState<Record<string, boolean>>({})

  React.useEffect(() => {
    const checkPasswords = async () => {
      const cache: Record<string, boolean> = {}
      for (const cluster of clusters) {
        try {
          const res = await passwordService.checkPasswordCache(cluster.name)
          cache[cluster.name] = res.cached
        } catch {
          cache[cluster.name] = false
        }
      }
      setPasswordCache(cache)
    }
    if (clusters.length > 0) {
      checkPasswords()
    }
  }, [clusters])

  const handleConnect = async (clusterName: string) => {
    if (passwordCache[clusterName]) {
      navigate(`/cluster/${encodeURIComponent(clusterName)}`)
    } else {
      setSelectedCluster(clusterName)
      setShowPasswordDialog(true)
    }
  }

  const handleClearPassword = async (clusterName: string) => {
    try {
      await passwordService.clearPasswordCache(clusterName)
      setPasswordCache(prev => ({ ...prev, [clusterName]: false }))
      toast.success(`Password cleared for ${clusterName}`)
    } catch (err: any) {
      toast.error(`Failed to clear password: ${getErrorMessage(err)}`)
    }
  }

  return (
    <main className="container mx-auto px-6 py-8 space-y-8">
      <div className="space-y-2">
        <h2 className="text-4xl font-bold text-foreground">LDAP Clusters</h2>
        <p className="text-lg text-muted-foreground">Manage and monitor your directory services</p>
      </div>

      {queryError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-6">
            <div className="flex items-start space-x-3" role="alert" aria-live="assertive">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <XCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-destructive mb-1">Configuration Error</p>
                <p className="text-sm text-muted-foreground">{getErrorMessage(queryError)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {loadingClusters ? (
        <div className="grid gap-6">
          <ClusterCardSkeleton />
          <ClusterCardSkeleton />
          <ClusterCardSkeleton />
        </div>
      ) : clusters.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">No clusters configured</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {clusters.map(cluster => (
            <Card key={cluster.name} className="hover:shadow-lg transition-all duration-200 border-2">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 bg-primary/10 rounded-xl">
                      <Database className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xl">{cluster.name}</span>
                        {passwordCache[cluster.name] && (
                          <div className="flex items-center space-x-1 px-2 py-1 bg-primary/10 rounded-full">
                            <CheckCircle className="h-3.5 w-3.5 text-primary" />
                            <span className="text-xs font-medium text-primary">Connected</span>
                          </div>
                        )}
                      </div>
                      {cluster.description && (
                        <p className="text-sm text-muted-foreground mt-1">{cluster.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    {passwordCache[cluster.name] && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleClearPassword(cluster.name)
                        }}
                        aria-label={`Clear password for ${cluster.name}`}
                      >
                        <XCircle className="h-4 w-4 mr-1" aria-hidden="true" />
                        Clear Password
                      </Button>
                    )}
                    <Button
                      onClick={() => handleConnect(cluster.name)}
                      className="shadow-sm"
                      aria-label={`View ${cluster.name} cluster`}
                    >
                      {passwordCache[cluster.name] ? 'View Cluster' : 'Setup Password'} <ArrowRight className="h-4 w-4 ml-1" aria-hidden="true" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center space-x-2 text-sm text-muted-foreground bg-muted/50 px-4 py-2.5 rounded-lg">
                  <Server className="h-4 w-4" aria-hidden="true" />
                  <span className="font-mono">{cluster.host || `${cluster.nodes?.length || 0} nodes`}:{cluster.port}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PasswordDialog
        open={showPasswordDialog}
        onOpenChange={setShowPasswordDialog}
        clusterName={selectedCluster}
        onSuccess={() => {
          setPasswordCache(prev => ({ ...prev, [selectedCluster]: true }))
          navigate(`/cluster/${encodeURIComponent(selectedCluster)}`)
        }}
      />
    </main>
  )
}

export default memo(Dashboard)
