import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import Dashboard from '@/components/Dashboard'
import * as services from '@/services'

vi.mock('@/services', () => ({
  clusterService: {
    getClusters: vi.fn()
  },
  passwordService: {
    checkPasswordCache: vi.fn()
  },
  connectionService: {
    connect: vi.fn()
  }
}))

const mockClusters = [
  { name: 'Test Cluster', host: 'localhost', port: 389, description: 'Test LDAP cluster' },
  { name: 'Prod Cluster', host: '10.0.0.1', port: 636, description: 'Production cluster' }
]

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render page title', async () => {
    vi.mocked(services.clusterService.getClusters).mockResolvedValue([])

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    expect(screen.getByText('LDAP Clusters')).toBeInTheDocument()
    expect(screen.getByText('Manage and monitor your directory services')).toBeInTheDocument()
  })

  it('should display clusters after loading', async () => {
    vi.mocked(services.clusterService.getClusters).mockResolvedValue(mockClusters)
    vi.mocked(services.passwordService.checkPasswordCache).mockResolvedValue({ cached: false })

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Test Cluster')).toBeInTheDocument()
      expect(screen.getByText('Prod Cluster')).toBeInTheDocument()
    })
  })

  it('should show connected status when password is cached', async () => {
    vi.mocked(services.clusterService.getClusters).mockResolvedValue([mockClusters[0]])
    vi.mocked(services.passwordService.checkPasswordCache).mockResolvedValue({ cached: true })

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument()
      expect(screen.getByText('View Cluster')).toBeInTheDocument()
    })
  })

  it('should show setup password button when not cached', async () => {
    vi.mocked(services.clusterService.getClusters).mockResolvedValue([mockClusters[0]])
    vi.mocked(services.passwordService.checkPasswordCache).mockResolvedValue({ cached: false })

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Setup Password')).toBeInTheDocument()
    })
  })

  it('should open password dialog on setup password click', async () => {
    vi.mocked(services.clusterService.getClusters).mockResolvedValue([mockClusters[0]])
    vi.mocked(services.passwordService.checkPasswordCache).mockResolvedValue({ cached: false })

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Setup Password')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Setup Password'))

    await waitFor(() => {
      expect(screen.getByText('Setup Password for Test Cluster')).toBeInTheDocument()
    })
  })

  it('should submit password and connect', async () => {
    vi.mocked(services.clusterService.getClusters).mockResolvedValue([mockClusters[0]])
    vi.mocked(services.passwordService.checkPasswordCache).mockResolvedValue({ cached: false })
    vi.mocked(services.connectionService.connect).mockResolvedValue(undefined)

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      fireEvent.click(screen.getByText('Setup Password'))
    })

    await waitFor(() => {
      expect(screen.getByLabelText('Password')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'testpass' } })
    fireEvent.click(screen.getByText('Save Password'))

    await waitFor(() => {
      expect(services.connectionService.connect).toHaveBeenCalledWith('Test Cluster', 'testpass')
    })
  })

  it('should display error on connection failure', async () => {
    vi.mocked(services.clusterService.getClusters).mockResolvedValue([mockClusters[0]])
    vi.mocked(services.passwordService.checkPasswordCache).mockResolvedValue({ cached: false })
    vi.mocked(services.connectionService.connect).mockRejectedValue({
      response: { data: { detail: 'Invalid credentials' } }
    })

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      fireEvent.click(screen.getByText('Setup Password'))
    })

    await waitFor(() => {
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
      fireEvent.click(screen.getByText('Save Password'))
    })

    await waitFor(() => {
      expect(screen.getAllByText('Invalid credentials').length).toBeGreaterThan(0)
    })
  })

  it('should display error on load failure', async () => {
    vi.mocked(services.clusterService.getClusters).mockRejectedValue({
      response: { data: { detail: 'Config file not found' } }
    })

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Configuration Error')).toBeInTheDocument()
      expect(screen.getByText('Config file not found')).toBeInTheDocument()
    })
  })

  it('should show config help when config not found', async () => {
    vi.mocked(services.clusterService.getClusters).mockRejectedValue({
      response: { data: { detail: 'config.yml not found' } }
    })

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Please create/i)).toBeInTheDocument()
      expect(screen.getByText('config.yml')).toBeInTheDocument()
    })
  })

  it('should display cluster description', async () => {
    vi.mocked(services.clusterService.getClusters).mockResolvedValue([mockClusters[0]])
    vi.mocked(services.passwordService.checkPasswordCache).mockResolvedValue({ cached: false })

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Test LDAP cluster')).toBeInTheDocument()
    })
  })

  it('should display cluster host and port', async () => {
    vi.mocked(services.clusterService.getClusters).mockResolvedValue([mockClusters[0]])
    vi.mocked(services.passwordService.checkPasswordCache).mockResolvedValue({ cached: false })

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('localhost:389')).toBeInTheDocument()
    })
  })

  it('should require password before submit', async () => {
    vi.mocked(services.clusterService.getClusters).mockResolvedValue([mockClusters[0]])
    vi.mocked(services.passwordService.checkPasswordCache).mockResolvedValue({ cached: false })

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      fireEvent.click(screen.getByText('Setup Password'))
    })

    await waitFor(() => {
      fireEvent.click(screen.getByText('Save Password'))
    })

    await waitFor(() => {
      expect(screen.getAllByText('Password required').length).toBeGreaterThan(0)
    })
  })
})
