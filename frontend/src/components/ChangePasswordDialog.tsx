import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import axios from 'axios'
import { useEffect } from 'react'

interface PasswordPolicy {
  min_length: number
  require_confirmation: boolean
}

interface ChangePasswordDialogProps {
  open: boolean
  onClose: () => void
  clusterName: string
  entry: any
  onSuccess: () => void
}

export default function ChangePasswordDialog({ open, onClose, clusterName, entry, onSuccess }: ChangePasswordDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [policy, setPolicy] = useState<PasswordPolicy>({ min_length: 0, require_confirmation: true })

  useEffect(() => {
    if (open) {
      loadPasswordPolicy()
    }
  }, [open])

  const loadPasswordPolicy = async () => {
    try {
      const res = await axios.get(`/api/clusters/password-policy/${clusterName}`)
      setPolicy(res.data)
    } catch (err) {
      console.error('Failed to load password policy', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Validation
    if (policy.min_length > 0 && newPassword.length < policy.min_length) {
      setError(`Password must be at least ${policy.min_length} characters long`)
      setLoading(false)
      return
    }

    if (policy.require_confirmation && newPassword !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    try {
      await axios.put('/api/entries/update', {
        cluster_name: clusterName,
        dn: entry.dn,
        modifications: {
          userPassword: newPassword
        }
      })

      onSuccess()
      onClose()
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to change password')
    }
    setLoading(false)
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Change Password: {entry.uid}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="newPassword">New Password *</Label>
              <Input
                id="newPassword"
                type="password"
                required
                minLength={policy.min_length || undefined}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                autoComplete="new-password"
              />
              {policy.min_length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Minimum {policy.min_length} characters</p>
              )}
            </div>

            {policy.require_confirmation && (
              <div>
                <Label htmlFor="confirmPassword">Confirm Password *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={policy.min_length || undefined}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                />
              </div>
            )}
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded">
              {error}
            </div>
          )}

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
