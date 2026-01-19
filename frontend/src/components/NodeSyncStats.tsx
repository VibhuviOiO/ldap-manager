import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { CheckCircle, XCircle, RefreshCw, Info, TestTube } from 'lucide-react'
import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import axios from 'axios'

interface NodeSyncStatsProps {
  clusterName: string
}

interface NodeStats {
  node: string
  total: number
  users: number
  groups: number
  ous: number
  status: string
  contextCSN: string
  responseTime: number | null
  syncAge: number | null
  error?: string
}

export default function NodeSyncStats({ clusterName }: NodeSyncStatsProps) {
  const [nodes, setNodes] = useState<NodeStats[]>([])
  const [inSync, setInSync] = useState(false)
  const [loading, setLoading] = useState(true)
  const [maxSyncAge, setMaxSyncAge] = useState<number | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    loadNodeStats()
  }, [clusterName])

  const loadNodeStats = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`/api/monitoring/nodes?cluster=${clusterName}`)
      setNodes(res.data.nodes || [])
      setInSync(res.data.in_sync || false)
      
      // Calculate max sync age difference between nodes
      const syncAges = res.data.nodes
        .map((n: NodeStats) => n.syncAge)
        .filter((age: number | null) => age !== null)
      
      if (syncAges.length > 1) {
        const max = Math.max(...syncAges)
        const min = Math.min(...syncAges)
        setMaxSyncAge(max - min) // Difference between oldest and newest
      } else {
        setMaxSyncAge(null)
      }
    } catch (err) {
      console.error('Failed to load node stats', err)
    }
    setLoading(false)
  }

  const testReplication = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await axios.post(`/api/monitoring/test-replication?cluster=${clusterName}`)
      if (res.data.success) {
        setTestResult('✓ Replication test passed')
        setTimeout(() => loadNodeStats(), 1000)
      } else {
        setTestResult(`✗ ${res.data.message}`)
      }
    } catch (err) {
      setTestResult('✗ Test failed')
    }
    setTesting(false)
    setTimeout(() => setTestResult(null), 5000)
  }

  const formatSyncAge = (seconds: number | null) => {
    if (seconds === null || seconds === undefined) return 'N/A'
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  const getSyncAgeColor = (seconds: number | null) => {
    if (seconds === null) return 'text-muted-foreground'
    if (seconds < 60) return 'text-primary'
    if (seconds < 300) return 'text-yellow-600'
    return 'text-destructive'
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
            {nodes.length > 1 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={testReplication} disabled={testing} className="rounded-xl">
                  <TestTube className="h-4 w-4 mr-1" />
                  {testing ? 'Testing...' : 'Test Replication'}
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="text-muted-foreground hover:text-foreground transition-colors">
                      <Info className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">Test Replication</h4>
                      <p className="text-xs text-muted-foreground">
                        This test verifies that multi-master replication is working correctly:
                      </p>
                      <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
                        <li>Creates a temporary test entry on the first node</li>
                        <li>Waits 5 seconds for replication to occur</li>
                        <li>Checks if the entry appears on all other nodes</li>
                        <li>Automatically deletes the test entry</li>
                      </ol>
                      <p className="text-xs text-muted-foreground italic">
                        <strong>Note:</strong> This is a safe, non-destructive test that only creates a temporary entry.
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </div>
        {testResult && (
          <div className={`mt-2 text-sm ${testResult.startsWith('✓') ? 'text-primary' : 'text-destructive'}`}>
            {testResult}
          </div>
        )}
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
                <th className="text-right py-3 px-4 font-semibold text-sm text-muted-foreground">OUs</th>
                <th className="text-right py-3 px-4 font-semibold text-sm text-muted-foreground">
                  <div className="flex items-center justify-end space-x-2">
                    <span>Others</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-muted-foreground hover:text-foreground transition-colors">
                          <Info className="h-4 w-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80">
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm">Other Entries</h4>
                          <p className="text-xs text-muted-foreground">
                            Entries that are not users, groups, or organizational units. These typically include:
                          </p>
                          <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
                            <li>Base domain entry (e.g., dc=example,dc=com)</li>
                            <li>Schema definitions (cn=subschema)</li>
                            <li>System entries and metadata</li>
                            <li>Custom object classes</li>
                          </ul>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </th>
                <th className="text-right py-3 px-4 font-semibold text-sm text-muted-foreground">Response</th>
                <th className="text-center py-3 px-4 font-semibold text-sm text-muted-foreground">Status</th>
                <th className="text-left py-3 px-4 font-semibold text-sm text-muted-foreground">Sync Age</th>
                <th className="text-left py-3 px-4 font-semibold text-sm text-muted-foreground">
                  <div className="flex items-center space-x-2">
                    <span>Last Update (contextCSN)</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-muted-foreground hover:text-foreground transition-colors">
                          <Info className="h-4 w-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80">
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm">Context CSN (Change Sequence Number)</h4>
                          <p className="text-xs text-muted-foreground">
                            A unique identifier for each change in the LDAP directory. In multi-master replication, 
                            each node maintains its own CSN to track the last modification timestamp.
                          </p>
                          <p className="text-xs text-muted-foreground break-all">
                            <strong>Format:</strong><br/>
                            YYYYMMDDHHMMSS.microseconds#counter#serverID#modifier
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Nodes with identical contextCSN values are fully synchronized.
                          </p>
                          <p className="text-xs text-muted-foreground italic">
                            <strong>Note:</strong> Single-node clusters may not have contextCSN as replication is not enabled.
                          </p>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node, idx) => (
                <tr key={idx} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="py-3 px-4 font-mono text-sm">{node.node}</td>
                  <td className="py-3 px-4 text-right font-semibold">{node.total}</td>
                  <td className="py-3 px-4 text-right">{node.users}</td>
                  <td className="py-3 px-4 text-right">{node.groups}</td>
                  <td className="py-3 px-4 text-right">{node.ous}</td>
                  <td className="py-3 px-4 text-right text-muted-foreground">{node.total - node.users - node.groups - node.ous}</td>
                  <td className="py-3 px-4 text-right">
                    {node.responseTime !== null ? (
                      <span className={node.responseTime < 100 ? 'text-primary' : node.responseTime < 500 ? 'text-yellow-600' : 'text-destructive'}>
                        {node.responseTime}ms
                      </span>
                    ) : 'N/A'}
                  </td>
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
                  <td className="py-3 px-4 text-left">
                    <span className={getSyncAgeColor(node.syncAge)}>
                      {formatSyncAge(node.syncAge)}
                    </span>
                    {!inSync && maxSyncAge !== null && maxSyncAge > 10 && (
                      <span className="ml-2 text-xs text-destructive">⚠ Lag</span>
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
