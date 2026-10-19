import { useState, useEffect, useCallback } from 'react'

const DEFAULTS = { iconMode: false }

// UI settings stored on the server (config/settings.json), shared across restarts and devices
export function useSettings(token) {
  const [settings, setSettings] = useState(DEFAULTS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/settings', { headers: { Authorization: `Basic ${token}` }, cache: 'no-cache' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data && !cancelled) setSettings({ ...DEFAULTS, ...data }) })
      .catch(() => { /* keep defaults */ })
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [token])

  // Optimistic update; rolls back if the server rejects or is unreachable
  const updateSettings = useCallback(async (patch) => {
    let previous
    setSettings(s => { previous = s; return { ...s, ...patch } })
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSettings({ ...DEFAULTS, ...(await res.json()) })
    } catch {
      setSettings(previous)
    }
  }, [token])

  return { settings, loaded, updateSettings }
}
