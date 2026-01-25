import { useState, useEffect, useMemo, lazy, Suspense, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Search, Users, FolderTree, Building2, Database as DatabaseIcon, Activity, BarChart3, Plus } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Input } from './ui/input'
import DirectoryTable from './DirectoryTable'
import CreateUserDialog from './CreateUserDialog'
import EditUserDialog from './EditUserDialog'
import ChangePasswordDialog from './ChangePasswordDialog'
import ManageGroupsDialog from './ManageGroupsDialog'
import ColumnSettings from './ColumnSettings'
import { clusterService, entryService } from '@/services'
import { DialogProvider, useDialogs } from '@/contexts/DialogContext'
import { toast, getErrorMessage } from '@/lib/toast'
import { TableColumns, Column } from '@/types'
import { useClusterInfo } from '@/hooks/useClusterInfo'

const MonitoringView = lazy(() => import('./MonitoringView'))
const ActivityLogView = lazy(() => import('./ActivityLogView'))

function ClusterDetailsInner() {
  const { clusterName } = useParams<{ clusterName: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeView = useMemo(() => {
    const view = searchParams.get('view')
    return (view as any) || 'users'
  }, [searchParams])
  const [entries, setEntries] = useState<any[]>([])
  const [monitoring, setMonitoring] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalEntries, setTotalEntries] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [tableColumns, setTableColumns] = useState<TableColumns>({})
  const [visibleColumns, setVisibleColumns] = useState<Record<string, string[]>>({})

  const { data: clusterConfig } = useClusterInfo(clusterName || '')
  const { openCreateDialog, openEditDialog, openPasswordDialog, openGroupsDialog, showCreateDialog, showEditDialog, showPasswordDialog, showGroupsDialog, editingEntry, passwordEntry, groupsEntry, closeCreateDialog, closeEditDialog, closePasswordDialog, closeGroupsDialog } = useDialogs()

  const handleViewChange = (view: 'users' | 'groups' | 'ous' | 'all' | 'monitoring' | 'activity') => {
    setSearchParams({ view })
    setPage(1)
  }

  useEffect(() => {
    loadTableColumns()
  }, [clusterName])

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      if (searchQuery) {
        setPage(1)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Only load health check when viewing monitoring tab
  useEffect(() => {
    if (activeView === 'monitoring') {
      loadMonitoring()
    }
  }, [clusterName, activeView])

  // Main data loading effect
  useEffect(() => {
    if (['users', 'groups', 'ous', 'all'].includes(activeView)) {
      loadClusterData()
    }
  }, [clusterName, activeView, page, pageSize, debouncedSearch])

  const loadTableColumns = async () => {
    try {
      const data = await clusterService.getClusterColumns(clusterName!)
      setTableColumns(data)
      
      const savedPrefs = localStorage.getItem(`ldap-columns-${clusterName}`)
      if (savedPrefs) {
        try {
          setVisibleColumns(JSON.parse(savedPrefs))
        } catch {
          console.error('Failed to parse saved preferences')
          const defaults: Record<string, string[]> = {}
          Object.keys(data).forEach(view => {
            defaults[view] = (data[view] || [])
              .filter((col: Column) => col.default_visible)
              .map((col: Column) => col.name)
          })
          setVisibleColumns(defaults)
        }
      } else {
        const defaults: Record<string, string[]> = {}
        Object.keys(data).forEach(view => {
          defaults[view] = (data[view] || [])
            .filter((col: Column) => col.default_visible)
            .map((col: Column) => col.name)
        })
        setVisibleColumns(defaults)
        setTimeout(() => {
          try {
            localStorage.setItem(`ldap-columns-${clusterName}`, JSON.stringify(defaults))
          } catch (err) {
            console.error('Failed to save to localStorage', err)
          }
        }, 100)
      }
    } catch (err) {
      console.error('Failed to load table columns', err)
    }
  }

  const handleColumnsChange = (view: string, columns: string[]) => {
    const updated = { ...visibleColumns, [view]: columns }
    setVisibleColumns(updated)
    setTimeout(() => {
      try {
        localStorage.setItem(`ldap-columns-${clusterName}`, JSON.stringify(updated))
      } catch (err) {
        console.error('Failed to save to localStorage', err)
      }
    }, 100)
  }

  const loadClusterData = async () => {
    setLoading(true)
    try {
      const filterType = activeView === 'all' ? '' : activeView
      const result = await entryService.searchEntries({
        cluster: clusterName!,
        page,
        page_size: Math.min(pageSize, 100), // Limit to 100 entries max
        filter_type: filterType,
        search: debouncedSearch || undefined
      })
      
      setEntries(result.entries || [])
      setTotalEntries(result.total || 0)
      setHasMore(result.has_more || false)
    } catch (err: any) {
      console.error('Failed to load cluster data', err)
      const errorMsg = err.response?.data?.detail || 'Failed to load data'
      if (errorMsg.includes("Can't contact LDAP server")) {
        setMonitoring({ 
          status: 'error', 
          message: 'Cannot connect to LDAP server. Please verify the server is running and accessible.' 
        })
      }
    }
    setLoading(false)
  }

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value)
  }, [])

  const loadMonitoring = async () => {
    try {
      const data = await clusterService.getClusterHealth(clusterName!)
      setMonitoring(data)
    } catch (err) {
      console.error('Failed to load monitoring data', err)
      setMonitoring({ status: 'error', message: 'Failed to check cluster health' })
    }
  }

  const handleDelete = async (dn: string) => {
    if (!confirm(`Delete user ${dn}?`)) return
    
    // Optimistic update - remove from UI immediately
    const previousEntries = entries
    setEntries(entries.filter(e => e.dn !== dn))
    
    try {
      await entryService.deleteEntry(clusterName!, dn)
      toast.success('User deleted successfully')
      loadClusterData() // Refresh to get accurate count
    } catch (err: any) {
      // Rollback on error
      setEntries(previousEntries)
      const errorMsg = getErrorMessage(err)
      toast.error(`Failed to delete user: ${errorMsg}`)
    }
  }

  const isDirectoryView = useMemo(() => ['users', 'groups', 'ous', 'all'].includes(activeView), [activeView])
  const getNavClass = (view: string) => {
    return `flex items-center space-x-2 px-6 py-3.5 text-sm font-medium border-b-2 transition-all duration-200 whitespace-nowrap ${
      activeView === view 
        ? 'border-primary text-primary bg-primary/5' 
        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50'
    }`
  }

  return (
    <div className="space-y-0">
      <nav className="bg-card border-b sticky top-[73px] z-40" aria-label="Cluster navigation">
        <div className="container mx-auto px-6">
          <div className="flex overflow-x-auto scrollbar-hide" role="tablist">
            <button onClick={() => handleViewChange('users')} className={getNavClass('users')} role="tab" aria-selected={activeView === 'users'}>
              <Users className="h-4 w-4" aria-hidden="true" />
              <span>Users</span>
            </button>
            <button onClick={() => handleViewChange('groups')} className={getNavClass('groups')} role="tab" aria-selected={activeView === 'groups'}>
              <FolderTree className="h-4 w-4" aria-hidden="true" />
              <span>Groups</span>
            </button>
            <button onClick={() => handleViewChange('ous')} className={getNavClass('ous')} role="tab" aria-selected={activeView === 'ous'}>
              <Building2 className="h-4 w-4" aria-hidden="true" />
              <span>Organizational Units</span>
            </button>
            <button onClick={() => handleViewChange('all')} className={getNavClass('all')} role="tab" aria-selected={activeView === 'all'}>
              <DatabaseIcon className="h-4 w-4" aria-hidden="true" />
              <span>All Entries</span>
            </button>
            <button onClick={() => handleViewChange('monitoring')} className={getNavClass('monitoring')} role="tab" aria-selected={activeView === 'monitoring'}>
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              <span>Monitoring</span>
            </button>
            <button onClick={() => handleViewChange('activity')} className={getNavClass('activity')} role="tab" aria-selected={activeView === 'activity'}>
              <Activity className="h-4 w-4" aria-hidden="true" />
              <span>Activity Log</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-6 py-6 space-y-6">

      {monitoring && monitoring.status !== 'healthy' && (
        <Card className="border-l-4 border-l-destructive shadow-sm" role="alert">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <div className="text-destructive mt-0.5" aria-hidden="true">⚠</div>
              <div>
                <p className="font-medium text-sm">{monitoring.status === 'error' ? 'Connection Error' : 'Configuration Required'}</p>
                <p className="text-sm text-muted-foreground mt-1">{monitoring.message}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isDirectoryView ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">
              {activeView === 'users' && 'Users'}
              {activeView === 'groups' && 'Groups'}
              {activeView === 'ous' && 'Organizational Units'}
              {activeView === 'all' && 'All Directory Entries'}
            </h2>
            <div className="flex items-center space-x-3">
              {!clusterConfig?.readonly && activeView === 'users' && (
                <Button onClick={openCreateDialog} size="sm" aria-label="Create new user">
                  <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                  Create User
                </Button>
              )}
              {tableColumns[activeView] && (
                <ColumnSettings
                  columns={tableColumns[activeView]}
                  visibleColumns={visibleColumns[activeView] || []}
                  onColumnsChange={(cols) => handleColumnsChange(activeView, cols)}
                />
              )}
              <div className="relative w-80">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-10"
                  aria-label="Search directory entries"
                />
              </div>
            </div>
          </div>
          <DirectoryTable
            entries={entries}
            directoryView={activeView as 'users' | 'groups' | 'ous' | 'all'}
            loading={loading}
            page={page}
            pageSize={pageSize}
            totalEntries={totalEntries}
            hasMore={hasMore}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
            columns={tableColumns[activeView]}
            visibleColumns={visibleColumns[activeView]}
            onDelete={handleDelete}
            onEdit={openEditDialog}
            onChangePassword={openPasswordDialog}
            onManageGroups={openGroupsDialog}
            readonly={clusterConfig?.readonly}
          />
        </div>
      ) : activeView === 'monitoring' ? (
        <Suspense fallback={<div>Loading monitoring...</div>}>
          <MonitoringView clusterName={clusterName || ''} />
        </Suspense>
      ) : (
        <Suspense fallback={<div>Loading activity log...</div>}>
          <ActivityLogView />
        </Suspense>
      )}

      {showCreateDialog && (
        <CreateUserDialog
          open={showCreateDialog}
          onClose={closeCreateDialog}
          clusterName={clusterName || ''}
          baseDn={clusterConfig?.base_dn || ''}
          onSuccess={() => loadClusterData()}
        />
      )}

      {showEditDialog && editingEntry && (
        <EditUserDialog
          open={showEditDialog}
          onClose={closeEditDialog}
          clusterName={clusterName || ''}
          entry={editingEntry}
          onSuccess={() => loadClusterData()}
        />
      )}

      {showPasswordDialog && passwordEntry && (
        <ChangePasswordDialog
          open={showPasswordDialog}
          onClose={closePasswordDialog}
          clusterName={clusterName || ''}
          entry={passwordEntry}
          onSuccess={() => loadClusterData()}
        />
      )}

      {showGroupsDialog && groupsEntry && (
        <ManageGroupsDialog
          open={showGroupsDialog}
          onClose={closeGroupsDialog}
          clusterName={clusterName || ''}
          entry={groupsEntry}
          onSuccess={() => loadClusterData()}
        />
      )}
      </div>
    </div>
  )
}

export default function ClusterDetails() {
  return (
    <DialogProvider>
      <ClusterDetailsInner />
    </DialogProvider>
  )
}
