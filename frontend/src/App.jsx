import { useState, useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import LoginForm from './components/LoginForm'
import Dashboard from './components/Dashboard'

function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('theme')
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  return [isDark, () => setIsDark(d => !d)]
}

export default function App() {
  const { isAuthenticated, checking, token, login, logout } = useAuth()
  const [isDark, toggleDark] = useDarkMode()

  // Avoid a flash of the login form while we verify a stored token
  if (checking) return null

  if (!isAuthenticated) return <LoginForm onLogin={login} />
  return <Dashboard token={token} onLogout={logout} isDark={isDark} toggleDark={toggleDark} />
}
