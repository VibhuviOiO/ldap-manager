import * as React from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

/**
 * Accessible modal: portalled to <body>, Escape closes it, focus moves in on
 * open and returns to the trigger on close, and the body cannot scroll behind.
 *
 * DialogContent is the panel itself, so callers size it with className
 * (e.g. "max-w-2xl max-h-[85vh] overflow-y-auto").
 */
export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const previouslyFocused = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement | null

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onOpenChange(false)
      }
    }
    document.addEventListener("keydown", onKeyDown)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused.current?.focus?.()
    }
  }, [open, onOpenChange])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      {children}
    </div>,
    document.body
  )
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  /** Accessible name. Defaults to the id used by DialogTitle. */
  labelledBy?: string
}

export function DialogContent({ children, className, labelledBy, ...props }: DialogContentProps) {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    // Focus the first control, or the panel itself when there is none.
    const target =
      ref.current?.querySelector<HTMLElement>(
        "input:not([type=hidden]), select, textarea, button"
      ) ?? ref.current
    target?.focus?.()
  }, [])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      tabIndex={-1}
      className={cn(
        "relative z-50 w-full max-w-lg bg-card rounded-lg shadow-lg outline-none p-6",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function DialogHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mb-4 flex items-start justify-between gap-4", className)}>{children}</div>
}

export function DialogTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="text-lg font-semibold">
      {children}
    </h2>
  )
}

/** Optional explicit close control, for panels without a footer. */
export function DialogClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      aria-label="Close"
    >
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}
