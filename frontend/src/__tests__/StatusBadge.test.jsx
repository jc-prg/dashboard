import { render, screen } from '@testing-library/react'
import StatusBadge from '../components/StatusBadge'

describe('StatusBadge', () => {
  it('renders online status', () => {
    render(<StatusBadge status="online" />)
    expect(screen.getByText('online')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'online' })).toHaveClass('bg-green-500')
  })

  it('renders offline status', () => {
    render(<StatusBadge status="offline" />)
    expect(screen.getByText('offline')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'offline' })).toHaveClass('bg-red-500')
  })

  it('renders unknown status', () => {
    render(<StatusBadge status="unknown" />)
    expect(screen.getByText('unknown')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'unknown' })).toHaveClass('bg-gray-400')
  })

  it('falls back to gray for unrecognised status', () => {
    render(<StatusBadge status="pending" />)
    expect(screen.getByRole('img', { name: 'pending' })).toHaveClass('bg-gray-400')
  })
})
