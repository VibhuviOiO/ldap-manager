import { useState, Fragment } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Pencil, Trash2, Key, Users } from 'lucide-react'
import { Button } from './ui/button'

interface Column {
  name: string
  label: string
  default_visible: boolean
}

interface DirectoryTableProps {
  entries: any[]
  directoryView: 'users' | 'groups' | 'ous' | 'all'
  loading: boolean
  page: number
  pageSize: number
  totalEntries: number
  hasMore: boolean
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  columns?: Column[]
  visibleColumns?: string[]
  onDelete?: (dn: string) => void
  onEdit?: (entry: any) => void
  onChangePassword?: (entry: any) => void
  onManageGroups?: (entry: any) => void
  readonly?: boolean
}

export default function DirectoryTable({
  entries, directoryView, loading, page, pageSize, totalEntries, hasMore, onPageChange, onPageSizeChange, columns, visibleColumns, onDelete, onEdit, onChangePassword, onManageGroups, readonly
}: DirectoryTableProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const toggleGroupExpand = (groupDn: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupDn)) {
        next.delete(groupDn)
      } else {
        next.add(groupDn)
      }
      return next
    })
  }

  const getMembers = (entry: any): string[] => {
    const members = entry.member || entry.uniqueMember || entry.memberUid || []
    return Array.isArray(members) ? members : (members ? [members] : [])
  }

  const extractUsername = (memberDn: string): string => {
    // Extract uid or cn from DN like "uid=john,ou=People,dc=example,dc=com"
    const match = memberDn.match(/^(uid|cn)=([^,]+)/i)
    return match ? match[2] : memberDn
  }

  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              {[1, 2, 3, 4].map(i => (
                <th key={i} className="text-left p-2">
                  <div className="h-4 bg-muted rounded animate-pulse w-24"></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map(row => (
              <tr key={row} className="border-b">
                {[1, 2, 3, 4].map(col => (
                  <td key={col} className="p-2">
                    <div className="h-4 bg-muted rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }}></div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  
  if (entries.length === 0) return <p className="text-muted-foreground">No entries found</p>

  const isColumnVisible = (colName: string) => {
    if (!visibleColumns || !columns) return true
    return visibleColumns.includes(colName)
  }

  const renderUserCell = (entry: any, colName: string) => {
    const value = entry[colName]
    
    // Special rendering for full name - combine cn and sn
    if (colName === 'cn') {
      const firstName = entry.cn || ''
      const lastName = entry.sn || ''
      return lastName ? `${firstName} ${lastName}` : firstName
    }
    
    // Special rendering for shadowLastChange - show password age
    if (colName === 'shadowLastChange' && value) {
      const days = parseInt(value)
      const passwordDate = new Date(1970, 0, 1)
      passwordDate.setDate(passwordDate.getDate() + days)
      const today = new Date()
      const ageInDays = Math.floor((today.getTime() - passwordDate.getTime()) / (1000 * 60 * 60 * 24))
      
      if (ageInDays === 0) return 'Today'
      if (ageInDays === 1) return '1 day ago'
      if (ageInDays < 30) return `${ageInDays} days ago`
      if (ageInDays < 365) {
        const months = Math.floor(ageInDays / 30)
        return `${months} month${months > 1 ? 's' : ''} ago`
      }
      const years = Math.floor(ageInDays / 365)
      return `${years} year${years > 1 ? 's' : ''} ago`
    }
    
    // Special rendering for LDAP timestamps (format: YYYYMMDDHHmmssZ)
    if ((colName === 'createTimestamp' || colName === 'modifyTimestamp') && value) {
      const year = value.substring(0, 4)
      const month = value.substring(4, 6)
      const day = value.substring(6, 8)
      const hour = value.substring(8, 10)
      const min = value.substring(10, 12)
      const date = new Date(`${year}-${month}-${day}T${hour}:${min}:00Z`)
      return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }
    
    // Special rendering for specific columns
    if (colName === 'objectClass') {
      const objectClasses = Array.isArray(value) ? value : (value ? [value] : [])
      const customClasses = objectClasses.filter((oc: string) => 
        !['top', 'person', 'organizationalPerson', 'inetOrgPerson', 'posixAccount', 'shadowAccount', 'account'].includes(oc)
      )
      if (customClasses.length > 0) {
        return <span className="px-2 py-1 bg-primary/10 text-primary rounded text-xs">{customClasses[0]}</span>
      }
      if (objectClasses.includes('account') && !objectClasses.includes('inetOrgPerson')) {
        return <span className="px-2 py-1 bg-blue-500/10 text-blue-600 rounded text-xs">Legacy Unix</span>
      }
      return <span className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs">Standard</span>
    }
    
    // Default: render value as-is
    return Array.isArray(value) ? value.join(', ') : (value || '-')
  }

  const renderGroupCell = (entry: any, colName: string, isClickable: boolean = false) => {
    const value = entry[colName]

    // Special rendering for LDAP timestamps
    if ((colName === 'createTimestamp' || colName === 'modifyTimestamp') && value) {
      const year = value.substring(0, 4)
      const month = value.substring(4, 6)
      const day = value.substring(6, 8)
      const hour = value.substring(8, 10)
      const min = value.substring(10, 12)
      const date = new Date(`${year}-${month}-${day}T${hour}:${min}:00Z`)
      return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }

    // Special rendering for members count
    if (colName === 'members') {
      const members = getMembers(entry)
      const count = members.length
      const isExpanded = expandedGroups.has(entry.dn)

      if (isClickable && count > 0) {
        return (
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleGroupExpand(entry.dn)
            }}
            className="inline-flex items-center space-x-1 text-primary hover:underline focus:outline-none"
            title={isExpanded ? 'Click to collapse' : 'Click to view members'}
          >
            <span>{count} member{count !== 1 ? 's' : ''}</span>
            {isExpanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        )
      }
      return `${count} member${count !== 1 ? 's' : ''}`
    }

    // Special rendering for DN
    if (colName === 'dn') {
      return <span className="font-mono text-xs">{value}</span>
    }

    // Default: render value as-is
    return Array.isArray(value) ? value.join(', ') : (value || '-')
  }

  const renderOuCell = (entry: any, colName: string) => {
    const value = entry[colName]
    
    // Special rendering for DN
    if (colName === 'dn') {
      return <span className="font-mono text-xs">{value}</span>
    }
    
    // Default: render value as-is
    return Array.isArray(value) ? value.join(', ') : (value || '-')
  }

  return (
    <>
      <div className="border rounded-lg">
        <div className="overflow-x-auto">
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-background border-b">
                <tr>
              {directoryView === 'users' && columns && columns.filter(c => isColumnVisible(c.name)).map(col => (
                <th key={col.name} className="text-left p-2 font-medium text-sm">{col.label}</th>
              ))}
              {directoryView === 'users' && columns && !readonly && (
                <th className="text-right p-2 font-medium text-sm">Actions</th>
              )}
              {directoryView === 'users' && !columns && (
                <>
                  <th className="text-left p-2 font-medium text-sm">Username</th>
                  <th className="text-left p-2 font-medium text-sm">Full Name</th>
                  <th className="text-left p-2 font-medium text-sm">Email</th>
                  <th className="text-left p-2 font-medium text-sm">Type</th>
                  {!readonly && <th className="text-right p-2 font-medium text-sm">Actions</th>}
                </>
              )}
              {directoryView === 'groups' && columns && columns.filter(c => isColumnVisible(c.name)).map(col => (
                <th key={col.name} className="text-left p-2 font-medium text-sm">{col.label}</th>
              ))}
              {directoryView === 'groups' && !columns && (
                <>
                  <th className="text-left p-2 font-medium text-sm">Group Name</th>
                  <th className="text-left p-2 font-medium text-sm">Description</th>
                  <th className="text-left p-2 font-medium text-sm">Members</th>
                </>
              )}
              {directoryView === 'ous' && columns && columns.filter(c => isColumnVisible(c.name)).map(col => (
                <th key={col.name} className="text-left p-2 font-medium text-sm">{col.label}</th>
              ))}
              {directoryView === 'ous' && !columns && (
                <>
                  <th className="text-left p-2 font-medium text-sm">OU Name</th>
                  <th className="text-left p-2 font-medium text-sm">Description</th>
                  <th className="text-left p-2 font-medium text-sm">DN</th>
                </>
              )}
              {directoryView === 'all' && (
                <>
                  <th className="text-left p-2 font-medium text-sm">DN</th>
                  <th className="text-left p-2 font-medium text-sm">Object Class</th>
                  <th className="text-left p-2 font-medium text-sm">Attributes</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => {
              const isGroupExpanded = directoryView === 'groups' && expandedGroups.has(entry.dn)
              const members = directoryView === 'groups' ? getMembers(entry) : []
              const colCount = directoryView === 'groups'
                ? (columns ? columns.filter(c => isColumnVisible(c.name)).length : 3)
                : 1

              return (
              <Fragment key={idx}>
              <tr className="border-b hover:bg-accent">
                {directoryView === 'users' && columns && columns.filter(c => isColumnVisible(c.name)).map(col => (
                  <td key={col.name} className="p-2 text-sm">{renderUserCell(entry, col.name)}</td>
                ))}
                {directoryView === 'users' && columns && !readonly && (
                  <td className="p-2 text-sm text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => onManageGroups?.(entry)}
                        className="p-1.5 hover:bg-accent rounded transition-colors"
                        title="Manage groups"
                      >
                        <Users className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      </button>
                      <button
                        onClick={() => onChangePassword?.(entry)}
                        className="p-1.5 hover:bg-accent rounded transition-colors"
                        title="Change password"
                      >
                        <Key className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      </button>
                      <button
                        onClick={() => onEdit?.(entry)}
                        className="p-1.5 hover:bg-accent rounded transition-colors"
                        title="Edit user"
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      </button>
                      <button
                        onClick={() => onDelete?.(entry.dn)}
                        className="p-1.5 hover:bg-destructive/10 rounded transition-colors"
                        title="Delete user"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  </td>
                )}
                {directoryView === 'users' && !columns && (
                  <>
                    <td className="p-2 text-sm font-medium">{entry.uid || entry.cn || '-'}</td>
                    <td className="p-2 text-sm">{entry.cn || '-'}</td>
                    <td className="p-2 text-sm text-muted-foreground">{entry.mail || '-'}</td>
                    <td className="p-2 text-sm">{renderUserCell(entry, 'objectClass')}</td>
                    {!readonly && (
                      <td className="p-2 text-sm text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => onManageGroups?.(entry)}
                            className="p-1.5 hover:bg-accent rounded transition-colors"
                            title="Manage groups"
                          >
                            <Users className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                          </button>
                          <button
                            onClick={() => onChangePassword?.(entry)}
                            className="p-1.5 hover:bg-accent rounded transition-colors"
                            title="Change password"
                          >
                            <Key className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                          </button>
                          <button
                            onClick={() => onEdit?.(entry)}
                            className="p-1.5 hover:bg-accent rounded transition-colors"
                            title="Edit user"
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                          </button>
                          <button
                            onClick={() => onDelete?.(entry.dn)}
                            className="p-1.5 hover:bg-destructive/10 rounded transition-colors"
                            title="Delete user"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </button>
                        </div>
                      </td>
                    )}
                  </>
                )}
                {directoryView === 'groups' && columns && columns.filter(c => isColumnVisible(c.name)).map(col => (
                  <td key={col.name} className="p-2 text-sm">
                    {col.name === 'members' ? renderGroupCell(entry, col.name, true) : renderGroupCell(entry, col.name)}
                  </td>
                ))}
                {directoryView === 'groups' && !columns && (
                  <>
                    <td className="p-2 text-sm font-medium">{entry.cn || '-'}</td>
                    <td className="p-2 text-sm">{entry.description || '-'}</td>
                    <td className="p-2 text-sm text-muted-foreground">{renderGroupCell(entry, 'members', true)}</td>
                  </>
                )}
                {directoryView === 'ous' && columns && columns.filter(c => isColumnVisible(c.name)).map(col => (
                  <td key={col.name} className="p-2 text-sm">{renderOuCell(entry, col.name)}</td>
                ))}
                {directoryView === 'ous' && !columns && (
                  <>
                    <td className="p-2 text-sm font-medium">{entry.ou || entry.o || '-'}</td>
                    <td className="p-2 text-sm">{entry.description || '-'}</td>
                    <td className="p-2 text-xs font-mono text-muted-foreground">{entry.dn}</td>
                  </>
                )}
                {directoryView === 'all' && (
                  <>
                    <td className="p-2 text-sm font-mono">{entry.dn}</td>
                    <td className="p-2 text-sm">
                      <span className="px-2 py-1 bg-primary/10 text-primary rounded text-xs">
                        {entry.objectClass?.[entry.objectClass.length - 1] || 'Unknown'}
                      </span>
                    </td>
                    <td className="p-2 text-sm text-muted-foreground">
                      {Object.keys(entry)
                        .filter(k => k !== 'dn' && k !== 'objectClass')
                        .slice(0, 3)
                        .map(k => `${k}: ${Array.isArray(entry[k]) ? entry[k][0] : entry[k]}`)
                        .join(', ')}
                    </td>
                  </>
                )}
              </tr>
              {isGroupExpanded && members.length > 0 && (
                <tr key={`${idx}-expanded`} className="bg-muted/30">
                  <td colSpan={colCount} className="p-0">
                    <div className="p-3 pl-6 border-l-4 border-primary/30">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Members ({members.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {members.map((member, mIdx) => (
                          <span
                            key={mIdx}
                            className="inline-flex items-center px-2.5 py-1 bg-background border rounded-md text-xs"
                            title={member}
                          >
                            <Users className="h-3 w-3 mr-1.5 text-muted-foreground" />
                            {extractUsername(member)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            )})}

          </tbody>
        </table>
        </div>
        </div>
        
        <div className="flex items-center justify-between p-4 border-t">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1} to {(page - 1) * pageSize + entries.length} of {totalEntries} entries
          </p>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
                className="border border-input bg-background rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={!hasMore && entries.length < pageSize}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
