import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ClusterDetails from '@/components/ClusterDetails'
import * as services from '@/services'

vi.mock('@/services')

const mockFormConfig = {
  base_ou: 'ou=users,dc=test',
  object_classes: ['inetOrgPerson'],
  fields: [
    { name: 'uid', label: 'Username', type: 'text', required: true },
    { name: 'cn', label: 'Full Name', type: 'text', required: true },
    { name: 'mail', label: 'Email', type: 'email', required: true }
  ]
}

describe('User Lifecycle - Create → Edit → Delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(services.clusterService.getClusters).mockResolvedValue([
      { name: 'test', base_dn: 'dc=test', readonly: false }
    ])
    vi.mocked(services.clusterService.getClusterHealth).mockResolvedValue({ status: 'healthy' })
    vi.mocked(services.clusterService.getClusterColumns).mockResolvedValue({
      users: [{ name: 'uid', label: 'Username', default_visible: true }]
    })
    vi.mocked(services.clusterService.getClusterForm).mockResolvedValue(mockFormConfig)
  })

  it('should complete full user lifecycle', async () => {
    const user = userEvent.setup()
    
    // Initial empty list
    vi.mocked(services.entryService.searchEntries).mockResolvedValueOnce({
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

    // Wait for load
    await waitFor(() => screen.getByLabelText(/create new user/i))

    // STEP 1: Create user
    const createButton = screen.getAllByRole('button', { name: /create new user/i })[0]
    await user.click(createButton)

    await waitFor(() => screen.getByText('Create New User'))

    await user.type(screen.getByLabelText('Username *'), 'jdoe')
    await user.type(screen.getByLabelText('Full Name *'), 'John Doe')
    await user.type(screen.getByLabelText('Email *'), 'jdoe@test.com')

    vi.mocked(services.entryService.createEntry).mockResolvedValue(undefined)
    vi.mocked(services.entryService.searchEntries).mockResolvedValueOnce({
      entries: [{ dn: 'uid=jdoe,ou=users', uid: 'jdoe', cn: 'John Doe', mail: 'jdoe@test.com' }],
      total: 1,
      has_more: false
    })

    const submitButtons = screen.getAllByRole('button', { name: /create user/i })
    await user.click(submitButtons[submitButtons.length - 1])

    await waitFor(() => {
      expect(services.entryService.createEntry).toHaveBeenCalledWith(
        'test',
        'uid=jdoe,ou=users,dc=test',
        expect.objectContaining({ uid: 'jdoe', cn: 'John Doe', mail: 'jdoe@test.com' })
      )
    })

    // STEP 2: Edit user
    await waitFor(() => screen.getByText('jdoe'))

    const editButtons = screen.getAllByRole('button', { name: /edit/i })
    await user.click(editButtons[0])

    await waitFor(() => screen.getByText('Edit User: jdoe'))

    const nameInput = screen.getByLabelText('Full Name *')
    await user.clear(nameInput)
    await user.type(nameInput, 'Jane Doe')

    vi.mocked(services.entryService.updateEntry).mockResolvedValue(undefined)
    vi.mocked(services.entryService.searchEntries).mockResolvedValueOnce({
      entries: [{ dn: 'uid=jdoe,ou=users', uid: 'jdoe', cn: 'Jane Doe', mail: 'jdoe@test.com' }],
      total: 1,
      has_more: false
    })

    await user.click(screen.getByText('Update User'))

    await waitFor(() => {
      expect(services.entryService.updateEntry).toHaveBeenCalledWith(
        'test',
        'uid=jdoe,ou=users',
        expect.objectContaining({ cn: 'Jane Doe' })
      )
    })

    // STEP 3: Delete user
    await waitFor(() => screen.getByText('Jane Doe'))

    window.confirm = vi.fn(() => true)
    vi.mocked(services.entryService.deleteEntry).mockResolvedValue(undefined)
    vi.mocked(services.entryService.searchEntries).mockResolvedValueOnce({
      entries: [],
      total: 0,
      has_more: false
    })

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
    await user.click(deleteButtons[0])

    await waitFor(() => {
      expect(services.entryService.deleteEntry).toHaveBeenCalledWith('test', 'uid=jdoe,ou=users')
    })

    await waitFor(() => {
      expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument()
    })
  })

  it('should handle create validation errors', async () => {
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

    await waitFor(() => screen.getAllByLabelText(/create new user/i)[0])
    const createButton = screen.getAllByRole('button', { name: /create new user/i })[0]
    await user.click(createButton)

    await waitFor(() => screen.getByText('Create New User'))

    // Try to submit without filling required fields
    const submitButtons = screen.getAllByRole('button', { name: /create user/i })
    await user.click(submitButtons[submitButtons.length - 1])

    // Form should not submit
    expect(services.entryService.createEntry).not.toHaveBeenCalled()
  })

  it('should handle create conflict error', async () => {
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

    await waitFor(() => screen.getAllByLabelText(/create new user/i)[0])
    const createButton = screen.getAllByRole('button', { name: /create new user/i })[0]
    await user.click(createButton)

    await waitFor(() => screen.getByText('Create New User'))

    await user.type(screen.getByLabelText('Username *'), 'existing')
    await user.type(screen.getByLabelText('Full Name *'), 'Existing User')
    await user.type(screen.getByLabelText('Email *'), 'existing@test.com')

    vi.mocked(services.entryService.createEntry).mockRejectedValue({
      response: { data: { detail: 'User already exists' } }
    })

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const submitButtons = screen.getAllByRole('button', { name: /create user/i })
    await user.click(submitButtons[submitButtons.length - 1])

    await waitFor(() => {
      expect(services.entryService.createEntry).toHaveBeenCalled()
    })

    consoleError.mockRestore()
  })

  it('should cancel delete on confirmation', async () => {
    const user = userEvent.setup()
    
    vi.mocked(services.entryService.searchEntries).mockResolvedValue({
      entries: [{ dn: 'uid=jdoe,ou=users', uid: 'jdoe', cn: 'John Doe' }],
      total: 1,
      has_more: false
    })

    render(
      <MemoryRouter initialEntries={['/cluster/test']}>
        <Routes>
          <Route path="/cluster/:clusterName" element={<ClusterDetails />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => screen.getByText('jdoe'))

    window.confirm = vi.fn(() => false)

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
    await user.click(deleteButtons[0])

    expect(services.entryService.deleteEntry).not.toHaveBeenCalled()
  })
})
