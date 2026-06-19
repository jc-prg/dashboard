import { useState, useEffect, useRef } from 'react'

const POLL_INTERVAL_MS = 5_000

export function useConnectionStatus(token) {
  const [isOnline, setIsOnline] = useState(true)
  const wasEverOffline = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const res = await fetch('/api/auth/check', {
          headers: { Authorization: `Basic ${token}` },
        })
        if (!cancelled) setIsOnline(res.ok || res.status === 401)
      } catch {
        if (!cancelled) {
          wasEverOffline.current = true
          setIsOnline(false)
        }
      }
    }

    check()
    const id = setInterval(check, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [token])

  return isOnline
}
