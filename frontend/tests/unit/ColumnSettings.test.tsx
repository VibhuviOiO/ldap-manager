import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ColumnSettings from '@/components/ColumnSettings'

const mockColumns = [
  { name: 'uid', label: 'Username', default_visible: true },
  { name: 'cn', label: 'Full Name', default_visible: true },
  { name: 'mail', label: 'Email', default_visible: true },
  { name: 'telephoneNumber', label: 'Phone', default_visible: false }
]

describe('ColumnSettings', () => {
  it('should render column settings button', () => {
    render(
      <ColumnSettings
        columns={mockColumns}
        visibleColumns={['uid', 'cn', 'mail']}
        onColumnsChange={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /columns/i })).toBeInTheDocument()
  })

  it('should open popover on button click', () => {
    render(
      <ColumnSettings
        columns={mockColumns}
        visibleColumns={['uid', 'cn', 'mail']}
        onColumnsChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /columns/i }))

    expect(screen.getByText('Username')).toBeInTheDocument()
    expect(screen.getByText('Full Name')).toBeInTheDocument()
  })

  it('should toggle column visibility', () => {
    const onColumnsChange = vi.fn()

    render(
      <ColumnSettings
        columns={mockColumns}
        visibleColumns={['uid', 'cn', 'mail']}
        onColumnsChange={onColumnsChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /columns/i }))

    const phoneCheckbox = screen.getByLabelText('Phone')
    fireEvent.click(phoneCheckbox)

    expect(onColumnsChange).toHaveBeenCalledWith(['uid', 'cn', 'mail', 'telephoneNumber'])
  })

  it('should show checked state for visible columns', () => {
    render(
      <ColumnSettings
        columns={mockColumns}
        visibleColumns={['uid', 'cn']}
        onColumnsChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /columns/i }))

    expect(screen.getByLabelText('Username')).toBeChecked()
    expect(screen.getByLabelText('Full Name')).toBeChecked()
    expect(screen.getByLabelText('Email')).not.toBeChecked()
  })
})
