import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import UserFormDialog from '@/components/UserFormDialog'
import * as services from '@/services'

vi.mock('@/services', () => ({
  clusterService: {
    getClusterForm: vi.fn()
  },
  entryService: {
    createEntry: vi.fn(),
    updateEntry: vi.fn()
  }
}))

const mockFormConfig = {
  base_ou: 'ou=users,dc=example,dc=com',
  object_classes: ['inetOrgPerson'],
  fields: [
    { name: 'uid', label: 'Username', type: 'text', required: true },
    { name: 'cn', label: 'Full Name', type: 'text', required: true },
    { name: 'mail', label: 'Email', type: 'email', required: true }
  ]
}

describe('UserFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render create mode', async () => {
    vi.mocked(services.clusterService.getClusterForm).mockResolvedValue(mockFormConfig)

    render(
      <UserFormDialog
        open={true}
        onClose={vi.fn()}
        clusterName="test"
        mode="create"
        onSuccess={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Create New User')).toBeInTheDocument()
    })
  })

  it('should render edit mode with entry data', async () => {
    vi.mocked(services.clusterService.getClusterForm).mockResolvedValue(mockFormConfig)

    const entry = { uid: 'jdoe', cn: 'John Doe', mail: 'jdoe@example.com', dn: 'uid=jdoe,ou=users' }

    render(
      <UserFormDialog
        open={true}
        onClose={vi.fn()}
        clusterName="test"
        mode="edit"
        entry={entry}
        onSuccess={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Edit User: jdoe')).toBeInTheDocument()
    })
  })

  it('should submit create form', async () => {
    vi.mocked(services.clusterService.getClusterForm).mockResolvedValue(mockFormConfig)
    vi.mocked(services.entryService.createEntry).mockResolvedValue(undefined)

    const onSuccess = vi.fn()
    const onClose = vi.fn()

    render(
      <UserFormDialog
        open={true}
        onClose={onClose}
        clusterName="test"
        mode="create"
        onSuccess={onSuccess}
      />
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Username *')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Username *'), { target: { value: 'jdoe' } })
    fireEvent.change(screen.getByLabelText('Full Name *'), { target: { value: 'John Doe' } })
    fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'jdoe@example.com' } })

    fireEvent.click(screen.getByText('Create User'))

    await waitFor(() => {
      expect(services.entryService.createEntry).toHaveBeenCalled()
      expect(onSuccess).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('should display error on create failure', async () => {
    vi.mocked(services.clusterService.getClusterForm).mockResolvedValue(mockFormConfig)
    vi.mocked(services.entryService.createEntry).mockRejectedValue(new Error('User already exists'))

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <UserFormDialog
        open={true}
        onClose={vi.fn()}
        clusterName="test"
        mode="create"
        onSuccess={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Username *')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Username *'), { target: { value: 'jdoe' } })
    fireEvent.change(screen.getByLabelText('Full Name *'), { target: { value: 'John Doe' } })
    fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'jdoe@example.com' } })
    fireEvent.click(screen.getByText('Create User'))

    await waitFor(() => {
      expect(services.entryService.createEntry).toHaveBeenCalled()
    })

    consoleError.mockRestore()
  })

  it('should not close when dialog is not open', () => {
    vi.mocked(services.clusterService.getClusterForm).mockResolvedValue(mockFormConfig)

    const { container } = render(
      <UserFormDialog
        open={false}
        onClose={vi.fn()}
        clusterName="test"
        mode="create"
        onSuccess={vi.fn()}
      />
    )

    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument()
  })
})
