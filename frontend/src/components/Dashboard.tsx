import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Server, CheckCircle, XCircle, Database, Activity, Users, ArrowRight } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import axios from 'axios'

interface DashboardProps {
  setConnected: (connected: boolean) => void
}

interface Cluster {
  name: string
  host: string | null
  port: number
  nodes: { host: string; port: number }[]
  base_dn: string | null
  bind_dn: string
  readonly: boolean
  description: string
}

interface ClusterStatus {
  name: string
  connected: boolean
  passwordCached: boolean
  stats?: {
    entries: number
    groups: number
    users: number
  }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [clusterStatuses, setClusterStatuses] = useState<Map<string, ClusterStatus>>(new Map())
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [selectedCluster, setSelectedCluster] = useState<string>('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadClusters()
  }, [])

  const loadClusters = async () => {
    try {
      const res = await axios.get('/api/clusters/list')
      const clusterList = res.data.clusters || []
      setClusters(clusterList)
      
      // Check password cache for each cluster
      const statuses = new Map<string, ClusterStatus>()
      for (const cluster of clusterList) {
        const cacheRes = await axios.get(`/api/password/check/${cluster.name}`)
        statuses.set(cluster.name, {
          name: cluster.name,
          connected: false,
          passwordCached: cacheRes.data.cached
        })
      }
      setClusterStatuses(statuses)
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Failed to load clusters'
      setError(errorMsg)
      console.error('Failed to load clusters', err)
    }
  }

  const handleConnect = async (clusterName: string) => {
    const status = clusterStatuses.get(clusterName)
    if (!status?.passwordCached) {
      setSelectedCluster(clusterName)
      setShowPasswordDialog(true)
    }
  }

  const connectToCluster = async (clusterName: string, pwd: string) => {
    setLoading(true)
    setError('')
    try {
      await axios.post('/api/connection/connect', {
        cluster_name: clusterName,
        bind_password: pwd
      })
      
      // Update status - password now cached
      const newStatuses = new Map(clusterStatuses)
      newStatuses.set(clusterName, {
        name: clusterName,
        connected: false,
        passwordCached: true
      })
      setClusterStatuses(newStatuses)
      setShowPasswordDialog(false)
      setPassword('')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Connection failed')
    }
    setLoading(false)
  }

  const handlePasswordSubmit = () => {
    if (!password) {
      setError('Password required')
      return
    }
    connectToCluster(selectedCluster, password)
  }

  return (
    <div className="container mx-auto px-6 py-8 space-y-8">
      <div className="space-y-2">
        <h2 className="text-4xl font-bold text-foreground">LDAP Clusters</h2>
        <p className="text-lg text-muted-foreground">Manage and monitor your directory services</p>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-6">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-destructive mb-1">Configuration Error</p>
                <p className="text-sm text-muted-foreground">{error}</p>
                {error.includes('not found') && (
                  <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      Please create <code className="bg-background px-2 py-1 rounded text-xs font-mono">config.yml</code> from <code className="bg-background px-2 py-1 rounded text-xs font-mono">config.example.yml</code>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {clusters.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Loading clusters...</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {clusters.map(cluster => {
            const status = clusterStatuses.get(cluster.name)
            return (
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
                          {status?.passwordCached && (
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
                      {status?.passwordCached ? (
                        <Button 
                          onClick={() => navigate(`/cluster/${encodeURIComponent(cluster.name)}`)}
                          className="shadow-sm"
                        >
                          View Cluster <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      ) : (
                        <Button 
                          onClick={() => handleConnect(cluster.name)}
                          disabled={loading}
                          variant="outline"
                          className="border-2"
                        >
                          Setup Password
                        </Button>
                      )}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground bg-muted/50 px-4 py-2.5 rounded-lg">
                    <Server className="h-4 w-4" />
                    <span className="font-mono">{cluster.host || `${cluster.nodes.length} nodes`}:{cluster.port}</span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setup Password for {selectedCluster}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter bind password"
                onKeyPress={(e) => e.key === 'Enter' && handlePasswordSubmit()}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Password will be cached securely for future connections
              </p>
            </div>
            {error && (
              <div className="flex items-center space-x-2 text-destructive text-sm">
                <XCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}
            <Button onClick={handlePasswordSubmit} disabled={loading} className="w-full">
              {loading ? 'Saving...' : 'Save Password'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
