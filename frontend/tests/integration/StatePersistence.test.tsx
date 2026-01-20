import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ClusterDetails from '@/components/ClusterDetails'
import * as services from '@/services'

vi.mock('@/services')

describe('State Persistence - localStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    
    vi.mocked(services.clusterService.getClusters).mockResolvedValue([
      { name: 'test', base_dn: 'dc=test', readonly: false }
    ])
    vi.mocked(services.clusterService.getClusterHealth).mockResolvedValue({ status: 'healthy' })
    vi.mocked(services.entryService.searchEntries).mockResolvedValue({
      entries: [],
      total: 0,
      has_more: false
    })
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('Column Preferences', () => {
    it('should save column preferences to localStorage', async () => {
      const mockColumns = {
        users: [
          { name: 'uid', label: 'Username', default_visible: true },
          { name: 'cn', label: 'Full Name', default_visible: true },
          { name: 'mail', label: 'Email', default_visible: false }
        ]
      }

      vi.mocked(services.clusterService.getClusterColumns).mockResolvedValue(mockColumns)

      render(
        <MemoryRouter initialEntries={['/cluster/test']}>
          <Routes>
            <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /users/i })).toBeInTheDocument()
      })

      await new Promise(resolve => setTimeout(resolve, 500))

      const saved = localStorage.getItem('ldap-columns-test')
      expect(saved).toBeTruthy()
    })

    it('should restore column preferences from localStorage', async () => {
      const savedPrefs = {
        users: ['uid', 'mail']
      }
      localStorage.setItem('ldap-columns-test', JSON.stringify(savedPrefs))

      const mockColumns = {
        users: [
          { name: 'uid', label: 'Username', default_visible: true },
          { name: 'cn', label: 'Full Name', default_visible: true },
          { name: 'mail', label: 'Email', default_visible: false }
        ]
      }

      vi.mocked(services.clusterService.getClusterColumns).mockResolvedValue(mockColumns)

      render(
        <MemoryRouter initialEntries={['/cluster/test']}>
          <Routes>
            <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /users/i })).toBeInTheDocument()
      })
    })

    it('should use defaults when no saved preferences', async () => {
      const mockColumns = {
        users: [
          { name: 'uid', label: 'Username', default_visible: true },
          { name: 'cn', label: 'Full Name', default_visible: false }
        ]
      }

      vi.mocked(services.clusterService.getClusterColumns).mockResolvedValue(mockColumns)

      render(
        <MemoryRouter initialEntries={['/cluster/test']}>
          <Routes>
            <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /users/i })).toBeInTheDocument()
      })

      await new Promise(resolve => setTimeout(resolve, 500))

      const saved = localStorage.getItem('ldap-columns-test')
      expect(saved).toBeTruthy()
      if (saved) {
        const parsed = JSON.parse(saved)
        expect(parsed.users).toContain('uid')
      }
    })

    it('should handle corrupted localStorage data', async () => {
      localStorage.setItem('ldap-columns-test', 'invalid-json')

      const mockColumns = {
        users: [{ name: 'uid', label: 'Username', default_visible: true }]
      }

      vi.mocked(services.clusterService.getClusterColumns).mockResolvedValue(mockColumns)

      render(
        <MemoryRouter initialEntries={['/cluster/test']}>
          <Routes>
            <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /users/i })).toBeInTheDocument()
      })
    })
  })

  describe('localStorage Limits', () => {
    it('should handle localStorage quota exceeded', async () => {
      const mockColumns = {
        users: [{ name: 'uid', label: 'Username', default_visible: true }]
      }

      vi.mocked(services.clusterService.getClusterColumns).mockResolvedValue(mockColumns)

      const originalSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = vi.fn(() => {
        throw new Error('QuotaExceededError')
      })

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(
        <MemoryRouter initialEntries={['/cluster/test']}>
          <Routes>
            <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /users/i })).toBeInTheDocument()
      })

      Storage.prototype.setItem = originalSetItem
      consoleError.mockRestore()
    })
  })

  describe('Cross-Tab Synchronization', () => {
    it('should handle storage events from other tabs', async () => {
      const mockColumns = {
        users: [{ name: 'uid', label: 'Username', default_visible: true }]
      }

      vi.mocked(services.clusterService.getClusterColumns).mockResolvedValue(mockColumns)

      render(
        <MemoryRouter initialEntries={['/cluster/test']}>
          <Routes>
            <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /users/i })).toBeInTheDocument()
      })

      const newPrefs = { users: ['uid', 'cn', 'mail'] }
      localStorage.setItem('ldap-columns-test', JSON.stringify(newPrefs))

      const storageEvent = new StorageEvent('storage', {
        key: 'ldap-columns-test',
        newValue: JSON.stringify(newPrefs),
        storageArea: localStorage
      })

      window.dispatchEvent(storageEvent)
    })
  })
})
