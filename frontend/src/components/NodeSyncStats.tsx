import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { Button } from './ui/button'
import axios from 'axios'

interface NodeSyncStatsProps {
  clusterName: string
}

interface NodeStats {
  node: string
  total: number
  users: number
  groups: number
  status: string
  contextCSN: string
  error?: string
}

export default function NodeSyncStats({ clusterName }: NodeSyncStatsProps) {
  const [nodes, setNodes] = useState<NodeStats[]>([])
  const [inSync, setInSync] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadNodeStats()
  }, [clusterName])

  const loadNodeStats = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`/api/monitoring/nodes?cluster=${clusterName}`)
      setNodes(res.data.nodes || [])
      setInSync(res.data.in_sync || false)
    } catch (err) {
      console.error('Failed to load node stats', err)
    }
    setLoading(false)
  }

  const formatContextCSN = (csn: string) => {
    if (!csn) return 'N/A'
    
    // Parse LDAP contextCSN format: YYYYMMDDHHMMSSmmmmmmZ#xxxxxx#xxx#xxxxxx
    const match = csn.match(/^(\d{14})/)
    if (!match) return csn
    
    const timestamp = match[1]
    const year = timestamp.substring(0, 4)
    const month = timestamp.substring(4, 6)
    const day = timestamp.substring(6, 8)
    const hour = timestamp.substring(8, 10)
    const minute = timestamp.substring(10, 12)
    const second = timestamp.substring(12, 14)
    
    // Create UTC date and convert to browser timezone
    const utcDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`)
    return utcDate.toLocaleString()
  }

  if (loading) {
    return (
      <Card className="border-2">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading node statistics...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (nodes.length === 0) {
    return null
  }

  return (
    <Card className="border-2">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl">Node Synchronization</CardTitle>
          <div className="flex items-center space-x-3">
            {inSync ? (
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-semibold">In Sync</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-destructive/10 text-destructive rounded-full">
                <XCircle className="h-4 w-4" />
                <span className="text-sm font-semibold">Out of Sync</span>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={loadNodeStats} className="rounded-xl">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 font-semibold text-sm text-muted-foreground">Node</th>
                <th className="text-right py-3 px-4 font-semibold text-sm text-muted-foreground">Total</th>
                <th className="text-right py-3 px-4 font-semibold text-sm text-muted-foreground">Users</th>
                <th className="text-right py-3 px-4 font-semibold text-sm text-muted-foreground">Groups</th>
                <th className="text-center py-3 px-4 font-semibold text-sm text-muted-foreground">Status</th>
                <th className="text-left py-3 px-4 font-semibold text-sm text-muted-foreground">Context CSN</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node, idx) => (
                <tr key={idx} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="py-3 px-4 font-mono text-sm">{node.node}</td>
                  <td className="py-3 px-4 text-right font-semibold">{node.total}</td>
                  <td className="py-3 px-4 text-right">{node.users}</td>
                  <td className="py-3 px-4 text-right">{node.groups}</td>
                  <td className="py-3 px-4 text-center">
                    {node.status === 'healthy' ? (
                      <span className="inline-flex items-center px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-semibold">
                        Healthy
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 bg-destructive/10 text-destructive rounded-full text-xs font-semibold">
                        Error
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">
                    {formatContextCSN(node.contextCSN)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
