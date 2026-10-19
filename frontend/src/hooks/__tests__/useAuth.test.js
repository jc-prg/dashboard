import { renderHook, act, waitFor } from '@testing-library/react'
import { useAuth } from '../useAuth'

const STORAGE_KEY = 'dashboard_token'

// Successful /api/auth/check response (no 2FA needed)
const checkOk = () => ({ ok: true, status: 200, json: async () => ({ ok: true, twoFactorRequired: false }) })

beforeEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAuth', () => {
  it('starts unauthenticated when sessionStorage is empty', async () => {
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.token).toBeNull()
  })

  it('login() sets token and marks authenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(checkOk()))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.checking).toBe(false))
    await act(() => result.current.login('dG9rZW4='))
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.token).toBe('dG9rZW4=')
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('dG9rZW4=')
  })

  it('login() requires 2FA when the auth check says so', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ ok: true, twoFactorRequired: true }),
    }))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.checking).toBe(false))
    await act(() => result.current.login('dG9rZW4='))
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.twoFactorRequired).toBe(true)
  })

  it('logout() clears token and marks unauthenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(checkOk()))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.checking).toBe(false))
    await act(() => result.current.login('dG9rZW4='))
    act(() => result.current.logout())
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.token).toBeNull()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('restores session when stored token passes auth check', async () => {
    sessionStorage.setItem(STORAGE_KEY, 'valid-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(checkOk()))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.token).toBe('valid-token')
  })

  it('clears session when stored token fails auth check', async () => {
    sessionStorage.setItem(STORAGE_KEY, 'bad-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(result.current.isAuthenticated).toBe(false)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('keeps stored token when auth check is rate limited', async () => {
    sessionStorage.setItem(STORAGE_KEY, 'token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(result.current.isAuthenticated).toBe(false)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('token')
  })

  it('keeps stored token when auth check fetch throws', async () => {
    sessionStorage.setItem(STORAGE_KEY, 'token')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(result.current.isAuthenticated).toBe(false)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('token')
  })
})
