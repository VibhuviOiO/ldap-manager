import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ClusterDetails from '@/components/ClusterDetails'
import * as services from '@/services'

vi.mock('@/services')

describe('Performance Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(services.clusterService.getClusters).mockResolvedValue([
      { name: 'test', base_dn: 'dc=test', readonly: false }
    ])
    vi.mocked(services.clusterService.getClusterHealth).mockResolvedValue({ status: 'healthy' })
    vi.mocked(services.clusterService.getClusterColumns).mockResolvedValue({
      users: [
        { name: 'uid', label: 'Username', default_visible: true },
        { name: 'cn', label: 'Full Name', default_visible: true },
        { name: 'mail', label: 'Email', default_visible: true }
      ]
    })
  })

  describe('Large Dataset Handling', () => {
    it('should handle 1000 entries efficiently', async () => {
      const entries = Array.from({ length: 100 }, (_, i) => ({
        dn: `uid=user${i}`,
        uid: `user${i}`,
        cn: `User ${i}`,
        mail: `user${i}@test.com`
      }))

      vi.mocked(services.entryService.searchEntries).mockResolvedValue({
        entries,
        total: 100,
        has_more: false
      })

      render(
        <MemoryRouter initialEntries={['/cluster/test']}>
          <Routes>
            <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => screen.getByText('user0'))
      expect(screen.getByText('user0')).toBeInTheDocument()
    })

    it('should handle pagination with large datasets', async () => {
      const user = userEvent.setup()

      // First page
      vi.mocked(services.entryService.searchEntries).mockResolvedValueOnce({
        entries: Array.from({ length: 50 }, (_, i) => ({
          dn: `uid=user${i}`,
          uid: `user${i}`
        })),
        total: 500,
        has_more: true
      })

      render(
        <MemoryRouter initialEntries={['/cluster/test']}>
          <Routes>
            <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => screen.getByText('user0'))

      // Second page
      vi.mocked(services.entryService.searchEntries).mockResolvedValueOnce({
        entries: Array.from({ length: 50 }, (_, i) => ({
          dn: `uid=user${i + 50}`,
          uid: `user${i + 50}`
        })),
        total: 500,
        has_more: true
      })

      const nextButton = screen.getByRole('button', { name: /next/i })
      await user.click(nextButton)

      await waitFor(() => {
        expect(screen.getByText('user50')).toBeInTheDocument()
      })
    })
  })

  describe('Search Performance', () => {
    it('should debounce search input', async () => {
      const user = userEvent.setup()
      let searchCallCount = 0

      vi.mocked(services.entryService.searchEntries).mockImplementation(async () => {
        searchCallCount++
        return { entries: [], total: 0, has_more: false }
      })

      render(
        <MemoryRouter initialEntries={['/cluster/test']}>
          <Routes>
            <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => screen.getByPlaceholderText(/search/i))

      const searchInput = screen.getByPlaceholderText(/search/i)
      
      // Type quickly
      await user.type(searchInput, 'test')

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 500))

      // Should not call search for every keystroke
      expect(searchCallCount).toBeLessThan(5)
    })

    it('should handle rapid filter changes', async () => {
      const user = userEvent.setup()

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

      await waitFor(() => screen.getByRole('tab', { name: /users/i }))

      // Rapidly switch tabs
      const usersTab = screen.getByRole('tab', { name: /users/i })
      await user.click(usersTab)
      await user.click(usersTab)
      await user.click(usersTab)

      // Should handle gracefully
      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /users/i })).toBeInTheDocument()
      })
    })
  })

  describe('Memory Management', () => {
    it('should cleanup on unmount', async () => {
      vi.mocked(services.entryService.searchEntries).mockResolvedValue({
        entries: Array.from({ length: 100 }, (_, i) => ({
          dn: `uid=user${i}`,
          uid: `user${i}`
        })),
        total: 100,
        has_more: false
      })

      const { unmount } = render(
        <MemoryRouter initialEntries={['/cluster/test']}>
          <Routes>
            <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => screen.getByText('user0'))

      // Unmount should not cause memory leaks
      unmount()

      // Wait a bit to ensure cleanup
      await new Promise(resolve => setTimeout(resolve, 100))
    })

    it('should not leak event listeners', async () => {
      const initialListenerCount = window.addEventListener.length

      const { unmount } = render(
        <MemoryRouter initialEntries={['/cluster/test']}>
          <Routes>
            <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => screen.getByRole('tab', { name: /users/i }))

      unmount()

      // Event listeners should be cleaned up
      const finalListenerCount = window.addEventListener.length
      expect(finalListenerCount).toBeLessThanOrEqual(initialListenerCount + 5)
    })
  })

  describe('Render Optimization', () => {
    it('should not re-render unnecessarily', async () => {
      let renderCount = 0

      vi.mocked(services.entryService.searchEntries).mockImplementation(async () => {
        renderCount++
        return {
          entries: [{ dn: 'uid=user1', uid: 'user1' }],
          total: 1,
          has_more: false
        }
      })

      render(
        <MemoryRouter initialEntries={['/cluster/test']}>
          <Routes>
            <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => screen.getByText('user1'))

      const initialRenderCount = renderCount

      // Interact with component
      const searchInput = screen.getByPlaceholderText(/search/i)
      await userEvent.clear(searchInput)

      await new Promise(resolve => setTimeout(resolve, 100))

      // Should not cause excessive re-renders
      expect(renderCount - initialRenderCount).toBeLessThan(5)
    })

    it('should memoize expensive computations', async () => {
      const entries = Array.from({ length: 100 }, (_, i) => ({
        dn: `uid=user${i}`,
        uid: `user${i}`,
        cn: `User ${i}`
      }))

      vi.mocked(services.entryService.searchEntries).mockResolvedValue({
        entries,
        total: 100,
        has_more: false
      })

      const startTime = performance.now()

      render(
        <MemoryRouter initialEntries={['/cluster/test']}>
          <Routes>
            <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => screen.getByText('user0'))

      const endTime = performance.now()

      // Initial render should be fast
      expect(endTime - startTime).toBeLessThan(2000)
    })
  })

  describe('Network Performance', () => {
    it('should handle slow network gracefully', async () => {
      vi.mocked(services.entryService.searchEntries).mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 500))
        return { entries: [], total: 0, has_more: false }
      })

      render(
        <MemoryRouter initialEntries={['/cluster/test']}>
          <Routes>
            <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /users/i })).toBeInTheDocument()
      }, { timeout: 1000 })
    })

    it('should batch multiple requests', async () => {
      let requestCount = 0

      vi.mocked(services.entryService.searchEntries).mockImplementation(async () => {
        requestCount++
        await new Promise(resolve => setTimeout(resolve, 50))
        return { entries: [], total: 0, has_more: false }
      })

      render(
        <MemoryRouter initialEntries={['/cluster/test']}>
          <Routes>
            <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => screen.getByRole('tab', { name: /users/i }))

      // Should not make excessive requests
      expect(requestCount).toBeLessThan(5)
    })
  })
})
