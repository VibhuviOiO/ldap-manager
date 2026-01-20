import { useState, useEffect, memo } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select } from './ui/select'
import { clusterService, entryService } from '@/services'
import { FormField, LDAPEntry, UserCreationForm } from '@/types'
import { sanitizeObject } from '@/lib/sanitize'

type FormData = Record<string, string | number | boolean | string[]>

interface UserFormDialogProps {
  open: boolean
  onClose: () => void
  clusterName: string
  baseDn?: string
  entry?: LDAPEntry
  mode: 'create' | 'edit'
  onSuccess: () => void
}

function UserFormDialog({ open, onClose, clusterName, baseDn, entry, mode, onSuccess }: UserFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formConfig, setFormConfig] = useState<UserCreationForm | null>(null)
  const [formData, setFormData] = useState<FormData>({})

  useEffect(() => {
    if (open) {
      loadFormConfig()
    }
  }, [open, entry])

  const loadFormConfig = async () => {
    try {
      const config = await clusterService.getClusterForm(clusterName)
      setFormConfig(config)
      
      const initialData: FormData = {}
      config.fields.forEach((field: FormField) => {
        if (mode === 'edit' && entry?.[field.name] !== undefined) {
          const value = entry[field.name]
          initialData[field.name] = Array.isArray(value) ? value[0] : value || ''
        } else if (field.default !== undefined) {
          initialData[field.name] = field.default
        } else if (field.auto_generate?.includes('${uid}')) {
          initialData[field.name] = ''
        } else {
          initialData[field.name] = ''
        }
      })
      setFormData(initialData)
    } catch (err) {
      console.error('Failed to load form config', err)
      setError('Form configuration not found for this cluster')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (!formConfig) throw new Error('Form not configured')
      
      const sanitizedData = sanitizeObject(formData)

      if (mode === 'create') {
        const dn = `uid=${sanitizedData.uid},${formConfig.base_ou}`
        const attributes: Record<string, string | string[] | number | boolean> = {
          objectClass: formConfig.object_classes,
          ...sanitizedData
        }

        formConfig.fields.forEach((field) => {
          if (field.auto_generate) {
            if (field.auto_generate === 'next_uid') {
              attributes[field.name] = 'auto'
            } else if (field.auto_generate.includes('${uid}')) {
              attributes[field.name] = field.auto_generate.replace('${uid}', String(sanitizedData.uid))
            }
          }
        })

        await entryService.createEntry(clusterName, dn, attributes)
      } else {
        const modifications: FormData = {}
        Object.keys(sanitizedData).forEach(key => {
          if (sanitizedData[key] !== entry?.[key]) {
            modifications[key] = sanitizedData[key]
          }
        })

        if (Object.keys(modifications).length === 0) {
          setError('No changes detected')
          setLoading(false)
          return
        }

        await entryService.updateEntry(clusterName, entry!.dn, modifications)
      }

      onSuccess()
      onClose()
      setFormData({})
    } catch (err: any) {
      setError(err.response?.data?.detail || `Failed to ${mode} user`)
    }
    setLoading(false)
  }

  if (!formConfig) {
    return (
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent aria-label={`${mode === 'create' ? 'Create' : 'Edit'} user form`}>
          <SheetHeader>
            <SheetTitle>{mode === 'create' ? 'Create New User' : 'Edit User'}</SheetTitle>
          </SheetHeader>
          <div className="text-sm text-muted-foreground">
            {error || 'Loading form configuration...'}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  const filteredFields = mode === 'edit' 
    ? formConfig.fields.filter(field => field.name !== 'userPassword')
    : formConfig.fields

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="overflow-y-auto" aria-label={`${mode === 'create' ? 'Create' : 'Edit'} user form`}>
        <SheetHeader>
          <SheetTitle>{mode === 'create' ? 'Create New User' : `Edit User: ${entry?.uid}`}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="grid grid-cols-2 gap-4">
            {filteredFields.map((field) => {
              const isDisabled = field.readonly || (mode === 'edit' && (field.name === 'uid' || field.name === 'uidNumber'))
              return (
                <div key={field.name}>
                  <Label htmlFor={field.name}>
                    {field.label} {field.required && '*'}
                  </Label>
                  {field.type === 'select' ? (
                    <Select
                      id={field.name}
                      required={field.required}
                      disabled={isDisabled}
                      value={String(formData[field.name] || '')}
                      onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                      aria-label={field.label}
                    >
                      <option value="">Select {field.label}</option>
                      {field.options?.map((option) => {
                        const optionValue = typeof option === 'object' ? option.value : option
                        const optionLabel = typeof option === 'object' ? option.label : option
                        return <option key={optionValue} value={optionValue}>{optionLabel}</option>
                      })}
                    </Select>
                  ) : field.type === 'checkbox' ? (
                    <div className="flex items-center space-x-2">
                      <input
                        id={field.name}
                        type="checkbox"
                        checked={formData[field.name] === 'TRUE' || formData[field.name] === true}
                        onChange={(e) => setFormData({ ...formData, [field.name]: e.target.checked ? 'TRUE' : 'FALSE' })}
                        className="h-4 w-4 rounded border-input"
                        aria-label={field.label}
                      />
                      <label htmlFor={field.name} className="text-sm text-muted-foreground cursor-pointer">
                        {field.label}
                      </label>
                    </div>
                  ) : (
                    <Input
                      id={field.name}
                      type={field.type}
                      required={field.required && !field.auto_generate}
                      disabled={isDisabled}
                      value={String(formData[field.name] || '')}
                      onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                      placeholder={field.placeholder || (field.auto_generate?.includes('${uid}') ? field.auto_generate : undefined)}
                      className={isDisabled ? 'bg-muted text-muted-foreground cursor-not-allowed' : ''}
                      aria-label={field.label}
                    />
                  )}
                  {isDisabled && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {field.readonly ? 'Auto-generated by system' : 'Cannot be modified'}
                    </p>
                  )}
                  {field.auto_generate && !field.readonly && field.auto_generate.includes('${uid}') && (
                    <p className="text-xs text-muted-foreground mt-1">Leave empty to use: {field.auto_generate}</p>
                  )}
                </div>
              )
            })}
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} aria-label="Cancel and close form">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} data-testid={`${mode}-user-submit`} aria-label={`${mode === 'create' ? 'Create' : 'Update'} user`}>
              {loading ? `${mode === 'create' ? 'Creating' : 'Updating'}...` : `${mode === 'create' ? 'Create' : 'Update'} User`}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export default memo(UserFormDialog)
