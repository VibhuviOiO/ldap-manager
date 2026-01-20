import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ChangePasswordDialog from '@/components/ChangePasswordDialog'
import * as services from '@/services'

vi.mock('@/services', () => ({
  clusterService: {
    getPasswordPolicy: vi.fn()
  },
  entryService: {
    updateEntry: vi.fn()
  }
}))

describe('ChangePasswordDialog', () => {
  const mockEntry = { uid: 'jdoe', dn: 'uid=jdoe,ou=users' }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(services.clusterService.getPasswordPolicy).mockResolvedValue({
      min_length: 8,
      require_uppercase: true,
      require_lowercase: true,
      require_digit: true,
      require_special: true
    })
  })

  it('should render dialog', async () => {
    render(
      <ChangePasswordDialog
        open={true}
        onClose={vi.fn()}
        clusterName="test"
        entry={mockEntry}
        onSuccess={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Change Password: jdoe')).toBeInTheDocument()
    })
  })

  it('should validate password requirements', async () => {
    render(
      <ChangePasswordDialog
        open={true}
        onClose={vi.fn()}
        clusterName="test"
        entry={mockEntry}
        onSuccess={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByLabelText('New Password *')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('New Password *'), { target: { value: 'weak' } })
    fireEvent.change(screen.getByLabelText('Confirm Password *'), { target: { value: 'weak' } })
    fireEvent.click(screen.getByText('Change Password'))

    await waitFor(() => {
      expect(screen.getByText(/Password must be at least 8 characters/i)).toBeInTheDocument()
    })
  })

  it('should submit valid password', async () => {
    vi.mocked(services.entryService.updateEntry).mockResolvedValue(undefined)
    const onSuccess = vi.fn()
    const onClose = vi.fn()

    render(
      <ChangePasswordDialog
        open={true}
        onClose={onClose}
        clusterName="test"
        entry={mockEntry}
        onSuccess={onSuccess}
      />
    )

    await waitFor(() => {
      expect(screen.getByLabelText('New Password *')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('New Password *'), { target: { value: 'Password123!' } })
    fireEvent.change(screen.getByLabelText('Confirm Password *'), { target: { value: 'Password123!' } })
    fireEvent.click(screen.getByText('Change Password'))

    await waitFor(() => {
      expect(services.entryService.updateEntry).toHaveBeenCalledWith('test', mockEntry.dn, {
        userPassword: 'Password123!'
      })
      expect(onSuccess).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('should display error on failure', async () => {
    vi.mocked(services.entryService.updateEntry).mockRejectedValue({
      response: { data: { detail: 'Password change failed' } }
    })

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ChangePasswordDialog
        open={true}
        onClose={vi.fn()}
        clusterName="test"
        entry={mockEntry}
        onSuccess={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByLabelText('New Password *')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('New Password *'), { target: { value: 'Password123!' } })
    fireEvent.change(screen.getByLabelText('Confirm Password *'), { target: { value: 'Password123!' } })
    fireEvent.click(screen.getByText('Change Password'))

    await waitFor(() => {
      expect(services.entryService.updateEntry).toHaveBeenCalled()
    })

    consoleError.mockRestore()
  })
})
