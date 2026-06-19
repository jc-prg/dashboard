import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ActionButton from '../components/ActionButton'

const item = { id: 'srv', name: 'My Server' }

describe('ActionButton', () => {
  it('renders the action label', () => {
    render(<ActionButton item={item} action="reboot" onAction={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'reboot' })).toBeInTheDocument()
  })

  it('shows confirmation popover when clicked', async () => {
    render(<ActionButton item={item} action="reboot" onAction={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'reboot' }))
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByText('My Server')).toBeInTheDocument()
  })

  it('dismisses popover on Cancel', async () => {
    render(<ActionButton item={item} action="reboot" onAction={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'reboot' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })

  it('calls onAction with item id and action on Confirm', async () => {
    const onAction = vi.fn().mockResolvedValue({ success: true })
    render(<ActionButton item={item} action="reboot" onAction={onAction} />)
    await userEvent.click(screen.getByRole('button', { name: 'reboot' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onAction).toHaveBeenCalledWith('srv', 'reboot')
  })

  it('shows success toast after successful action', async () => {
    const onAction = vi.fn().mockResolvedValue({ success: true })
    render(<ActionButton item={item} action="reboot" onAction={onAction} />)
    await userEvent.click(screen.getByRole('button', { name: 'reboot' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByText('reboot succeeded')).toBeInTheDocument())
  })

  it('shows error toast when action returns success: false', async () => {
    const onAction = vi.fn().mockResolvedValue({ success: false, output: 'Permission denied' })
    render(<ActionButton item={item} action="reboot" onAction={onAction} />)
    await userEvent.click(screen.getByRole('button', { name: 'reboot' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByText('Permission denied')).toBeInTheDocument())
  })

  it('shows error toast when onAction throws', async () => {
    const onAction = vi.fn().mockRejectedValue(new Error('Network error'))
    render(<ActionButton item={item} action="reboot" onAction={onAction} />)
    await userEvent.click(screen.getByRole('button', { name: 'reboot' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument())
  })
})
