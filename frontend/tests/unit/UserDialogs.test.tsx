import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import CreateUserDialog from '@/components/CreateUserDialog'
import EditUserDialog from '@/components/EditUserDialog'
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
    { name: 'uid', label: 'Username', type: 'text', required: true }
  ]
}

describe('CreateUserDialog', () => {
  it('should render in create mode', async () => {
    vi.mocked(services.clusterService.getClusterForm).mockResolvedValue(mockFormConfig)

    render(
      <CreateUserDialog
        open={true}
        onClose={vi.fn()}
        clusterName="test"
        baseDn="dc=example,dc=com"
        onSuccess={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Create New User')).toBeInTheDocument()
    })
  })

  it('should pass correct props to UserFormDialog', async () => {
    vi.mocked(services.clusterService.getClusterForm).mockResolvedValue(mockFormConfig)

    const onClose = vi.fn()
    const onSuccess = vi.fn()

    render(
      <CreateUserDialog
        open={true}
        onClose={onClose}
        clusterName="test-cluster"
        baseDn="dc=example,dc=com"
        onSuccess={onSuccess}
      />
    )

    await waitFor(() => {
      expect(services.clusterService.getClusterForm).toHaveBeenCalledWith('test-cluster')
    })
  })
})

describe('EditUserDialog', () => {
  const mockEntry = { uid: 'jdoe', cn: 'John Doe', dn: 'uid=jdoe,ou=users' }

  it('should render in edit mode', async () => {
    vi.mocked(services.clusterService.getClusterForm).mockResolvedValue(mockFormConfig)

    render(
      <EditUserDialog
        open={true}
        onClose={vi.fn()}
        clusterName="test"
        entry={mockEntry}
        onSuccess={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Edit User: jdoe')).toBeInTheDocument()
    })
  })

  it('should pass entry data to UserFormDialog', async () => {
    vi.mocked(services.clusterService.getClusterForm).mockResolvedValue(mockFormConfig)

    render(
      <EditUserDialog
        open={true}
        onClose={vi.fn()}
        clusterName="test"
        entry={mockEntry}
        onSuccess={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(services.clusterService.getClusterForm).toHaveBeenCalledWith('test')
    })
  })
})
