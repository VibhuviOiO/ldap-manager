import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import DirectoryStats from './DirectoryStats'
import NodeSyncStats from './NodeSyncStats'

interface MonitoringViewProps {
  clusterName: string
  monitoring: any
  loading: boolean
}

export default function MonitoringView({ clusterName, monitoring, loading }: MonitoringViewProps) {
  return (
    <div className="space-y-6">
      <DirectoryStats clusterName={clusterName} />
      
      <NodeSyncStats clusterName={clusterName} />
      
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="text-2xl">Cluster Health</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading monitoring data...</p>
          ) : monitoring ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">Status</p>
                <p className="text-xl font-bold">{monitoring.status || 'Unknown'}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">Response Time</p>
                <p className="text-xl font-bold">{monitoring.responseTime || 'N/A'}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">Connections</p>
                <p className="text-xl font-bold">{monitoring.connections || 0}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">Operations</p>
                <p className="text-xl font-bold">{monitoring.operations || 0}</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">No monitoring data available</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
