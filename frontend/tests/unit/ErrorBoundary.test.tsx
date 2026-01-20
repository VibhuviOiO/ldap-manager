import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '@/components/ErrorBoundary'
import { Component } from 'react'

class ThrowError extends Component {
  componentDidMount() {
    throw new Error('Test error')
  }
  render() {
    return <div>Should not render</div>
  }
}

const NoError = () => <div>No error</div>

describe('ErrorBoundary', () => {
  it('should render children when no error', () => {
    render(
      <ErrorBoundary>
        <NoError />
      </ErrorBoundary>
    )
    expect(screen.getByText('No error')).toBeInTheDocument()
  })

  it('should catch errors and display fallback UI', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    )
    
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument()
    
    consoleError.mockRestore()
  })

  it('should display reload button', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    )
    
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
    
    consoleError.mockRestore()
  })
})
