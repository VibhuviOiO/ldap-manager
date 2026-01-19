import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Search, Users, FolderTree, Building2, Database as DatabaseIcon, Activity, BarChart3, Plus } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import DirectoryTable from './DirectoryTable'
import MonitoringView from './MonitoringView'
import ActivityLogView from './ActivityLogView'
import CreateUserDialog from './CreateUserDialog'
import EditUserDialog from './EditUserDialog'
import ChangePasswordDialog from './ChangePasswordDialog'
import ColumnSettings from './ColumnSettings'
import axios from 'axios'

interface Column {
  name: string
  label: string
  default_visible: boolean
}

export default function ClusterDetails() {
  const { clusterName } = useParams<{ clusterName: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeView, setActiveView] = useState<'users' | 'groups' | 'ous' | 'all' | 'monitoring' | 'activity'>(() => {
    const view = searchParams.get('view')
    return (view as any) || 'users'
  })
  const [entries, setEntries] = useState<any[]>([])
  const [monitoring, setMonitoring] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalEntries, setTotalEntries] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [editingEntry, setEditingEntry] = useState<any>(null)
  const [passwordEntry, setPasswordEntry] = useState<any>(null)
  const [clusterConfig, setClusterConfig] = useState<any>(null)
  const [tableColumns, setTableColumns] = useState<Record<string, Column[]>>({})
  const [visibleColumns, setVisibleColumns] = useState<Record<string, string[]>>({})

  const handleViewChange = (view: 'users' | 'groups' | 'ous' | 'all' | 'monitoring' | 'activity') => {
    setActiveView(view)
    setSearchParams({ view })
    setPage(1) // Reset to page 1 when changing views
  }

  useEffect(() => {
    loadMonitoring()
    loadClusterConfig()
    loadTableColumns()
  }, [clusterName])

  useEffect(() => {
    if (['users', 'groups', 'ous', 'all'].includes(activeView)) {
      setLoading(true)
      setEntries([])
      const timer = setTimeout(() => {
        loadClusterData()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [clusterName, activeView, page, searchQuery, pageSize])

  const loadTableColumns = async () => {
    try {
      const res = await axios.get(`/api/clusters/columns/${clusterName}`)
      setTableColumns(res.data)
      
      // Load saved preferences from localStorage or use defaults
      const savedPrefs = localStorage.getItem(`ldap-columns-${clusterName}`)
      if (savedPrefs) {
        setVisibleColumns(JSON.parse(savedPrefs))
      } else {
        // Initialize with default visible columns
        const defaults: Record<string, string[]> = {}
        Object.keys(res.data).forEach(view => {
          defaults[view] = res.data[view]
            .filter((col: Column) => col.default_visible)
            .map((col: Column) => col.name)
        })
        setVisibleColumns(defaults)
      }
    } catch (err) {
      console.error('Failed to load table columns', err)
    }
  }

  const handleColumnsChange = (view: string, columns: string[]) => {
    const updated = { ...visibleColumns, [view]: columns }
    setVisibleColumns(updated)
    localStorage.setItem(`ldap-columns-${clusterName}`, JSON.stringify(updated))
  }

  const loadClusterData = async () => {
    setLoading(true)
    try {
      const filterType = activeView === 'all' ? '' : activeView
      const res = await axios.get(`/api/entries/search`, {
        params: {
          cluster: clusterName,
          page,
          page_size: pageSize,
          filter_type: filterType,
          search: searchQuery || undefined
        }
      })
      
      setEntries(res.data.entries || [])
      setTotalEntries(res.data.total || 0)
      setHasMore(res.data.has_more || false)
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

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    setPage(1)
  }

  const loadMonitoring = async () => {
    try {
      const res = await axios.get(`/api/clusters/health/${clusterName}`)
      setMonitoring(res.data)
    } catch (err) {
      console.error('Failed to load monitoring data', err)
      setMonitoring({ status: 'error', message: 'Failed to check cluster health' })
    }
  }

  const loadClusterConfig = async () => {
    try {
      const res = await axios.get('/api/clusters/list')
      const cluster = res.data.clusters.find((c: any) => c.name === clusterName)
      setClusterConfig(cluster)
    } catch (err) {
      console.error('Failed to load cluster config', err)
    }
  }

  const handleDelete = async (dn: string) => {
    if (!confirm(`Delete user ${dn}?`)) return
    
    try {
      await axios.delete('/api/entries/delete', {
        params: { cluster_name: clusterName, dn }
      })
      loadClusterData()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete user')
    }
  }

  const handleEdit = (entry: any) => {
    setEditingEntry(entry)
    setShowEditDialog(true)
  }

  const handleChangePassword = (entry: any) => {
    setPasswordEntry(entry)
    setShowPasswordDialog(true)
  }

  const isDirectoryView = ['users', 'groups', 'ous', 'all'].includes(activeView)
  const getStatusClass = () => {
    if (monitoring?.status === 'healthy') return 'bg-primary/10 text-primary'
    if (monitoring?.status === 'warning') return 'bg-yellow-500/10 text-yellow-600'
    return 'bg-destructive/10 text-destructive'
  }
  const getNavClass = (view: string) => {
    return `flex items-center space-x-2 px-6 py-3.5 text-sm font-medium border-b-2 transition-all duration-200 whitespace-nowrap ${
      activeView === view 
        ? 'border-primary text-primary bg-primary/5' 
        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50'
    }`
  }

  return (
    <div className="space-y-0">
      <div className="bg-card border-b sticky top-[73px] z-40">
        <div className="container mx-auto px-6">
          <div className="flex overflow-x-auto scrollbar-hide">
            <button onClick={() => handleViewChange('users')} className={getNavClass('users')}>
              <Users className="h-4 w-4" />
              <span>Users</span>
            </button>
            <button onClick={() => handleViewChange('groups')} className={getNavClass('groups')}>
              <FolderTree className="h-4 w-4" />
              <span>Groups</span>
            </button>
            <button onClick={() => handleViewChange('ous')} className={getNavClass('ous')}>
              <Building2 className="h-4 w-4" />
              <span>Organizational Units</span>
            </button>
            <button onClick={() => handleViewChange('all')} className={getNavClass('all')}>
              <DatabaseIcon className="h-4 w-4" />
              <span>All Entries</span>
            </button>
            <button onClick={() => handleViewChange('monitoring')} className={getNavClass('monitoring')}>
              <BarChart3 className="h-4 w-4" />
              <span>Monitoring</span>
            </button>
            <button onClick={() => handleViewChange('activity')} className={getNavClass('activity')}>
              <Activity className="h-4 w-4" />
              <span>Activity Log</span>
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6 space-y-6">

      {monitoring && monitoring.status !== 'healthy' && (
        <Card className="border-l-4 border-l-destructive shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <div className="text-destructive mt-0.5">⚠</div>
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
                <Button onClick={() => setShowCreateDialog(true)} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
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
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-10"
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
            onEdit={handleEdit}
            onChangePassword={handleChangePassword}
            readonly={clusterConfig?.readonly}
          />
        </div>
      ) : activeView === 'monitoring' ? (
        <MonitoringView clusterName={clusterName || ''} />
      ) : (
        <ActivityLogView />
      )}

      {showCreateDialog && (
        <CreateUserDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          clusterName={clusterName || ''}
          baseDn={clusterConfig?.base_dn || ''}
          onSuccess={() => loadClusterData()}
        />
      )}

      {showEditDialog && editingEntry && (
        <EditUserDialog
          open={showEditDialog}
          onClose={() => {
            setShowEditDialog(false)
            setEditingEntry(null)
          }}
          clusterName={clusterName || ''}
          entry={editingEntry}
          onSuccess={() => loadClusterData()}
        />
      )}

      {showPasswordDialog && passwordEntry && (
        <ChangePasswordDialog
          open={showPasswordDialog}
          onClose={() => {
            setShowPasswordDialog(false)
            setPasswordEntry(null)
          }}
          clusterName={clusterName || ''}
          entry={passwordEntry}
          onSuccess={() => loadClusterData()}
        />
      )}
      </div>
    </div>
  )
}
