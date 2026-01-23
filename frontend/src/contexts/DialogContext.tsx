import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { LDAPEntry } from '@/types'

interface DialogState {
  showCreateDialog: boolean
  showEditDialog: boolean
  showPasswordDialog: boolean
  showGroupsDialog: boolean
  editingEntry: LDAPEntry | null
  passwordEntry: LDAPEntry | null
  groupsEntry: LDAPEntry | null
}

interface DialogContextValue extends DialogState {
  openCreateDialog: () => void
  closeCreateDialog: () => void
  openEditDialog: (entry: LDAPEntry) => void
  closeEditDialog: () => void
  openPasswordDialog: (entry: LDAPEntry) => void
  closePasswordDialog: () => void
  openGroupsDialog: (entry: LDAPEntry) => void
  closeGroupsDialog: () => void
}

const DialogContext = createContext<DialogContextValue | undefined>(undefined)

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>({
    showCreateDialog: false,
    showEditDialog: false,
    showPasswordDialog: false,
    showGroupsDialog: false,
    editingEntry: null,
    passwordEntry: null,
    groupsEntry: null,
  })

  const openCreateDialog = useCallback(() => {
    setState(s => ({ ...s, showCreateDialog: true }))
  }, [])

  const closeCreateDialog = useCallback(() => {
    setState(s => ({ ...s, showCreateDialog: false }))
  }, [])

  const openEditDialog = useCallback((entry: LDAPEntry) => {
    setState(s => ({ ...s, showEditDialog: true, editingEntry: entry }))
  }, [])

  const closeEditDialog = useCallback(() => {
    setState(s => ({ ...s, showEditDialog: false, editingEntry: null }))
  }, [])

  const openPasswordDialog = useCallback((entry: LDAPEntry) => {
    setState(s => ({ ...s, showPasswordDialog: true, passwordEntry: entry }))
  }, [])

  const closePasswordDialog = useCallback(() => {
    setState(s => ({ ...s, showPasswordDialog: false, passwordEntry: null }))
  }, [])

  const openGroupsDialog = useCallback((entry: LDAPEntry) => {
    setState(s => ({ ...s, showGroupsDialog: true, groupsEntry: entry }))
  }, [])

  const closeGroupsDialog = useCallback(() => {
    setState(s => ({ ...s, showGroupsDialog: false, groupsEntry: null }))
  }, [])

  return (
    <DialogContext.Provider value={{ ...state, openCreateDialog, closeCreateDialog, openEditDialog, closeEditDialog, openPasswordDialog, closePasswordDialog, openGroupsDialog, closeGroupsDialog }}>
      {children}
    </DialogContext.Provider>
  )
}

export function useDialogs() {
  const context = useContext(DialogContext)
  if (!context) throw new Error('useDialogs must be used within DialogProvider')
  return context
}
