import { useState, useEffect } from 'react'

const STORAGE_KEY = 'dashboard_token'

export function useAuth() {
  const [token, setToken] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [twoFactorRequired, setTwoFactorRequired] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (!stored) {
      setChecking(false)
      return
    }
    fetch('/api/auth/check', { headers: { Authorization: `Basic ${stored}` } })
      .then(async (res) => {
        if (!res.ok) { sessionStorage.removeItem(STORAGE_KEY); return }
        const data = await res.json()
        setToken(stored)
        if (data.twoFactorRequired) {
          setTwoFactorRequired(true)
        } else {
          setIsAuthenticated(true)
        }
      })
      .catch(() => sessionStorage.removeItem(STORAGE_KEY))
      .finally(() => setChecking(false))
  }, [])

  async function login(newToken) {
    sessionStorage.setItem(STORAGE_KEY, newToken)
    setToken(newToken)
    try {
      const res = await fetch('/api/auth/check', { headers: { Authorization: `Basic ${newToken}` } })
      const data = await res.json()
      if (data.twoFactorRequired) {
        setTwoFactorRequired(true)
      } else {
        setIsAuthenticated(true)
      }
    } catch {
      setIsAuthenticated(true) // fallback: treat as authenticated if check fails
    }
  }

  function completeTwoFactor() {
    setTwoFactorRequired(false)
    setIsAuthenticated(true)
  }

  function requireTwoFactor() {
    setIsAuthenticated(false)
    setTwoFactorRequired(true)
  }

  function logout() {
    sessionStorage.removeItem(STORAGE_KEY)
    setToken(null)
    setIsAuthenticated(false)
    setTwoFactorRequired(false)
  }

  return { isAuthenticated, twoFactorRequired, checking, token, login, logout, completeTwoFactor, requireTwoFactor }
}
