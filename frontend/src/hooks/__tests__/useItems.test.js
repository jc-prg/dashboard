import { renderHook, act, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { useItems } from '../useItems'

const ITEMS = [
  { id: 'foo', name: 'Foo', status: 'online' },
  { id: 'bar', name: 'Bar', status: 'offline' },
]

const server = setupServer(
  http.get('/api/items', () => HttpResponse.json(ITEMS)),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const TOKEN = 'dG9rZW4='

function renderUseItems(onUnauthorized = vi.fn()) {
  return renderHook(() => useItems(TOKEN, onUnauthorized))
}

describe('useItems', () => {
  it('fetches items on mount', async () => {
    const { result } = renderUseItems()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toEqual(ITEMS)
    expect(result.current.error).toBeNull()
  })

  it('sets error on server failure', async () => {
    server.use(http.get('/api/items', () => HttpResponse.json({}, { status: 500 })))
    const { result } = renderUseItems()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toMatch(/500/)
  })

  it('calls onUnauthorized on 401 response', async () => {
    server.use(http.get('/api/items', () => new HttpResponse(null, { status: 401 })))
    const onUnauthorized = vi.fn()
    const { result } = renderUseItems(onUnauthorized)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(onUnauthorized).toHaveBeenCalled()
  })

  it('createItem POSTs to /api/items and refreshes list', async () => {
    const newItem = { id: 'baz', name: 'Baz', status: 'unknown' }
    server.use(
      http.post('/api/items', () => HttpResponse.json(newItem, { status: 201 })),
      http.get('/api/items', () => HttpResponse.json([...ITEMS, newItem])),
    )
    const { result } = renderUseItems()
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.createItem({ name: 'Baz', url: 'http://baz' }))
    await waitFor(() => expect(result.current.items).toHaveLength(3))
  })

  it('updateItem PUTs to /api/items/:id and refreshes list', async () => {
    const updated = { ...ITEMS[0], name: 'Foo Updated' }
    server.use(
      http.put('/api/items/foo', () => HttpResponse.json(updated)),
      http.get('/api/items', () => HttpResponse.json([updated, ITEMS[1]])),
    )
    const { result } = renderUseItems()
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.updateItem('foo', { name: 'Foo Updated', url: 'http://foo' }))
    await waitFor(() => expect(result.current.items[0].name).toBe('Foo Updated'))
  })

  it('deleteItem DELETEs /api/items/:id and refreshes list', async () => {
    server.use(
      http.delete('/api/items/foo', () => HttpResponse.json({ ok: true })),
      http.get('/api/items', () => HttpResponse.json([ITEMS[1]])),
    )
    const { result } = renderUseItems()
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.deleteItem('foo'))
    await waitFor(() => expect(result.current.items).toHaveLength(1))
  })

  it('triggerAction POSTs to /api/items/:id/action/:action', async () => {
    const actionResult = { id: 'foo', action: 'reboot', success: true }
    server.use(
      http.post('/api/items/foo/action/reboot', () => HttpResponse.json(actionResult)),
    )
    const { result } = renderUseItems()
    await waitFor(() => expect(result.current.loading).toBe(false))
    let response
    await act(async () => { response = await result.current.triggerAction('foo', 'reboot') })
    expect(response).toEqual(actionResult)
  })

  it('createItem throws with field errors on 400 response', async () => {
    server.use(
      http.post('/api/items', () => HttpResponse.json({ error: 'Validation failed', fields: { name: 'required' } }, { status: 400 })),
    )
    const { result } = renderUseItems()
    await waitFor(() => expect(result.current.loading).toBe(false))
    let caughtErr
    await act(async () => {
      try { await result.current.createItem({}) } catch (e) { caughtErr = e }
    })
    expect(caughtErr).toBeDefined()
    expect(caughtErr.fields).toEqual({ name: 'required' })
  })
})
