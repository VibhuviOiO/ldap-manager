import UserFormDialog from './UserFormDialog'
import { LDAPEntry } from '@/types'

interface EditUserDialogProps {
  open: boolean
  onClose: () => void
  clusterName: string
  entry: LDAPEntry
  onSuccess: () => void
}

export default function EditUserDialog({ open, onClose, clusterName, entry, onSuccess }: EditUserDialogProps) {
  return (
    <UserFormDialog
      open={open}
      onClose={onClose}
      clusterName={clusterName}
      entry={entry}
      mode="edit"
      onSuccess={onSuccess}
    />
  )
}
