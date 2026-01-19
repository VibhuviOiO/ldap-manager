import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select } from './ui/select'
import axios from 'axios'

interface FormField {
  name: string
  label: string
  type: string
  required: boolean
  placeholder?: string
  default?: any
  auto_generate?: string
  readonly?: boolean
  options?: string[]
}

interface FormConfig {
  base_ou: string
  object_classes: string[]
  fields: FormField[]
}

interface UserFormDialogProps {
  open: boolean
  onClose: () => void
  clusterName: string
  baseDn: string
  entry?: any // If provided, edit mode; otherwise create mode
  onSuccess: () => void
}

export default function UserFormDialog({ open, onClose, clusterName, baseDn, entry, onSuccess }: UserFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formConfig, setFormConfig] = useState<FormConfig | null>(null)
  const [formData, setFormData] = useState<Record<string, any>>({})
  
  const isEditMode = !!entry

  useEffect(() => {
    if (open) {
      loadFormConfig()
    }
  }, [open, entry])

  const loadFormConfig = async () => {
    try {
      const res = await axios.get(`/api/clusters/form/${clusterName}`)
      const config = res.data
      setFormConfig(config)
      
      // Initialize form data
      const initialData: Record<string, any> = {}
      config.fields.forEach((field: FormField) => {
        if (isEditMode && entry[field.name] !== undefined) {
          initialData[field.name] = entry[field.name]
        } else if (field.default !== undefined) {
          initialData[field.name] = field.default
        } else if (field.auto_generate && field.auto_generate.includes('${uid}')) {
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
      
      if (isEditMode) {
        // Edit mode: only send changed fields
        const modifications: Record<string, any> = {}
        Object.keys(formData).forEach(key => {
          if (formData[key] !== entry[key]) {
            modifications[key] = formData[key]
          }
        })

        if (Object.keys(modifications).length === 0) {
          setError('No changes detected')
          setLoading(false)
          return
        }

        await axios.put('/api/entries/update', {
          cluster_name: clusterName,
          dn: entry.dn,
          modifications
        })
      } else {
        // Create mode
        const dn = `uid=${formData.uid},${formConfig.base_ou}`
        const attributes: Record<string, any> = {
          objectClass: formConfig.object_classes,
          ...formData
        }

        // Process auto-generated fields
        formConfig.fields.forEach((field) => {
          if (field.auto_generate) {
            if (field.auto_generate === 'next_uid') {
              attributes[field.name] = 'auto'
            } else if (field.auto_generate.includes('${uid}')) {
              attributes[field.name] = field.auto_generate.replace('${uid}', formData.uid)
            }
          }
        })

        await axios.post('/api/entries/create', {
          cluster_name: clusterName,
          dn,
          attributes
        })
      }

      onSuccess()
      onClose()
      setFormData({})
    } catch (err: any) {
      setError(err.response?.data?.detail || `Failed to ${isEditMode ? 'update' : 'create'} user`)
    }
    setLoading(false)
  }

  if (!formConfig) {
    return (
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{isEditMode ? 'Edit User' : 'Create New User'}</SheetTitle>
          </SheetHeader>
          <div className="text-sm text-muted-foreground">
            {error || 'Loading form configuration...'}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditMode ? `Edit User: ${entry.uid}` : 'Create New User'}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="grid grid-cols-2 gap-4">
            {formConfig.fields
              .filter(field => !isEditMode || field.name !== 'userPassword')
              .map((field) => {
                const isDisabled = field.readonly || 
                  (isEditMode && (field.name === 'uid' || field.name === 'uidNumber'))
                
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
                        value={formData[field.name] || ''}
                        onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
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
                        value={formData[field.name] || ''}
                        onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                        placeholder={field.placeholder || (field.auto_generate?.includes('${uid}') ? field.auto_generate : undefined)}
                        className={isDisabled ? 'bg-muted text-muted-foreground cursor-not-allowed' : ''}
                      />
                    )}
                    {isDisabled && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {field.readonly ? 'Auto-generated by system' : 'Cannot be modified'}
                      </p>
                    )}
                    {!isEditMode && field.auto_generate && !field.readonly && field.auto_generate.includes('${uid}') && (
                      <p className="text-xs text-muted-foreground mt-1">Leave empty to use: {field.auto_generate}</p>
                    )}
                  </div>
                )
              })}
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
              {loading ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update User' : 'Create User')}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
