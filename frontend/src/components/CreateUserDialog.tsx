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

interface CreateUserDialogProps {
  open: boolean
  onClose: () => void
  clusterName: string
  baseDn: string
  onSuccess: () => void
}

export default function CreateUserDialog({ open, onClose, clusterName, baseDn, onSuccess }: CreateUserDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formConfig, setFormConfig] = useState<FormConfig | null>(null)
  const [formData, setFormData] = useState<Record<string, any>>({})

  useEffect(() => {
    if (open) {
      loadFormConfig()
    }
  }, [open])

  const loadFormConfig = async () => {
    try {
      const res = await axios.get(`/api/clusters/form/${clusterName}`)
      const config = res.data
      setFormConfig(config)
      
      // Initialize form data with defaults
      const initialData: Record<string, any> = {}
      config.fields.forEach((field: FormField) => {
        if (field.default !== undefined) {
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
      if (!formConfig) throw new Error('Form not configured')
      
      const dn = `uid=${formData.uid},${formConfig.base_ou}`
      const attributes: Record<string, any> = {
        objectClass: formConfig.object_classes,
        ...formData
      }

      // Process auto-generated fields
      formConfig.fields.forEach((field) => {
        if (field.auto_generate) {
          if (field.auto_generate === 'next_uid') {
            attributes[field.name] = 'auto' // Backend will generate
          } else if (field.auto_generate.includes('${uid}')) {
            attributes[field.name] = field.auto_generate.replace('${uid}', formData.uid)
          } else if (field.auto_generate === 'days_since_epoch') {
            // Backend will generate
          }
        }
      })

      await axios.post('/api/entries/create', {
        cluster_name: clusterName,
        dn,
        attributes
      })

      onSuccess()
      onClose()
      setFormData({})
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create user')
    }
    setLoading(false)
  }

  if (!formConfig) {
    return (
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Create New User</SheetTitle>
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
          <SheetTitle>Create New User</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="grid grid-cols-1 gap-4">
            {formConfig.fields.map((field) => (
              <div key={field.name}>
                <Label htmlFor={field.name}>
                  {field.label} {field.required && '*'}
                </Label>
                {field.type === 'select' ? (
                  <Select
                    id={field.name}
                    required={field.required}
                    disabled={field.readonly}
                    value={formData[field.name] || ''}
                    onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                  >
                    <option value="">Select {field.label}</option>
                    {field.options?.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id={field.name}
                    type={field.type}
                    required={field.required}
                    disabled={field.readonly}
                    value={formData[field.name] || ''}
                    onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                    placeholder={field.placeholder}
                  />
                )}
                {field.auto_generate && (
                  <p className="text-xs text-muted-foreground mt-1">Auto-generated</p>
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
              {loading ? 'Creating...' : 'Create User'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
