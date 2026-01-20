import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import Dashboard from '@/components/Dashboard'
import * as services from '@/services'

vi.mock('@/services')

describe('Dashboard - User Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Connection Flow - Success Path', () => {
    it('should complete full connection flow', async () => {
      const user = userEvent.setup()
      vi.mocked(services.clusterService.getClusters).mockResolvedValue([
        { name: 'Test', host: 'localhost', port: 389 }
      ])
      vi.mocked(services.passwordService.checkPasswordCache).mockResolvedValue({ cached: false })
      vi.mocked(services.connectionService.connect).mockResolvedValue(undefined)

      render(<BrowserRouter><Dashboard /></BrowserRouter>)

      await waitFor(() => expect(screen.getByText('Test')).toBeInTheDocument())

      await user.click(screen.getByText('Setup Password'))

      const passwordInput = await screen.findByLabelText('Password')
      await user.type(passwordInput, 'testpass123')

      await user.click(screen.getByText('Save Password'))

      await waitFor(() => {
        expect(services.connectionService.connect).toHaveBeenCalledWith('Test', 'testpass123')
      })

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument()
      })
    })
  })

  describe('Connection Flow - Error Recovery', () => {
    it('should handle connection failure and allow retry', async () => {
      const user = userEvent.setup()
      vi.mocked(services.clusterService.getClusters).mockResolvedValue([
        { name: 'Test', host: 'localhost', port: 389 }
      ])
      vi.mocked(services.passwordService.checkPasswordCache).mockResolvedValue({ cached: false })
      
      vi.mocked(services.connectionService.connect)
        .mockRejectedValueOnce({ response: { data: { detail: 'Invalid credentials' } } })
        .mockResolvedValueOnce(undefined)

      render(<BrowserRouter><Dashboard /></BrowserRouter>)

      await waitFor(() => screen.getByText('Test'))
      await user.click(screen.getByText('Setup Password'))

      const passwordInput = await screen.findByLabelText('Password')
      await user.type(passwordInput, 'wrong')
      await user.click(screen.getByText('Save Password'))

      await waitFor(() => {
        expect(screen.getAllByText('Invalid credentials').length).toBeGreaterThan(0)
      })

      await user.clear(passwordInput)
      await user.type(passwordInput, 'correct')
      await user.click(screen.getByText('Save Password'))

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument()
      })
    })
  })

  describe('Form Validation', () => {
    it('should require password before submit', async () => {
      const user = userEvent.setup()
      vi.mocked(services.clusterService.getClusters).mockResolvedValue([
        { name: 'Test', host: 'localhost', port: 389 }
      ])
      vi.mocked(services.passwordService.checkPasswordCache).mockResolvedValue({ cached: false })

      render(<BrowserRouter><Dashboard /></BrowserRouter>)

      await waitFor(() => screen.getByText('Test'))
      await user.click(screen.getByText('Setup Password'))
      await user.click(screen.getByText('Save Password'))

      await waitFor(() => {
        expect(screen.getAllByText('Password required').length).toBeGreaterThan(0)
      })
      expect(services.connectionService.connect).not.toHaveBeenCalled()
    })
  })
})
