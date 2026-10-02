import { useConfirm } from './ui/confirm-dialog'
import { useState, useEffect, useMemo, lazy, Suspense, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Search, Users, FolderTree, Building2, Database as DatabaseIcon, Activity, BarChart3, Plus, Boxes, Download, Trash2, FileCode2, Layers, ShieldCheck } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Input } from './ui/input'
import DirectoryTable from './DirectoryTable'
import DirectoryTree from './DirectoryTree'
import LdifEditor from './LdifEditor'
import { buildUserLdifTemplate, LDIF_DRAFT_KEY } from '@/lib/ldifTemplate'
import SchemaView from './SchemaView'
import AciView from './AciView'
import CreateUserDialog from './CreateUserDialog'
import EditUserDialog from './EditUserDialog'
import ChangePasswordDialog from './ChangePasswordDialog'
import ManageGroupsDialog from './ManageGroupsDialog'
import ColumnSettings from './ColumnSettings'
import { clusterService, entryService } from '@/services'
import { DialogProvider, useDialogs } from '@/contexts/DialogContext'
import { toast, getErrorMessage } from '@/lib/toast'
import { TableColumns, Column, GroupInfo } from '@/types'
import { useClusterInfo } from '@/hooks/useClusterInfo'
import { useAuthStatus } from '@/hooks/useAuth'

const MonitoringView = lazy(() => import('./MonitoringView'))
const ActivityLogView = lazy(() => import('./ActivityLogView'))

const CONTEXT_PATH = import.meta.env.VITE_CONTEXT_PATH || ''

