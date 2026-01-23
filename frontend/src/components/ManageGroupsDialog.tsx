import { useState, useEffect, useMemo } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { entryService } from '@/services'
import { LDAPEntry, GroupInfo } from '@/types'
import { Search, Check, Users } from 'lucide-react'

interface ManageGroupsDialogProps {
  open: boolean
  onClose: () => void
  clusterName: string
  entry: LDAPEntry
  onSuccess: () => void
}

export default function ManageGroupsDialog({
  open,
  onClose,
  clusterName,
  entry,
  onSuccess
}: ManageGroupsDialogProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [allGroups, setAllGroups] = useState<GroupInfo[]>([])
  const [currentGroupDns, setCurrentGroupDns] = useState<Set<string>>(new Set())
  const [selectedGroupDns, setSelectedGroupDns] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (open) {
      loadData()
    }
  }, [open, entry.dn])

  const loadData = async () => {
    setLoading(true)
    setError('')
    setSearchQuery('')
    try {
      const [groups, userGroups] = await Promise.all([
        entryService.getAllGroups(clusterName),
        entryService.getUserGroups(clusterName, entry.dn)
      ])

      setAllGroups(groups)
      const currentDns = new Set(userGroups.map(g => g.dn))
      setCurrentGroupDns(currentDns)
      setSelectedGroupDns(new Set(currentDns))
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load groups')
    }
    setLoading(false)
  }

  const filteredGroups = useMemo(() => {
    if (!searchQuery) return allGroups
    const query = searchQuery.toLowerCase()
    return allGroups.filter(g => {
      const cn = Array.isArray(g.cn) ? g.cn[0] : g.cn
      const desc = Array.isArray(g.description) ? g.description[0] : g.description
      return cn?.toLowerCase().includes(query) || desc?.toLowerCase().includes(query)
    })
  }, [allGroups, searchQuery])

  const toggleGroup = (groupDn: string) => {
    setSelectedGroupDns(prev => {
      const next = new Set(prev)
      if (next.has(groupDn)) {
        next.delete(groupDn)
      } else {
        next.add(groupDn)
      }
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')

    const groupsToAdd = [...selectedGroupDns].filter(dn => !currentGroupDns.has(dn))
    const groupsToRemove = [...currentGroupDns].filter(dn => !selectedGroupDns.has(dn))

    if (groupsToAdd.length === 0 && groupsToRemove.length === 0) {
      onClose()
      return
    }

    try {
      const result = await entryService.updateUserGroups(
        clusterName,
        entry.dn,
        groupsToAdd,
        groupsToRemove
      )

      if (result.status === 'partial' && result.errors) {
        setError(`Some operations failed: ${result.errors.join(', ')}`)
      } else {
        onSuccess()
        onClose()
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update group memberships')
    }
    setSaving(false)
  }

  const hasChanges = useMemo(() => {
    if (selectedGroupDns.size !== currentGroupDns.size) return true
    for (const dn of selectedGroupDns) {
      if (!currentGroupDns.has(dn)) return true
    }
    return false
  }, [selectedGroupDns, currentGroupDns])

  const getGroupDisplayName = (group: GroupInfo): string => {
    return Array.isArray(group.cn) ? group.cn[0] : group.cn
  }

  const getGroupDescription = (group: GroupInfo): string | undefined => {
    const desc = Array.isArray(group.description) ? group.description[0] : group.description
    return desc || undefined
  }

  const getUserDisplayName = (): string => {
    if (entry.uid) return Array.isArray(entry.uid) ? entry.uid[0] : entry.uid
    if (entry.cn) return Array.isArray(entry.cn) ? entry.cn[0] : entry.cn
    return entry.dn
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="overflow-y-auto" aria-label="Manage user groups">
        <SheetHeader>
          <SheetTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Manage Groups: {getUserDisplayName()}</span>
          </SheetTitle>
          <SheetDescription>
            Select the groups this user should belong to
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="space-y-4 mt-6">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-4 mt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search groups..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                aria-label="Search groups"
              />
            </div>

            <div className="border rounded-lg max-h-[400px] overflow-y-auto">
              {filteredGroups.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No groups found
                </div>
              ) : (
                filteredGroups.map(group => {
                  const isSelected = selectedGroupDns.has(group.dn)
                  const wasOriginal = currentGroupDns.has(group.dn)
                  const isChanged = isSelected !== wasOriginal

                  return (
                    <div
                      key={group.dn}
                      className={`flex items-center justify-between p-3 border-b last:border-b-0 cursor-pointer hover:bg-accent transition-colors ${
                        isSelected ? 'bg-primary/5' : ''
                      }`}
                      onClick={() => toggleGroup(group.dn)}
                      role="checkbox"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggleGroup(group.dn)
                        }
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium truncate">
                            {getGroupDisplayName(group)}
                          </span>
                          {isChanged && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              isSelected
                                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                            }`}>
                              {isSelected ? 'Adding' : 'Removing'}
                            </span>
                          )}
                        </div>
                        {getGroupDescription(group) && (
                          <p className="text-sm text-muted-foreground truncate">
                            {getGroupDescription(group)}
                          </p>
                        )}
                      </div>
                      <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-muted-foreground/30'
                      }`}>
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="text-sm text-muted-foreground">
              {selectedGroupDns.size} group{selectedGroupDns.size !== 1 ? 's' : ''} selected
              {hasChanges && (
                <span className="ml-2 text-primary">
                  (unsaved changes)
                </span>
              )}
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded" role="alert">
                {error}
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !hasChanges}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
