import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DialogProvider, useDialogs } from '@/contexts/DialogContext'

const TestComponent = () => {
  const { 
    showCreateDialog, 
    showEditDialog, 
    showPasswordDialog,
    openCreateDialog, 
    openEditDialog, 
    openPasswordDialog,
    closeCreateDialog,
    closeEditDialog,
    closePasswordDialog,
    editingEntry,
    passwordEntry
  } = useDialogs()

  return (
    <div>
      <div data-testid="create-status">{showCreateDialog ? 'open' : 'closed'}</div>
      <div data-testid="edit-status">{showEditDialog ? 'open' : 'closed'}</div>
      <div data-testid="password-status">{showPasswordDialog ? 'open' : 'closed'}</div>
      <div data-testid="editing-entry">{editingEntry?.uid || 'none'}</div>
      <div data-testid="password-entry">{passwordEntry?.uid || 'none'}</div>
      <button onClick={openCreateDialog}>Open Create</button>
      <button onClick={closeCreateDialog}>Close Create</button>
      <button onClick={() => openEditDialog({ uid: 'testuser', dn: 'uid=testuser' } as any)}>Open Edit</button>
      <button onClick={closeEditDialog}>Close Edit</button>
      <button onClick={() => openPasswordDialog({ uid: 'passuser', dn: 'uid=passuser' } as any)}>Open Password</button>
      <button onClick={closePasswordDialog}>Close Password</button>
    </div>
  )
}

describe('DialogContext', () => {
  it('should provide initial state', () => {
    render(
      <DialogProvider>
        <TestComponent />
      </DialogProvider>
    )

    expect(screen.getByTestId('create-status')).toHaveTextContent('closed')
    expect(screen.getByTestId('edit-status')).toHaveTextContent('closed')
    expect(screen.getByTestId('password-status')).toHaveTextContent('closed')
  })

  it('should open and close create dialog', () => {
    render(
      <DialogProvider>
        <TestComponent />
      </DialogProvider>
    )

    fireEvent.click(screen.getByText('Open Create'))
    expect(screen.getByTestId('create-status')).toHaveTextContent('open')

    fireEvent.click(screen.getByText('Close Create'))
    expect(screen.getByTestId('create-status')).toHaveTextContent('closed')
  })

  it('should open edit dialog with entry', () => {
    render(
      <DialogProvider>
        <TestComponent />
      </DialogProvider>
    )

    fireEvent.click(screen.getByText('Open Edit'))
    expect(screen.getByTestId('edit-status')).toHaveTextContent('open')
    expect(screen.getByTestId('editing-entry')).toHaveTextContent('testuser')

    fireEvent.click(screen.getByText('Close Edit'))
    expect(screen.getByTestId('edit-status')).toHaveTextContent('closed')
    expect(screen.getByTestId('editing-entry')).toHaveTextContent('none')
  })

  it('should open password dialog with entry', () => {
    render(
      <DialogProvider>
        <TestComponent />
      </DialogProvider>
    )

    fireEvent.click(screen.getByText('Open Password'))
    expect(screen.getByTestId('password-status')).toHaveTextContent('open')
    expect(screen.getByTestId('password-entry')).toHaveTextContent('passuser')

    fireEvent.click(screen.getByText('Close Password'))
    expect(screen.getByTestId('password-status')).toHaveTextContent('closed')
    expect(screen.getByTestId('password-entry')).toHaveTextContent('none')
  })

  it('should throw error when used outside provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    expect(() => render(<TestComponent />)).toThrow('useDialogs must be used within DialogProvider')
    
    consoleError.mockRestore()
  })
})
