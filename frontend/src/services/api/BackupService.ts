/**
 * LDAP Backup Service
 *
 * Provides slapcat-style LDIF export functionality for LDAP backup.
 */

import { AxiosHttpClient } from '../http/AxiosHttpClient'

export interface BackupStatus {
  cluster: string
  backup_available: boolean
  base_dn: string
  reason: string
  ldap_configured: boolean
}

export class BackupService {
  private client: AxiosHttpClient

  constructor(baseURL?: string) {
    this.client = new AxiosHttpClient(baseURL)
  }

  /**
   * Check if backup is available for a cluster.
   *
   * @param cluster - Cluster name
   * @returns Backup availability status
   */
  async checkStatus(cluster: string): Promise<BackupStatus> {
    const response = await this.client.get<BackupStatus>(`/backup/status/${cluster}`)
    return response.data
  }

  /**
   * Export LDAP directory to LDIF format (slapcat-style backup).
   *
   * Downloads entire directory tree as LDIF file.
   * Access control:
   * - Keycloak mode: Admin role required
   * - Read-write mode: Available to all users
   * - Read-only mode: Not available
   *
   * @param cluster - Cluster name
   * @returns Blob (LDIF file content)
   *
   * @example
   * const blob = await backupService.exportLdif('vibhuvioio.com')
   * const url = window.URL.createObjectURL(blob)
   * const a = document.createElement('a')
   * a.href = url
   * a.download = 'backup.ldif'
   * a.click()
   */
  async exportLdif(cluster: string): Promise<Blob> {
    const response = await this.client.request<Blob>({
      method: 'GET',
      url: `/backup/export/${cluster}`,
      responseType: 'blob', // Important: get response as Blob
    })

    return response.data
  }

  /**
   * Export and download LDIF file automatically.
   *
   * Convenience method that handles download trigger.
   *
   * @param cluster - Cluster name
   * @param filename - Optional custom filename (defaults to {cluster}-{timestamp}.ldif)
   */
  async downloadBackup(cluster: string, filename?: string): Promise<void> {
    try {
      // Get LDIF blob
      const blob = await this.exportLdif(cluster)

      // Generate filename if not provided
      if (!filename) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
        filename = `${cluster}-${timestamp}.ldif`
      }

      // Create download link
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      a.download = filename

      // Trigger download
      document.body.appendChild(a)
      a.click()

      // Cleanup
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      console.log(`✅ Backup downloaded: ${filename}`)
    } catch (error) {
      console.error('❌ Backup download failed:', error)
      throw error
    }
  }
}

// Export singleton instance
export const backupService = new BackupService()
