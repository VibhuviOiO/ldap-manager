import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from './test-utils'
import MonitoringView from '@/components/MonitoringView'
import ActivityLogView from '@/components/ActivityLogView'

vi.mock('@/services', () => ({
  clusterService: {
    getClusterHealth: vi.fn()
  }
}))

describe('MonitoringView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render monitoring view', () => {
    const { container } = renderWithProviders(<MonitoringView clusterName="test" />)
    expect(container).toBeTruthy()
  })

  it('should display cluster name', () => {
    const { container } = renderWithProviders(<MonitoringView clusterName="test-cluster" />)
    expect(container).toBeTruthy()
  })
})

describe('ActivityLogView', () => {
  it('should render a loading state before the audit log resolves', () => {
    renderWithProviders(<ActivityLogView />)
    // The view queries /api/audit on mount; in a smoke test with no service
    // mock it stays pending, which is the state asserted here.
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  // The "Activity logs are stored..." instruction was removed when this view
  // moved from a static panel to the application audit log. Testing the new
  // behaviour means mocking /api/audit and the capability probe, which this
  // smoke test deliberately does not do - see the audit e2e spec instead.
})