function ClusterDetailsInner() {
  const { clusterName } = useParams<{ clusterName: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeView = useMemo(() => {
    const view = searchParams.get('view')
    return (view as any) || 'users'
  }, [searchParams])
  const confirm = useConfirm()
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
  const { data: authStatus } = useAuthStatus()

  // Write access = the role permits it AND the cluster is not flagged read-only.
  // The server enforces the same rule independently; this only shapes the UI.
  const role = authStatus?.role
  const canWrite = (role === 'admin' || role === 'readwrite') && !clusterConfig?.readonly
  const isAdmin = role === 'admin'

  // Bulk selection and the three bulk actions.
  const [selectedDns, setSelectedDns] = useState<Set<string>>(new Set())
  const [bulkAttr, setBulkAttr] = useState('')
  const [bulkValue, setBulkValue] = useState('')
  const [bulkGroup, setBulkGroup] = useState('')
  const [groups, setGroups] = useState<GroupInfo[]>([])

  const toggleSelect = (dn: string) => {
    setSelectedDns((prev) => {
      const next = new Set(prev)
      if (next.has(dn)) next.delete(dn)
      else next.add(dn)
      return next
    })
  }

  const selectAllPage = () => {
    setSelectedDns((prev) => {
      const allSelected = entries.length > 0 && entries.every((e) => prev.has(e.dn))
      const next = new Set(prev)
      if (allSelected) entries.forEach((e) => next.delete(e.dn))
      else entries.forEach((e) => next.add(e.dn))
      return next
    })
  }

  const clearSelection = () => setSelectedDns(new Set())

  useEffect(() => {
    if (canWrite && activeView === 'users') {
      entryService.getAllGroups(clusterName!).then(setGroups).catch(() => {})
    }
  }, [canWrite, activeView, clusterName])


  /** Seed the LDIF editor from this cluster's user schema instead of the form. */
  const handleCreateWithLdif = async () => {
    try {
      const form = await clusterService.getClusterForm(clusterName || '')
      const body = buildUserLdifTemplate(form)
      sessionStorage.setItem(LDIF_DRAFT_KEY, JSON.stringify({ cluster: clusterName, body }))
      handleViewChange('ldif')
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const refreshAfterBulk = () => {
    clearSelection()
    loadClusterData()
  }

  const handleBulkDelete = async () => {
    const ok = await confirm({
      title: `Delete ${selectedDns.size} ${selectedDns.size === 1 ? 'entry' : 'entries'}?`,
      description: 'This removes them from the directory. It cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await entryService.bulkDelete(clusterName!, [...selectedDns])
      toast.success(`Deleted ${res.succeeded.length}${res.errors.length ? ` (${res.errors.length} failed)` : ''}`)
      refreshAfterBulk()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const handleBulkAttr = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!bulkAttr.trim()) return
    try {
      const res = await entryService.bulkUpdate(clusterName!, [...selectedDns], { [bulkAttr.trim()]: bulkValue })
      toast.success(`Updated ${res.succeeded.length}${res.errors.length ? ` (${res.errors.length} failed)` : ''}`)
      setBulkAttr('')
      setBulkValue('')
      refreshAfterBulk()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const handleBulkGroup = async () => {
    if (!bulkGroup) return
    try {
      const res = await entryService.bulkGroup(clusterName!, [...selectedDns], bulkGroup, 'add')
      toast.success(`Added ${res.succeeded.length} to group${res.errors.length ? ` (${res.errors.length} failed)` : ''}`)
      setBulkGroup('')
      refreshAfterBulk()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const { openCreateDialog, openEditDialog, openPasswordDialog, openGroupsDialog, showCreateDialog, showEditDialog, showPasswordDialog, showGroupsDialog, editingEntry, passwordEntry, groupsEntry, closeCreateDialog, closeEditDialog, closePasswordDialog, closeGroupsDialog } = useDialogs()

  const handleViewChange = (view: 'browse' | 'users' | 'groups' | 'ous' | 'all' | 'ldif' | 'schema' | 'aci' | 'monitoring' | 'activity') => {
    setSearchParams({ view })
    setPage(1)
    setSelectedDns(new Set())
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
    const ok = await confirm({
      title: 'Delete this entry?',
      description: `${dn}\n\nThis removes the entry from the directory. It cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    
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
    return `flex items-center space-x-2 px-5 py-3.5 text-[15px] font-medium border-b-2 transition-all duration-200 whitespace-nowrap ${
      activeView === view 
        ? 'border-primary text-primary-readable bg-primary/5' 
        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50'
    }`
  }

  return (
    <div className="space-y-0">
      <nav className="bg-card border-b sticky top-[73px] z-40" aria-label="Cluster navigation">
        <div className="container mx-auto px-6">
          <div className="flex overflow-x-auto scrollbar-hide" role="tablist">
            <button onClick={() => handleViewChange('browse')} className={getNavClass('browse')} role="tab" aria-selected={activeView === 'browse'}>
              <Boxes className="h-4 w-4" aria-hidden="true" />
              <span>Browse</span>
            </button>
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
            <button onClick={() => handleViewChange('ldif')} className={getNavClass('ldif')} role="tab" aria-selected={activeView === 'ldif'}>
              <FileCode2 className="h-4 w-4" aria-hidden="true" />
              <span>LDIF</span>
            </button>
            <button onClick={() => handleViewChange('schema')} className={getNavClass('schema')} role="tab" aria-selected={activeView === 'schema'}>
              <Layers className="h-4 w-4" aria-hidden="true" />
              <span>Schema</span>
            </button>
            <button onClick={() => handleViewChange('aci')} className={getNavClass('aci')} role="tab" aria-selected={activeView === 'aci'}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span>Access</span>
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

      {activeView === 'browse' ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Directory Tree</h2>
            <p className="text-sm text-muted-foreground">
              Browse the DIT. Select an entry to inspect its attributes.
              {canWrite ? ' The trash icon deletes an entry.' : ' You have read-only access.'}
            </p>
          </div>
          <DirectoryTree clusterName={clusterName || ''} canWrite={canWrite} />
        </div>
      ) : activeView === 'ldif' ? (
        <LdifEditor
          clusterName={clusterName || ''}
          canValidate={canWrite}
          canApply={isAdmin}
          canExport={isAdmin}
        />
      ) : activeView === 'schema' ? (
        <SchemaView clusterName={clusterName || ''} />
      ) : activeView === 'aci' ? (
        <AciView clusterName={clusterName || ''} />
      ) : isDirectoryView ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {activeView === 'users' && 'Users'}
              {activeView === 'groups' && 'Groups'}
              {activeView === 'ous' && 'Organizational Units'}
              {activeView === 'all' && 'All Directory Entries'}
            </h2>
            <div className="flex items-center space-x-3">
              {canWrite && activeView === 'users' && (
                <Button onClick={openCreateDialog} size="sm" aria-label="Create new user">
                  <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                  Create User
                </Button>
              )}
              {canWrite && activeView === 'users' && (
                <Button
                  onClick={handleCreateWithLdif}
                  size="sm"
                  variant="outline"
                  aria-label="Create user from LDIF"
                >
                  Create with LDIF
                </Button>
              )}
              {tableColumns[activeView] && (
                <ColumnSettings
                  columns={tableColumns[activeView]}
                  visibleColumns={visibleColumns[activeView] || []}
                  onColumnsChange={(cols) => handleColumnsChange(activeView, cols)}
                />
              )}
              <a
                href={`${CONTEXT_PATH}/api/entries/export?cluster=${encodeURIComponent(
                  clusterName || ''
                )}&filter_type=${activeView === 'all' ? '' : activeView}${
                  debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ''
                }`}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-md border hover:bg-accent transition-colors"
                title="Download the current view as CSV"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Export CSV
              </a>
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

          {/* Bulk actions bar, only while something is selected. */}
          {canWrite && selectedDns.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
              <span className="text-sm font-medium">{selectedDns.size} selected</span>

              <form onSubmit={handleBulkAttr} className="flex items-center gap-2">
                <Input
                  value={bulkAttr}
                  onChange={(e) => setBulkAttr(e.target.value)}
                  placeholder="attribute"
                  className="h-8 w-36"
                  aria-label="Attribute to set"
                />
                <Input
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  placeholder="value"
                  className="h-8 w-40"
                  aria-label="Attribute value"
                />
                <Button type="submit" size="sm" disabled={!bulkAttr.trim()}>
                  Set
                </Button>
              </form>

              <div className="flex items-center gap-2">
                <select
                  value={bulkGroup}
                  onChange={(e) => setBulkGroup(e.target.value)}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  aria-label="Group to assign"
                >
                  <option value="">Add to group…</option>
                  {groups.map((g) => (
                    <option key={g.dn} value={g.dn}>
                      {Array.isArray(g.cn) ? g.cn[0] : g.cn}
                    </option>
                  ))}
                </select>
                <Button size="sm" onClick={handleBulkGroup} disabled={!bulkGroup}>
                  Add
                </Button>
              </div>

              <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
                <Trash2 className="h-4 w-4 mr-1" aria-hidden="true" />
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={clearSelection}>
                Clear
              </Button>
            </div>
          )}

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
            readonly={!canWrite}
            selectable={canWrite && activeView === 'users'}
            selectedDns={selectedDns}
            onToggleSelect={toggleSelect}
            onSelectAll={selectAllPage}
          />
        </div>
      ) : activeView === 'monitoring' ? (
        <Suspense fallback={<div>Loading monitoring...</div>}>
          <MonitoringView clusterName={clusterName || ''} />
        </Suspense>
      ) : (
        <Suspense fallback={<div>Loading activity log...</div>}>
          <ActivityLogView clusterName={clusterName || ''} />
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
