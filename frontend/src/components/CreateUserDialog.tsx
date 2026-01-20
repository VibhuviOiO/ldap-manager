import UserFormDialog from './UserFormDialog'

interface CreateUserDialogProps {
  open: boolean
  onClose: () => void
  clusterName: string
  baseDn: string
  onSuccess: () => void
}

export default function CreateUserDialog({ open, onClose, clusterName, baseDn, onSuccess }: CreateUserDialogProps) {
  return (
    <UserFormDialog
      open={open}
      onClose={onClose}
      clusterName={clusterName}
      baseDn={baseDn}
      mode="create"
      onSuccess={onSuccess}
    />
  )
}
