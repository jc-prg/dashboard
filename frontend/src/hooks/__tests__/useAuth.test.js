import { renderHook, act, waitFor } from '@testing-library/react'
import { useAuth } from '../useAuth'

const STORAGE_KEY = 'dashboard_token'

beforeEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('useAuth', () => {
  it('starts unauthenticated when sessionStorage is empty', async () => {
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.token).toBeNull()
  })

  it('login() sets token and marks authenticated', async () => {
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.checking).toBe(false))
    act(() => result.current.login('dG9rZW4='))
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.token).toBe('dG9rZW4=')
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('dG9rZW4=')
  })

  it('logout() clears token and marks unauthenticated', async () => {
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.checking).toBe(false))
    act(() => result.current.login('dG9rZW4='))
    act(() => result.current.logout())
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.token).toBeNull()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('restores session when stored token passes auth check', async () => {
    sessionStorage.setItem(STORAGE_KEY, 'valid-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.token).toBe('valid-token')
  })

  it('clears session when stored token fails auth check', async () => {
    sessionStorage.setItem(STORAGE_KEY, 'bad-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(result.current.isAuthenticated).toBe(false)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('clears session when auth check fetch throws', async () => {
    sessionStorage.setItem(STORAGE_KEY, 'token')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(result.current.isAuthenticated).toBe(false)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
