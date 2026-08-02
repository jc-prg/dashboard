import { useState, useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import LoginForm from './components/LoginForm'
import TwoFactorForm from './components/TwoFactorForm'
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
  const { isAuthenticated, twoFactorRequired, checking, token, login, logout, completeTwoFactor, requireTwoFactor } = useAuth()
  const [isDark, toggleDark] = useDarkMode()

  // Avoid a flash of the login form while we verify a stored token
  if (checking) return null

  if (!isAuthenticated && !twoFactorRequired) return <LoginForm onLogin={login} />
  if (twoFactorRequired) return <TwoFactorForm token={token} onVerified={completeTwoFactor} />
  return <Dashboard token={token} onLogout={logout} onTwoFactorRequired={requireTwoFactor} isDark={isDark} toggleDark={toggleDark} />
}
