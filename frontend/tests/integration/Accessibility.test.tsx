import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Dashboard from '@/components/Dashboard'
import ClusterDetails from '@/components/ClusterDetails'
import * as services from '@/services'

vi.mock('@/services')

describe('Accessibility Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Component Rendering', () => {
    it('should render dashboard with accessible elements', async () => {
      vi.mocked(services.clusterService.getClusters).mockResolvedValue([
        { name: 'test', base_dn: 'dc=test', readonly: false }
      ])

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => screen.getByText('test'))
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })

    it('should have navigation with proper roles', async () => {
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

      render(
        <MemoryRouter initialEntries={['/cluster/test']}>
          <Routes>
            <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => {
        const nav = screen.getByRole('navigation')
        expect(nav).toHaveAttribute('aria-label', 'Cluster navigation')
      })
    })

    it('should have table with proper structure', async () => {
      vi.mocked(services.clusterService.getClusters).mockResolvedValue([
        { name: 'test', base_dn: 'dc=test', readonly: false }
      ])
      vi.mocked(services.clusterService.getClusterHealth).mockResolvedValue({ status: 'healthy' })
      vi.mocked(services.clusterService.getClusterColumns).mockResolvedValue({
        users: [{ name: 'uid', label: 'Username', default_visible: true }]
      })
      vi.mocked(services.entryService.searchEntries).mockResolvedValue({
        entries: [
          { dn: 'uid=user1', uid: 'user1' },
          { dn: 'uid=user2', uid: 'user2' }
        ],
        total: 2,
        has_more: false
      })

      render(
        <MemoryRouter initialEntries={['/cluster/test']}>
          <Routes>
            <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => screen.getByText('user1'))
      const table = screen.getByRole('table')
      expect(table).toBeInTheDocument()
    })
  })

  describe('Screen Reader Support', () => {
    it('should announce loading states', async () => {
      vi.mocked(services.clusterService.getClusters).mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return [{ name: 'test', base_dn: 'dc=test', readonly: false }]
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      expect(screen.getByText(/loading/i)).toBeInTheDocument()

      await waitFor(() => {
        expect(screen.getByText('test')).toBeInTheDocument()
      })
    })

    it('should have descriptive button text', async () => {
      vi.mocked(services.clusterService.getClusters).mockResolvedValue([
        { name: 'test', base_dn: 'dc=test', readonly: false }
      ])

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        const buttons = screen.getAllByRole('button')
        buttons.forEach(button => {
          expect(button.textContent || button.getAttribute('aria-label')).toBeTruthy()
        })
      })
    })

    it('should have proper heading hierarchy', async () => {
      vi.mocked(services.clusterService.getClusters).mockResolvedValue([
        { name: 'test', base_dn: 'dc=test', readonly: false }
      ])

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        const heading = screen.getByRole('heading', { name: /ldap clusters/i })
        expect(heading).toBeInTheDocument()
      })
    })
  })
})
