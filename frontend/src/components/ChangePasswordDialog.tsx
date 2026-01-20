import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { clusterService, entryService } from '@/services'
import { passwordSchema, PasswordFormData } from '@/lib/validations'
import { LDAPEntry, PasswordPolicy } from '@/types'

interface ChangePasswordDialogProps {
  open: boolean
  onClose: () => void
  clusterName: string
  entry: LDAPEntry
  onSuccess: () => void
}

export default function ChangePasswordDialog({ open, onClose, clusterName, entry, onSuccess }: ChangePasswordDialogProps) {
  const [loading, setLoading] = useState(false)
  const [policy, setPolicy] = useState<PasswordPolicy>({ min_length: 8, require_confirmation: true })
  
  const { register, handleSubmit, formState: { errors }, reset } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema)
  })

  useEffect(() => {
    if (open) {
      loadPasswordPolicy()
    }
  }, [open])

  const loadPasswordPolicy = async () => {
    try {
      const policy = await clusterService.getPasswordPolicy(clusterName)
      setPolicy(policy)
    } catch (err) {
      console.error('Failed to load password policy', err)
    }
  }

  const onSubmit = async (data: PasswordFormData) => {
    setLoading(true)
    try {
      await entryService.updateEntry(clusterName, entry.dn, {
        userPassword: data.newPassword
      })
      onSuccess()
      onClose()
      reset()
    } catch (err: any) {
      console.error('Failed to change password', err)
    }
    setLoading(false)
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Change Password: {entry.uid}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="newPassword">New Password *</Label>
              <Input
                id="newPassword"
                type="password"
                {...register('newPassword')}
                placeholder="Enter new password"
                autoComplete="new-password"
              />
              {errors.newPassword && (
                <p className="text-xs text-destructive mt-1">{errors.newPassword.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <Input
                id="confirmPassword"
                type="password"
                {...register('confirmPassword')}
                placeholder="Re-enter new password"
                autoComplete="new-password"
              />
              {errors.confirmPassword && (
                <p className="text-xs text-destructive mt-1">{errors.confirmPassword.message}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Changing...' : 'Change Password'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
