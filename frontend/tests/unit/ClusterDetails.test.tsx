import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ClusterDetails from '@/components/ClusterDetails'
import * as services from '@/services'

vi.mock('@/services', () => ({
  clusterService: {
    getClusters: vi.fn(),
    getClusterHealth: vi.fn(),
    getClusterColumns: vi.fn()
  },
  entryService: {
    searchEntries: vi.fn()
  }
}))

describe('ClusterDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(services.clusterService.getClusters).mockResolvedValue([
      { name: 'test', base_dn: 'dc=test', readonly: false }
    ])
    vi.mocked(services.clusterService.getClusterHealth).mockResolvedValue({ status: 'healthy' })
    vi.mocked(services.clusterService.getClusterColumns).mockResolvedValue({
      users: [{ name: 'uid', label: 'Username', default_visible: true }]
    })
    vi.mocked(services.entryService.searchEntries).mockResolvedValue({
      entries: [],
      total: 0,
      has_more: false
    })
  })

  it('should render component', async () => {
    render(
      <MemoryRouter initialEntries={['/cluster/test']}>
        <Routes>
          <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /users/i })).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should display navigation tabs', async () => {
    render(
      <MemoryRouter initialEntries={['/cluster/test']}>
        <Routes>
          <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Groups')).toBeInTheDocument()
      expect(screen.getByText('Organizational Units')).toBeInTheDocument()
      expect(screen.getByText('Monitoring')).toBeInTheDocument()
    })
  })

  it('should load cluster data', async () => {
    render(
      <MemoryRouter initialEntries={['/cluster/test']}>
        <Routes>
          <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(services.clusterService.getClusters).toHaveBeenCalled()
      expect(services.entryService.searchEntries).toHaveBeenCalled()
    })
  })
})
