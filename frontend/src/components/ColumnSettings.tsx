import { useState } from 'react'
import { Settings } from 'lucide-react'
import { Button } from './ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet'

interface Column {
  name: string
  label: string
  default_visible: boolean
}

interface ColumnSettingsProps {
  columns: Column[]
  visibleColumns: string[]
  onColumnsChange: (columns: string[]) => void
}

export default function ColumnSettings({ columns, visibleColumns, onColumnsChange }: ColumnSettingsProps) {
  const [open, setOpen] = useState(false)

  const toggleColumn = (columnName: string) => {
    if (visibleColumns.includes(columnName)) {
      onColumnsChange(visibleColumns.filter(c => c !== columnName))
    } else {
      onColumnsChange([...visibleColumns, columnName])
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings className="h-4 w-4 mr-2" />
        Columns
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Column Visibility</SheetTitle>
          </SheetHeader>
          <div className="space-y-2 mt-6">
            {columns.map((col) => (
              <label key={col.name} className="flex items-center space-x-2 cursor-pointer hover:bg-accent p-2 rounded">
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(col.name)}
                  onChange={() => toggleColumn(col.name)}
                  className="h-4 w-4"
                />
                <span className="text-sm">{col.label}</span>
              </label>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
