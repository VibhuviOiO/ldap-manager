import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
    const { container } = render(<MonitoringView clusterName="test" />)
    expect(container).toBeTruthy()
  })

  it('should display cluster name', () => {
    const { container } = render(<MonitoringView clusterName="test-cluster" />)
    expect(container).toBeTruthy()
  })
})

describe('ActivityLogView', () => {
  it('should render activity log view', () => {
    render(<ActivityLogView />)
    expect(screen.getByText('Activity Log')).toBeInTheDocument()
  })

  it('should display log instructions', () => {
    render(<ActivityLogView />)
    expect(screen.getByText(/Activity logs are stored/i)).toBeInTheDocument()
  })
})
