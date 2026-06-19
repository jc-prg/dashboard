import { useState, useEffect } from 'react'

const STORAGE_KEY = 'dashboard_token'

export function useAuth() {
  const [token, setToken] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (!stored) {
      setChecking(false)
      return
    }
    fetch('/api/auth/check', { headers: { Authorization: `Basic ${stored}` } })
      .then((res) => {
        if (res.ok) {
          setToken(stored)
          setIsAuthenticated(true)
        } else {
          sessionStorage.removeItem(STORAGE_KEY)
        }
      })
      .catch(() => sessionStorage.removeItem(STORAGE_KEY))
      .finally(() => setChecking(false))
  }, [])

  function login(newToken) {
    sessionStorage.setItem(STORAGE_KEY, newToken)
    setToken(newToken)
    setIsAuthenticated(true)
  }

  function logout() {
    sessionStorage.removeItem(STORAGE_KEY)
    setToken(null)
    setIsAuthenticated(false)
  }

  return { isAuthenticated, checking, token, login, logout }
}
