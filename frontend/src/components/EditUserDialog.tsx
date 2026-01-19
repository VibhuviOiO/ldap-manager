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

interface EditUserDialogProps {
  open: boolean
  onClose: () => void
  clusterName: string
  entry: any
  onSuccess: () => void
}

export default function EditUserDialog({ open, onClose, clusterName, entry, onSuccess }: EditUserDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formConfig, setFormConfig] = useState<FormConfig | null>(null)
  const [formData, setFormData] = useState<Record<string, any>>({})

  useEffect(() => {
    if (open && entry) {
      loadFormConfig()
    }
  }, [open, entry])

  const loadFormConfig = async () => {
    try {
      const res = await axios.get(`/api/clusters/form/${clusterName}`)
      const config = res.data
      setFormConfig(config)
      
      // Initialize form data with existing entry values
      const initialData: Record<string, any> = {}
      config.fields.forEach((field: FormField) => {
        if (entry[field.name] !== undefined) {
          initialData[field.name] = entry[field.name]
        } else if (field.default !== undefined) {
          initialData[field.name] = field.default
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
      const modifications: Record<string, any> = {}
      
      // Only include changed fields
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

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update user')
    }
    setLoading(false)
  }

  if (!formConfig) {
    return (
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit User</SheetTitle>
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
          <SheetTitle>Edit User: {entry.uid}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="grid grid-cols-2 gap-4">
            {formConfig.fields.filter(field => field.name !== 'userPassword').map((field) => (
              <div key={field.name}>
                <Label htmlFor={field.name}>
                  {field.label} {field.required && '*'}
                </Label>
                {field.type === 'select' ? (
                  <Select
                    id={field.name}
                    required={field.required}
                    disabled={field.readonly || field.name === 'uid'}
                    value={formData[field.name] || ''}
                    onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                  >
                    <option value="">Select {field.label}</option>
                    {field.options?.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
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
                    required={field.required}
                    disabled={field.readonly || field.name === 'uid' || field.name === 'uidNumber'}
                    value={formData[field.name] || ''}
                    onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                    placeholder={field.placeholder}
                    className={(field.readonly || field.name === 'uid' || field.name === 'uidNumber') ? 'bg-muted text-muted-foreground cursor-not-allowed' : ''}
                  />
                )}
                {(field.readonly || field.name === 'uid' || field.name === 'uidNumber') && (
                  <p className="text-xs text-muted-foreground mt-1">Cannot be modified</p>
                )}
              </div>
            ))}
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
              {loading ? 'Updating...' : 'Update User'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
