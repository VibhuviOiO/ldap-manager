import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DirectoryTable from '@/components/DirectoryTable'

const mockEntries = [
  { dn: 'uid=jdoe,ou=users', uid: 'jdoe', cn: 'John Doe', mail: 'jdoe@example.com' },
  { dn: 'uid=jane,ou=users', uid: 'jane', cn: 'Jane Smith', mail: 'jane@example.com' }
]

const mockColumns = [
  { name: 'uid', label: 'Username', default_visible: true },
  { name: 'cn', label: 'Full Name', default_visible: true },
  { name: 'mail', label: 'Email', default_visible: true }
]

describe('DirectoryTable', () => {
  it('should render entries', () => {
    render(
      <DirectoryTable
        entries={mockEntries}
        directoryView="users"
        loading={false}
        page={1}
        pageSize={10}
        totalEntries={2}
        hasMore={false}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        columns={mockColumns}
        visibleColumns={['uid', 'cn', 'mail']}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onChangePassword={vi.fn()}
        readonly={false}
      />
    )

    expect(screen.getByText('jdoe')).toBeInTheDocument()
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('jane')).toBeInTheDocument()
  })

  it('should show loading state', () => {
    const { container } = render(
      <DirectoryTable
        entries={[]}
        directoryView="users"
        loading={true}
        page={1}
        pageSize={10}
        totalEntries={0}
        hasMore={false}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        columns={mockColumns}
        visibleColumns={['uid', 'cn', 'mail']}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onChangePassword={vi.fn()}
        readonly={false}
      />
    )

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('should call onEdit when edit button clicked', () => {
    const onEdit = vi.fn()

    render(
      <DirectoryTable
        entries={mockEntries}
        directoryView="users"
        loading={false}
        page={1}
        pageSize={10}
        totalEntries={2}
        hasMore={false}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        columns={mockColumns}
        visibleColumns={['uid', 'cn', 'mail']}
        onDelete={vi.fn()}
        onEdit={onEdit}
        onChangePassword={vi.fn()}
        readonly={false}
      />
    )

    const editButtons = screen.getAllByRole('button', { name: /edit/i })
    fireEvent.click(editButtons[0])

    expect(onEdit).toHaveBeenCalledWith(mockEntries[0])
  })

  it('should call onDelete when delete button clicked', () => {
    const onDelete = vi.fn()
    window.confirm = vi.fn(() => true)

    render(
      <DirectoryTable
        entries={mockEntries}
        directoryView="users"
        loading={false}
        page={1}
        pageSize={10}
        totalEntries={2}
        hasMore={false}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        columns={mockColumns}
        visibleColumns={['uid', 'cn', 'mail']}
        onDelete={onDelete}
        onEdit={vi.fn()}
        onChangePassword={vi.fn()}
        readonly={false}
      />
    )

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
    fireEvent.click(deleteButtons[0])

    expect(onDelete).toHaveBeenCalledWith(mockEntries[0].dn)
  })

  it('should hide action buttons in readonly mode', () => {
    render(
      <DirectoryTable
        entries={mockEntries}
        directoryView="users"
        loading={false}
        page={1}
        pageSize={10}
        totalEntries={2}
        hasMore={false}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        columns={mockColumns}
        visibleColumns={['uid', 'cn', 'mail']}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onChangePassword={vi.fn()}
        readonly={true}
      />
    )

    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('should handle pagination', () => {
    const onPageChange = vi.fn()

    render(
      <DirectoryTable
        entries={mockEntries}
        directoryView="users"
        loading={false}
        page={1}
        pageSize={10}
        totalEntries={20}
        hasMore={true}
        onPageChange={onPageChange}
        onPageSizeChange={vi.fn()}
        columns={mockColumns}
        visibleColumns={['uid', 'cn', 'mail']}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onChangePassword={vi.fn()}
        readonly={false}
      />
    )

    const nextButton = screen.getByRole('button', { name: /next/i })
    fireEvent.click(nextButton)

    expect(onPageChange).toHaveBeenCalledWith(2)
  })
})
