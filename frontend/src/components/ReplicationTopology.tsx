import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Server } from 'lucide-react'
import axios from 'axios'

interface ReplicationTopologyProps {
  clusterName: string
}

interface TopologyNode {
  node: string
  server_id: string | null
  reads_from: Array<{host: string, rid: string}>
}

export default function ReplicationTopology({ clusterName }: ReplicationTopologyProps) {
  const [topology, setTopology] = useState<TopologyNode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTopology()
  }, [clusterName])

  const loadTopology = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`/api/monitoring/topology?cluster=${clusterName}`)
      setTopology(res.data.topology || [])
    } catch (err) {
      console.error('Failed to load topology', err)
    }
    setLoading(false)
  }

  if (loading || topology.length < 2) return null

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="text-2xl">Replication Topology</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative w-full h-[400px] flex items-center justify-center">
          <svg width="100%" height="100%" viewBox="0 0 600 400">
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
              </marker>
            </defs>
            
            {/* Node positions: triangle layout */}
            {topology.length === 3 && (
              <>
                {/* Node 1 - Top Left */}
                <g transform="translate(150, 100)">
                  <rect x="-80" y="-20" width="160" height="40" rx="6" fill="#9ca3af" stroke="#6b7280" strokeWidth="2" />
                  <text x="0" y="-2" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">
                    {topology[0].node.split(':')[0]}
                  </text>
                  <text x="0" y="12" textAnchor="middle" fill="white" fontSize="9" opacity="0.8">
                    ID: {topology[0].server_id}
                  </text>
                </g>
                
                {/* Node 2 - Top Right */}
                <g transform="translate(450, 100)">
                  <rect x="-80" y="-20" width="160" height="40" rx="6" fill="#9ca3af" stroke="#6b7280" strokeWidth="2" />
                  <text x="0" y="-2" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">
                    {topology[1].node.split(':')[0]}
                  </text>
                  <text x="0" y="12" textAnchor="middle" fill="white" fontSize="9" opacity="0.8">
                    ID: {topology[1].server_id}
                  </text>
                </g>
                
                {/* Node 3 - Bottom Center */}
                <g transform="translate(300, 300)">
                  <rect x="-80" y="-20" width="160" height="40" rx="6" fill="#9ca3af" stroke="#6b7280" strokeWidth="2" />
                  <text x="0" y="-2" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">
                    {topology[2].node.split(':')[0]}
                  </text>
                  <text x="0" y="12" textAnchor="middle" fill="white" fontSize="9" opacity="0.8">
                    ID: {topology[2].server_id}
                  </text>
                </g>
                
                {/* Arrows with labels: Node1 <-> Node2 */}
                <line x1="230" y1="90" x2="370" y2="90" stroke="#6b7280" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <text x="300" y="80" textAnchor="middle" fontSize="10" fill="#6b7280">syncrepl</text>
                <line x1="370" y1="110" x2="230" y2="110" stroke="#6b7280" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <text x="300" y="130" textAnchor="middle" fontSize="10" fill="#6b7280">syncrepl</text>
                
                {/* Arrows with labels: Node1 <-> Node3 */}
                <line x1="190" y1="130" x2="250" y2="270" stroke="#6b7280" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <text x="200" y="200" textAnchor="middle" fontSize="10" fill="#6b7280" transform="rotate(-50 200 200)">syncrepl</text>
                <line x1="260" y1="275" x2="200" y2="135" stroke="#6b7280" strokeWidth="2" markerEnd="url(#arrowhead)" />
                
                {/* Arrows with labels: Node2 <-> Node3 */}
                <line x1="410" y1="130" x2="350" y2="270" stroke="#6b7280" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <text x="400" y="200" textAnchor="middle" fontSize="10" fill="#6b7280" transform="rotate(50 400 200)">syncrepl</text>
                <line x1="340" y1="275" x2="400" y2="135" stroke="#6b7280" strokeWidth="2" markerEnd="url(#arrowhead)" />
              </>
            )}
          </svg>
        </div>
        
        <div className="mt-6 space-y-2 border-t pt-4">
          <div className="text-sm font-semibold mb-3">Replication Details:</div>
          {topology.map((node, idx) => (
            <div key={idx} className="flex items-center gap-3 text-sm">
              <Server className="h-4 w-4 text-primary" />
              <span className="font-mono font-bold">{node.node.split(':')[0]}</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-muted-foreground">reads from:</span>
              {node.reads_from.map((peer, pidx) => (
                <span key={pidx} className="bg-secondary px-2 py-0.5 rounded text-xs font-mono">
                  {peer.host} (RID: {peer.rid})
                </span>
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
