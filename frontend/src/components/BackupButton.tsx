/**
 * LDAP Backup Button Component
 *
 * Provides slapcat-style LDIF export functionality.
 * Shows only when user has backup permissions:
 * - Keycloak mode: Admin role required
 * - Read-write mode: Available to all users
 * - Read-only mode: Hidden (not available)
 */

import { useState, useEffect } from 'react'
import { Download } from 'lucide-react'
import { Button } from './ui/button'
import { backupService } from '@/services/api/BackupService'
import { toast, getErrorMessage } from '@/lib/toast'
import { useAppStore } from '@/store/appStore'

interface BackupButtonProps {
  cluster: string
  className?: string
}

export default function BackupButton({ cluster, className }: BackupButtonProps) {
  const [loading, setLoading] = useState(false)
  const [available, setAvailable] = useState(false)
  const [checking, setChecking] = useState(true)
  const { user } = useAppStore()

  useEffect(() => {
    checkBackupAvailability()
  }, [cluster, user])

  const checkBackupAvailability = async () => {
    try {
      setChecking(true)
      const status = await backupService.checkStatus(cluster)
      setAvailable(status.backup_available)
    } catch (error) {
      console.error('Failed to check backup availability:', error)
      setAvailable(false)
    } finally {
      setChecking(false)
    }
  }

  const handleBackup = async () => {
    if (!available) return

    try {
      setLoading(true)

      toast.info(`Exporting LDAP backup for ${cluster}...`, {
        description: 'This may take a few moments for large directories.'
      })

      await backupService.downloadBackup(cluster)

      toast.success('Backup exported successfully', {
        description: `LDIF backup for ${cluster} has been downloaded.`
      })
    } catch (error) {
      console.error('Backup failed:', error)
      toast.error('Backup failed', {
        description: getErrorMessage(error)
      })
    } finally {
      setLoading(false)
    }
  }

  // Don't render if checking or not available
  if (checking || !available) {
    return null
  }

  return (
    <Button
      onClick={handleBackup}
      disabled={loading}
      size="sm"
      variant="outline"
      className={className}
      aria-label="Export LDAP backup"
      title="Export directory as LDIF backup (slapcat-style)"
    >
      <Download className="h-4 w-4 mr-1" aria-hidden="true" />
      {loading ? 'Exporting...' : 'Backup'}
    </Button>
  )
}
