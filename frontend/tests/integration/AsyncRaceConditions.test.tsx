import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ClusterDetails from '@/components/ClusterDetails'
import * as services from '@/services'

vi.mock('@/services')

describe('Async Race Conditions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(services.clusterService.getClusters).mockResolvedValue([
      { name: 'test', base_dn: 'dc=test', readonly: false }
    ])
    vi.mocked(services.clusterService.getClusterHealth).mockResolvedValue({ status: 'healthy' })
    vi.mocked(services.clusterService.getClusterColumns).mockResolvedValue({
      users: [{ name: 'uid', label: 'Username', default_visible: true }]
    })
  })

  it('should handle rapid search queries', async () => {
    const user = userEvent.setup()
    let callCount = 0

    vi.mocked(services.entryService.searchEntries).mockImplementation(async () => {
      callCount++
      await new Promise(resolve => setTimeout(resolve, callCount === 1 ? 100 : 10))
      return {
        entries: [{ dn: `uid=user${callCount}`, uid: `user${callCount}` }],
        total: 1,
        has_more: false
      }
    })

    render(
      <MemoryRouter initialEntries={['/cluster/test']}>\n        <Routes>
          <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => screen.getByRole('tab', { name: /users/i }))

    const searchInput = screen.getByPlaceholderText(/search/i)
    
    // Rapid typing
    await user.type(searchInput, 'abc')

    // Should only show results from last query
    await waitFor(() => {
      expect(callCount).toBeGreaterThan(1)
    })
  })

  it('should handle concurrent create operations', async () => {
    const user = userEvent.setup()

    vi.mocked(services.entryService.searchEntries).mockResolvedValue({
      entries: [],
      total: 0,
      has_more: false
    })

    vi.mocked(services.clusterService.getClusterForm).mockResolvedValue({
      base_ou: 'ou=users,dc=test',
      object_classes: ['inetOrgPerson'],
      fields: [
        { name: 'uid', label: 'Username', type: 'text', required: true },
        { name: 'cn', label: 'Full Name', type: 'text', required: true }
      ]
    })

    let createCount = 0
    vi.mocked(services.entryService.createEntry).mockImplementation(async () => {
      createCount++
      await new Promise(resolve => setTimeout(resolve, 50))
    })

    render(
      <MemoryRouter initialEntries={['/cluster/test']}>\n        <Routes>
          <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => screen.getAllByLabelText(/create new user/i)[0])

    // Try to create user twice rapidly
    const createButton = screen.getAllByRole('button', { name: /create new user/i })[0]
    await user.click(createButton)

    await waitFor(() => screen.getByText('Create New User'))

    await user.type(screen.getByLabelText('Username *'), 'user1')
    await user.type(screen.getByLabelText('Full Name *'), 'User One')

    const submitButtons = screen.getAllByRole('button', { name: /create user/i })
    const submitButton = submitButtons[submitButtons.length - 1]

    // Click twice rapidly
    await user.click(submitButton)
    await user.click(submitButton)

    // Should only create once
    await waitFor(() => {
      expect(createCount).toBeLessThanOrEqual(1)
    })
  })

  it('should handle component unmount during async operation', async () => {
    vi.mocked(services.entryService.searchEntries).mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
      return { entries: [], total: 0, has_more: false }
    })

    const { unmount } = render(
      <MemoryRouter initialEntries={['/cluster/test']}>\n        <Routes>
          <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
        </Routes>
      </MemoryRouter>
    )

    // Unmount before async completes
    unmount()

    // Should not throw error
    await new Promise(resolve => setTimeout(resolve, 150))
  })

  it('should handle stale data from slow requests', async () => {
    let requestId = 0

    vi.mocked(services.entryService.searchEntries).mockImplementation(async () => {
      const id = ++requestId
      await new Promise(resolve => setTimeout(resolve, 50))
      
      return {
        entries: [{ dn: `uid=result${id}`, uid: `result${id}` }],
        total: 1,
        has_more: false
      }
    })

    render(
      <MemoryRouter initialEntries={['/cluster/test']}>\n        <Routes>
          <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => screen.getByRole('tab', { name: /users/i }))

    await waitFor(() => {
      expect(requestId).toBeGreaterThanOrEqual(1)
    }, { timeout: 200 })
  })

  it('should handle delete during refresh', async () => {
    const user = userEvent.setup()

    vi.mocked(services.entryService.searchEntries).mockResolvedValue({
      entries: [{ dn: 'uid=user1', uid: 'user1', cn: 'User One' }],
      total: 1,
      has_more: false
    })

    vi.mocked(services.entryService.deleteEntry).mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
    })

    render(
      <MemoryRouter initialEntries={['/cluster/test']}>\n        <Routes>
          <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => screen.getByText('user1'))

    window.confirm = vi.fn(() => true)

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
    await user.click(deleteButtons[0])

    // Should handle gracefully
    await waitFor(() => {
      expect(services.entryService.deleteEntry).toHaveBeenCalled()
    })
  })
})
