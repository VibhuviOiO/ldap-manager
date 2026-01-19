import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import DirectoryStats from './DirectoryStats'
import NodeSyncStats from './NodeSyncStats'
import ReplicationTopology from './ReplicationTopology'

interface MonitoringViewProps {
  clusterName: string
}

export default function MonitoringView({ clusterName }: MonitoringViewProps) {
  return (
    <div className="space-y-6">
      <DirectoryStats clusterName={clusterName} />
      
      <NodeSyncStats clusterName={clusterName} />
      
      <ReplicationTopology clusterName={clusterName} />
    </div>
  )
}
