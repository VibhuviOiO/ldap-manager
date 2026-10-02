import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import axios from 'axios'
import ReplicationTopology from '@/components/ReplicationTopology'

vi.mock('axios')

const mockedGet = vi.mocked(axios.get)

/** Two-node cluster: the case that used to render nothing at all. */
const TWO_NODE_TOPOLOGY = {
  topology: [
    {
      node: 'ldap-a:389',
      server_id: '1',
      reads_from: [{ host: 'ldap-b', rid: '101' }],
    },
    {
      node: 'ldap-b:389',
      server_id: '2',
      reads_from: [{ host: 'ldap-a', rid: '201' }],
    },
  ],
}

const THREE_NODE_TOPOLOGY = {
  topology: [
    { node: 'n1:389', server_id: '1', reads_from: [{ host: 'n2', rid: '101' }, { host: 'n3', rid: '102' }] },
    { node: 'n2:389', server_id: '2', reads_from: [{ host: 'n1', rid: '201' }, { host: 'n3', rid: '203' }] },
    { node: 'n3:389', server_id: '3', reads_from: [{ host: 'n1', rid: '301' }, { host: 'n2', rid: '302' }] },
  ],
}

function stat(host: string, overrides: Record<string, unknown> = {}) {
  return {
    node: `${host}:389`,
    total: 39,
    users: 30,
    groups: 3,
    ous: 4,
    status: 'healthy',
    contextCSN: '20260929162951.090329Z#000000#003#000000',
    responseTime: 5,
    syncAge: 120,
    ...overrides,
  }
}

function mockResponses(topology: unknown, nodes: unknown, inSync: boolean | null) {
  mockedGet.mockImplementation((url: string) => {
    if (String(url).includes('/api/monitoring/topology')) {
      return Promise.resolve({ data: topology })
    }
    return Promise.resolve({ data: { nodes, in_sync: inSync } })
  })
}

describe('ReplicationTopology', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // The reported bug: the diagram was gated behind topology.length === 3, so a
  // 2-node cluster rendered an empty box.
  it('renders a diagram for a 2-node cluster', async () => {
    mockResponses(TWO_NODE_TOPOLOGY, [stat('ldap-a'), stat('ldap-b')], true)
    const { container } = render(<ReplicationTopology clusterName="acme" />)

    await waitFor(() => {
      expect(container.querySelector('svg[role="img"]')).toBeTruthy()
    })

    const svg = container.querySelector('svg[role="img"]')!
    expect(svg.getAttribute('aria-label')).toContain('2 replication link(s) between 2 nodes')
    // One dashed path per replication direction
    expect(container.querySelectorAll('path[stroke-dasharray="6 4"]').length).toBe(2)
    // Scoped to the diagram: the host also appears in the detail panel below.
    expect(within(svg as HTMLElement).getByText('ldap-a')).toBeInTheDocument()
    expect(within(svg as HTMLElement).getByText('ldap-b')).toBeInTheDocument()
  })

  it('renders all six directions for a 3-node mesh', async () => {
    mockResponses(THREE_NODE_TOPOLOGY, [stat('n1'), stat('n2'), stat('n3')], true)
    const { container } = render(<ReplicationTopology clusterName="oiocloud" />)

    await waitFor(() => {
      expect(container.querySelector('svg[role="img"]')).toBeTruthy()
    })
    expect(container.querySelectorAll('path[stroke-dasharray="6 4"]').length).toBe(6)
  })

  it('labels each link with its real RID', async () => {
    mockResponses(TWO_NODE_TOPOLOGY, [stat('ldap-a'), stat('ldap-b')], true)
    render(<ReplicationTopology clusterName="acme" />)

    await waitFor(() => {
      expect(screen.getByText('RID 101')).toBeInTheDocument()
    })
    expect(screen.getByText('RID 201')).toBeInTheDocument()
  })

  it('marks a converged cluster as in sync', async () => {
    mockResponses(TWO_NODE_TOPOLOGY, [stat('ldap-a'), stat('ldap-b')], true)
    render(<ReplicationTopology clusterName="acme" />)

    await waitFor(() => {
      expect(screen.getAllByText('IN SYNC').length).toBe(2)
    })
    expect(screen.getByText('in sync')).toBeInTheDocument()
  })

  // Cannot be produced safely against live clusters, so it is pinned here.
  it('flags a node whose contextCSN differs as BEHIND', async () => {
    mockResponses(
      TWO_NODE_TOPOLOGY,
      [
        stat('ldap-a'),
        stat('ldap-b', { contextCSN: '20250101000000.000000Z#000000#001#000000' }),
      ],
      false
    )
    render(<ReplicationTopology clusterName="acme" />)

    await waitFor(() => {
      expect(screen.getByText('BEHIND')).toBeInTheDocument()
    })
    expect(screen.getByText('IN SYNC')).toBeInTheDocument()
    expect(screen.getByText('diverged')).toBeInTheDocument()
  })

  it('flags an unhealthy node as DOWN', async () => {
    mockResponses(
      TWO_NODE_TOPOLOGY,
      [stat('ldap-a'), stat('ldap-b', { status: 'unreachable' })],
      false
    )
    render(<ReplicationTopology clusterName="acme" />)

    await waitFor(() => {
      expect(screen.getByText('DOWN')).toBeInTheDocument()
    })
  })

  it('explains when nodes exist but nothing replicates', async () => {
    mockResponses(
      {
        topology: [
          { node: 'a:389', server_id: '1', reads_from: [] },
          { node: 'b:389', server_id: '2', reads_from: [] },
        ],
      },
      [stat('a'), stat('b')],
      true
    )
    render(<ReplicationTopology clusterName="standalone" />)

    await waitFor(() => {
      expect(screen.getByText(/none replicate from another/i)).toBeInTheDocument()
    })
  })

  it('renders nothing for a single-node cluster', async () => {
    mockResponses(
      { topology: [{ node: 'only:389', server_id: '1', reads_from: [] }] },
      [stat('only')],
      true
    )
    const { container } = render(<ReplicationTopology clusterName="solo" />)

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalled()
    })
    expect(container.querySelector('svg[role="img"]')).toBeNull()
  })

  it('surfaces a load failure instead of a blank card', async () => {
    mockedGet.mockRejectedValue(new Error('boom'))
    render(<ReplicationTopology clusterName="broken" />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not load/i)
    })
  })

  it('shows real per-node numbers', async () => {
    mockResponses(
      TWO_NODE_TOPOLOGY,
      [stat('ldap-a', { total: 1234, users: 900, groups: 12, responseTime: 7 }), stat('ldap-b')],
      true
    )
    render(<ReplicationTopology clusterName="acme" />)

    await waitFor(() => {
      expect(screen.getByText('1234')).toBeInTheDocument()
    })
    expect(screen.getByText('900 / 12')).toBeInTheDocument()
    expect(screen.getByText('7 ms')).toBeInTheDocument()
  })
})
