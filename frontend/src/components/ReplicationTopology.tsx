import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Play, Pause, RefreshCw, AlertTriangle, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import axios from 'axios'

interface ReplicationTopologyProps {
  clusterName: string
}

interface TopologyNode {
  node: string
  server_id: string | null
  reads_from: Array<{ host: string; rid: string }>
}

interface NodeStat {
  node: string
  total: number
  users: number
  groups: number
  ous: number
  status: string
  contextCSN: string | null
  responseTime: number
  syncAge: number
}

interface Edge {
  key: string
  from: number
  to: number
  rid: string
}

interface Packet {
  id: number
  edge: number
  progress: number
  speed: number
  color: string
}

interface Point {
  x: number
  y: number
}

const VIEW_W = 760
const VIEW_H = 230
const CARD_W = 160
const CARD_H = 44
const MAX_PACKETS = 44
const SPAWN_EVERY_MS = 260

// Same accent palette as the docs animation.
const NODE_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4']

const hostOf = (value: string) => value.split(':')[0]
const portOf = (value: string) => value.split(':')[1] ?? '389'

function formatAge(seconds: number | undefined): string {
  if (seconds === undefined || seconds === null) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`
  return `${Math.round(seconds / 86400)}d ago`
}

/** Node positions: two side by side, three on a wide triangle, more on a ring. */
function layoutNodes(count: number): Point[] {
  const cx = VIEW_W / 2
  const cy = VIEW_H / 2

  if (count === 2) {
    return [
      { x: cx - 185, y: cy },
      { x: cx + 185, y: cy },
    ]
  }

  if (count === 3) {
    // Same triangle as the docs animation, so the three nodes never crowd.
    return [
      { x: 120, y: 66 },
      { x: cx, y: 180 },
      { x: VIEW_W - 120, y: 66 },
    ]
  }

  const radius = Math.min(96, 70 + count * 5)
  return Array.from({ length: count }, (_, index) => {
    const angle = (2 * Math.PI * index) / count - Math.PI / 2
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
  })
}

/** Quadratic bezier with a slight bow, shared by the stroke and the packets. */
function edgeGeometry(a: Point, b: Point, offset: number) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy) || 1
  const nx = -dy / length
  const ny = dx / length

  const start = { x: a.x + nx * offset, y: a.y + ny * offset }
  const end = { x: b.x + nx * offset, y: b.y + ny * offset }

  const mx = (start.x + end.x) / 2
  const my = (start.y + end.y) / 2
  const bow = 0.12
  const control = { x: mx - dy * bow, y: my + dx * bow }

  return {
    start,
    control,
    end,
    path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
  }
}

function pointOnEdge(geometry: ReturnType<typeof edgeGeometry>, t: number): Point {
  const u = 1 - t
  const { start, control, end } = geometry
  return {
    x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
    y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
  }
}

/** Shorten the end so the arrowhead lands outside the node card. */
function trimmedEnd(geometry: ReturnType<typeof edgeGeometry>, back: number) {
  const dx = geometry.end.x - geometry.control.x
  const dy = geometry.end.y - geometry.control.y
  const length = Math.hypot(dx, dy) || 1
  return {
    x: geometry.end.x - (dx / length) * back,
    y: geometry.end.y - (dy / length) * back,
  }
}

/** Pull the start forward so the line leaves the node card, not its centre. */
function trimmedStart(geometry: ReturnType<typeof edgeGeometry>, forward: number) {
  const dx = geometry.control.x - geometry.start.x
  const dy = geometry.control.y - geometry.start.y
  const length = Math.hypot(dx, dy) || 1
  return {
    x: geometry.start.x + (dx / length) * forward,
    y: geometry.start.y + (dy / length) * forward,
  }
}

export default function ReplicationTopology({ clusterName }: ReplicationTopologyProps) {
  const [topology, setTopology] = useState<TopologyNode[]>([])
  const [stats, setStats] = useState<NodeStat[]>([])
  const [inSync, setInSync] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [packets, setPackets] = useState<Packet[]>([])
  const [playing, setPlaying] = useState(true)
  const [showDiagram, setShowDiagram] = useState(false)

  const packetId = useRef(0)
  const spawnAccumulator = useRef(0)
  const edgeCursor = useRef(0)

  // Respect the OS "reduce motion" setting.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduced) setPlaying(false)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [topo, nodeStats] = await Promise.all([
        axios.get(`/api/monitoring/topology?cluster=${clusterName}`),
        axios.get(`/api/monitoring/nodes?cluster=${clusterName}`).catch(() => null),
      ])
      setTopology(topo.data.topology || [])
      if (nodeStats?.data) {
        setStats(nodeStats.data.nodes || [])
        setInSync(nodeStats.data.in_sync ?? null)
      }
    } catch (err) {
      console.error('Failed to load topology', err)
      setError('Could not load the replication topology.')
    }
    setLoading(false)
  }, [clusterName])

  useEffect(() => {
    load()
  }, [load])

  const positions = useMemo(() => layoutNodes(topology.length), [topology.length])
  const indexByHost = useMemo(
    () => new Map(topology.map((node, index) => [hostOf(node.node), index])),
    [topology]
  )

  // Real replication links, from the directory rather than an assumed shape.
  const edges = useMemo<Edge[]>(() => {
    const built: Edge[] = []
    topology.forEach((node, from) => {
      node.reads_from.forEach((peer, k) => {
        const to = indexByHost.get(hostOf(peer.host))
        if (to === undefined || to === from) return
        built.push({ key: `${from}-${to}-${k}`, from, to, rid: peer.rid })
      })
    })
    return built
  }, [topology, indexByHost])

  const geometries = useMemo(
    () =>
      edges.map((edge) => {
        const a = positions[edge.from]
        const b = positions[edge.to]
        if (!a || !b) return null
        const offset = edge.from < edge.to ? 9 : -9
        return edgeGeometry(a, b, offset)
      }),
    [edges, positions]
  )

  const statsByHost = useMemo(
    () => new Map(stats.map((s) => [hostOf(s.node), s])),
    [stats]
  )

  // Which nodes are behind? Drives both the badge and the packet colour.
  const behindHosts = useMemo(() => {
    const csns = stats.map((s) => s.contextCSN).filter(Boolean) as string[]
    if (csns.length < 2) return new Set<string>()
    const counts = new Map<string, number>()
    csns.forEach((csn) => counts.set(csn, (counts.get(csn) ?? 0) + 1))
    const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    return new Set(stats.filter((s) => s.contextCSN && s.contextCSN !== majority).map((s) => hostOf(s.node)))
  }, [stats])

  const edgesRef = useRef(edges)
  const geometriesRef = useRef(geometries)
  const behindRef = useRef(behindHosts)
  edgesRef.current = edges
  geometriesRef.current = geometries
  behindRef.current = behindHosts

  // Animation loop: move packets along their edge, spawn new ones steadily.
  useEffect(() => {
    if (!playing || !showDiagram || edges.length === 0) {
      setPackets([])
      return
    }

    let raf = 0
    let last = performance.now()

    const step = (now: number) => {
      const delta = Math.min(now - last, 64)
      last = now

      setPackets((prev) => {
        const next: Packet[] = []
        for (const packet of prev) {
          const progress = packet.progress + delta * packet.speed
          if (progress < 1) next.push({ ...packet, progress })
        }

        spawnAccumulator.current += delta
        const live = edgesRef.current
        while (
          spawnAccumulator.current >= SPAWN_EVERY_MS &&
          next.length < MAX_PACKETS &&
          live.length > 0
        ) {
          spawnAccumulator.current -= SPAWN_EVERY_MS
          const edgeIndex = edgeCursor.current % live.length
          edgeCursor.current += 1
          const edge = live[edgeIndex]
          const behind = behindRef.current.has(hostOf(topology[edge.to]?.node ?? ''))
          next.push({
            id: packetId.current++,
            edge: edgeIndex,
            progress: 0,
            speed: 0.00045 + Math.random() * 0.00025,
            color: behind ? '#f59e0b' : NODE_COLORS[edge.from % NODE_COLORS.length],
          })
        }
        return next
      })

      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, showDiagram, edges.length, topology])

  // Do not burn cycles in a background tab.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPackets([])
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  if (loading) return null

  if (error) {
    return (
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="text-lg">Replication Topology</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive flex items-center gap-2" role="alert">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {error}
          </p>
        </CardContent>
      </Card>
    )
  }

  if (topology.length < 2) return null

  const oldestSync = stats.length
    ? Math.max(...stats.map((s) => s.syncAge || 0))
    : undefined

  return (
    <Card className="border-2 overflow-hidden">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Replication Topology</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {edges.length} replication link{edges.length === 1 ? '' : 's'} across{' '}
              {topology.length} nodes — flow shows syncRepl direction
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowDiagram((v) => !v)}>
              {showDiagram ? (
                <>
                  <EyeOff className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  Hide diagram
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  Diagram
                </>
              )}
            </Button>
            {showDiagram && (
              <Button variant="outline" size="sm" onClick={() => setPlaying((p) => !p)}>
                {playing ? (
                  <>
                    <Pause className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                    Animate
                  </>
                )}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Real numbers, not a simulation. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            {inSync === false ? (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
            )}
            Convergence:{' '}
            <span
              className={`font-semibold ${
                inSync === false ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
              }`}
            >
              {inSync === null ? 'unknown' : inSync ? 'in sync' : 'diverged'}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            Oldest sync: <span className="font-semibold text-foreground">{formatAge(oldestSync)}</span>
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {showDiagram && edges.length === 0 && (
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
            <p className="text-muted-foreground">
              {topology.length} nodes are configured but none replicate from another. Each node is
              serving independently.
            </p>
          </div>
        )}
        {showDiagram && edges.length > 0 && (
          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className="w-full h-auto min-w-[520px]"
              role="img"
              aria-label={`Replication topology for ${clusterName}: ${edges.length} replication link(s) between ${topology.length} nodes`}
            >
              <defs>
                <filter id="repl-glow" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <marker
                  id="repl-arrow"
                  viewBox="0 0 10 7"
                  refX="10"
                  refY="3.5"
                  markerWidth="8"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 3.5 L 0 7 z" className="fill-muted-foreground" />
                </marker>
              </defs>

              {/* Dashed syncRepl links, one per real replication direction. */}
              {edges.map((edge, index) => {
                const geometry = geometries[index]
                if (!geometry) return null
                const start = trimmedStart(geometry, CARD_W / 2 + 6)
                const end = trimmedEnd(geometry, CARD_W / 2 + 6)
                return (
                  <path
                    key={edge.key}
                    d={`M ${start.x} ${start.y} Q ${geometry.control.x} ${geometry.control.y} ${end.x} ${end.y}`}
                    fill="none"
                    className="stroke-border"
                    strokeWidth="1.75"
                    strokeDasharray="5 4"
                    markerEnd="url(#repl-arrow)"
                  />
                )
              })}

              {/* RID label per link, from the directory's own config. */}
              {edges.map((edge, index) => {
                const geometry = geometries[index]
                if (!geometry) return null
                const mid = pointOnEdge(geometry, 0.5)
                return (
                  <text
                    key={`label-${edge.key}`}
                    x={mid.x}
                    y={mid.y}
                    textAnchor="middle"
                    dy="-7"
                    className="fill-muted-foreground text-[10px] font-mono"
                  >
                    RID {edge.rid}
                  </text>
                )
              })}

              {/* Packets travelling provider -> consumer. */}
              {packets.map((packet) => {
                const geometry = geometries[packet.edge]
                if (!geometry) return null
                const pos = pointOnEdge(geometry, packet.progress)
                const scale = 0.75 + Math.sin(packet.progress * Math.PI) * 0.35
                return (
                  <g key={packet.id} transform={`translate(${pos.x}, ${pos.y})`}>
                    <circle r={9 * scale} fill={packet.color} opacity={0.18} filter="url(#repl-glow)" />
                    <circle r={4.5 * scale} fill={packet.color} opacity={0.95} />
                  </g>
                )
              })}

              {/* Nodes as compact cards: identity strip, status dot, host, meta. */}
              {topology.map((node, index) => {
                const position = positions[index]
                if (!position) return null
                const host = hostOf(node.node)
                const stat = statsByHost.get(host)
                const color = NODE_COLORS[index % NODE_COLORS.length]
                const behind = behindHosts.has(host)
                const down = stat ? stat.status !== 'healthy' : false
                const active = behind || down
                const statusColor = down ? '#ef4444' : behind ? '#f59e0b' : '#10b981'
                const shortHost = host.length > 20 ? `${host.slice(0, 19)}…` : host

                return (
                  <g key={node.node} transform={`translate(${position.x}, ${position.y})`}>
                    {active && (
                      <rect
                        x={-CARD_W / 2 - 4}
                        y={-CARD_H / 2 - 4}
                        width={CARD_W + 8}
                        height={CARD_H + 8}
                        rx={10}
                        fill="none"
                        stroke={down ? '#ef4444' : '#f59e0b'}
                        strokeWidth="1.5"
                        opacity={0.4}
                      >
                        <animate attributeName="opacity" values="0.4;0.1;0.4" dur="1.6s" repeatCount="indefinite" />
                      </rect>
                    )}

                    <rect
                      x={-CARD_W / 2}
                      y={-CARD_H / 2}
                      width={CARD_W}
                      height={CARD_H}
                      rx={8}
                      className="fill-card"
                      stroke={color}
                      strokeWidth={1.5}
                    />

                    {/* Identity strip */}
                    <rect x={-CARD_W / 2} y={-CARD_H / 2} width={4} height={CARD_H} rx={2} fill={color} />

                    {/* Status dot */}
                    <circle cx={-CARD_W / 2 + 14} cy={-CARD_H / 2 + 12} r={3.5} fill={statusColor} />

                    <text
                      x={-CARD_W / 2 + 24}
                      y={-3}
                      className="fill-foreground text-[10px] font-semibold"
                    >
                      {shortHost}
                    </text>
                    <text
                      x={-CARD_W / 2 + 24}
                      y={13}
                      className="fill-muted-foreground text-[9px] font-mono"
                    >
                      :{portOf(node.node)} · ID {node.server_id ?? '?'} · {stat ? `${stat.total} entries` : '—'}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        )}

        {/* Per-node data in a scannable table instead of crammed mini-panels. */}
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Node</th>
                  <th className="px-3 py-2 font-medium">Server ID</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">Entries</th>
                  <th className="px-3 py-2 font-medium text-right">Users</th>
                  <th className="px-3 py-2 font-medium text-right">Groups</th>
                  <th className="px-3 py-2 font-medium text-right">Response</th>
                  <th className="px-3 py-2 font-medium text-right">Last change</th>
                </tr>
              </thead>
              <tbody>
                {topology.map((node, index) => {
                  const host = hostOf(node.node)
                  const stat = statsByHost.get(host)
                  const color = NODE_COLORS[index % NODE_COLORS.length]
                  const behind = behindHosts.has(host)
                  const down = stat ? stat.status !== 'healthy' : false

                  const badge = down
                    ? { text: 'DOWN', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' }
                    : behind
                      ? { text: 'BEHIND', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' }
                      : { text: 'IN SYNC', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' }

                  return (
                    <tr key={node.node} className="border-t">
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-2 font-medium">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} aria-hidden="true" />
                          <span className="truncate">{host}</span>
                          <span className="text-muted-foreground font-mono text-xs">:{portOf(node.node)}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{node.server_id ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${badge.cls}`}>
                          {badge.text}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{stat?.total ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{stat?.users ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{stat?.groups ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{stat ? `${stat.responseTime} ms` : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatAge(stat?.syncAge)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary inline-block" aria-hidden="true" />
            syncRepl flow (provider → consumer)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" aria-hidden="true" />
            node is behind its peers
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-destructive inline-block" aria-hidden="true" />
            node unreachable
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
