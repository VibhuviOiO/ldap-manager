import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DialogProvider } from '@/contexts/DialogContext'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'

/**
 * Render with the providers the app mounts in App.tsx.
 *
 * Components that call useQuery/useDialogs/useConfirm throw without them, which
 * is a harness gap rather than a component bug. A fresh QueryClient per call
 * keeps state from leaking between tests.
 */
export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <DialogProvider>{ui}</DialogProvider>
      </ConfirmProvider>
    </QueryClientProvider>
  )
}
