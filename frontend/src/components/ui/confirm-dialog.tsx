import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog'
import { Button } from './button'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Styles the confirm button as a dangerous action. */
  destructive?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false))

/** Styled replacement for window.confirm(), which renders browser chrome. */
export function useConfirm() {
  return useContext(ConfirmContext)
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions>({ title: '' })
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = (value: boolean) => {
    setOpen(false)
    resolver.current?.(value)
    resolver.current = null
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={(next) => { if (!next) settle(false) }}>
        <DialogContent className="max-w-md" labelledBy="confirm-dialog-title">
          <DialogHeader>
            <DialogTitle id="confirm-dialog-title">
              <span className="flex items-center gap-2">
                {options.destructive && (
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0" aria-hidden="true" />
                )}
                {options.title}
              </span>
            </DialogTitle>
          </DialogHeader>

          {options.description && (
            <p className="text-sm text-muted-foreground whitespace-pre-line break-words">
              {options.description}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => settle(false)}>
              {options.cancelLabel ?? 'Cancel'}
            </Button>
            <Button
              variant={options.destructive ? 'destructive' : 'default'}
              onClick={() => settle(true)}
            >
              {options.confirmLabel ?? 'Confirm'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}
