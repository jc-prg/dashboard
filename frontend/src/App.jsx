import { useAuth } from './hooks/useAuth'
import LoginForm from './components/LoginForm'
import Dashboard from './components/Dashboard'

export default function App() {
  const { isAuthenticated, checking, token, login, logout } = useAuth()

  // Avoid a flash of the login form while we verify a stored token
  if (checking) return null

  if (!isAuthenticated) return <LoginForm onLogin={login} />
  return <Dashboard token={token} onLogout={logout} />
}
