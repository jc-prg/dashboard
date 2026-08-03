import { useState, useEffect, useCallback, useRef } from 'react'

const POLL_INTERVAL_MS = 30_000
const BOOST_INTERVAL_MS = 5_000
const BOOST_DURATION_MS = 3 * 60 * 1000

export function useItems(token, onUnauthorized, isOnline = true, onTwoFactorRequired) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const authHeader = { Authorization: `Basic ${token}` }
  const boostIntervalRef = useRef(null)
  const boostTimeoutRef = useRef(null)

  // Fetch all items from cache — single fast request, used for regular 30s poll
  const fetchItems = useCallback(async () => {
    if (!isOnline) return
    try {
      const res = await fetch('/api/items', { headers: authHeader })
      if (res.status === 401) { onUnauthorized?.(); return }
      if (res.status === 403) { onTwoFactorRequired?.(); return }
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setItems(await res.json())
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token, isOnline]) // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger a live healthcheck for one item and patch it into state
  const liveCheckItem = useCallback(async (id) => {
    if (!isOnline) return
    try {
      const res = await fetch(`/api/items/${id}/check`, { method: 'POST', headers: authHeader })
      if (res.status === 401) { onUnauthorized?.(); return }
      if (res.status === 403) { onTwoFactorRequired?.(); return }
      if (!res.ok) return
      const fresh = await res.json()
      setItems(prev => prev.map(i => i.id === id ? fresh : i))
    } catch {
      // ignore — stale status remains visible
    }
  }, [token, isOnline]) // eslint-disable-line react-hooks/exhaustive-deps

  // Manual refresh: show cached list immediately, then live-check all in parallel
  const refresh = useCallback(async () => {
    if (!isOnline) return
    try {
      const res = await fetch('/api/items', { headers: authHeader })
      if (res.status === 401) { onUnauthorized?.(); return }
      if (res.status === 403) { onTwoFactorRequired?.(); return }
      if (!res.ok) return
      const data = await res.json()
      setItems(data)
      setError(null)
      data.forEach(item => liveCheckItem(item.id))
    } catch (err) {
      setError(err.message)
    }
  }, [liveCheckItem, isOnline]) // eslint-disable-line react-hooks/exhaustive-deps

  function startBoostPolling(id) {
    clearInterval(boostIntervalRef.current)
    clearTimeout(boostTimeoutRef.current)
    boostIntervalRef.current = setInterval(() => liveCheckItem(id), BOOST_INTERVAL_MS)
    boostTimeoutRef.current = setTimeout(() => {
      clearInterval(boostIntervalRef.current)
      boostIntervalRef.current = null
    }, BOOST_DURATION_MS)
  }

  useEffect(() => {
    if (!isOnline) { setError(null); return }
    fetchItems()
    const id = setInterval(fetchItems, POLL_INTERVAL_MS)
    return () => {
      clearInterval(id)
      clearInterval(boostIntervalRef.current)
      clearTimeout(boostTimeoutRef.current)
    }
  }, [fetchItems, isOnline])

  // ─── Remote actions (SSH) ────────────────────────────────────────────────

  async function triggerAction(id, action) {
    const res = await fetch(`/api/items/${id}/action/${action}`, {
      method: 'POST',
      headers: authHeader,
    })
    if (res.status === 401) { onUnauthorized?.(); throw new Error('Unauthorized') }
    if (res.status === 403) { onTwoFactorRequired?.(); throw new Error('2FA required') }
    const data = await res.json()
    if (!res.ok || data.success === false) throw new Error(data.error || `Action failed (${res.status})`)
    startBoostPolling(id)
    return data
  }

  // ─── CRUD helpers ────────────────────────────────────────────────────────

  async function apiWrite(url, method, body) {
    const res = await fetch(url, {
      method,
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 401) { onUnauthorized?.(); throw new Error('Unauthorized') }
    if (res.status === 403) { onTwoFactorRequired?.(); throw new Error('2FA required') }
    const data = await res.json()
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`)
      err.fields = data.fields
      throw err
    }
    return data
  }

  async function createItem(body) {
    const item = await apiWrite('/api/items', 'POST', body)
    await fetchItems()
    return item
  }

  async function updateItem(id, body) {
    const item = await apiWrite(`/api/items/${id}`, 'PUT', body)
    await fetchItems()
    return item
  }

  async function deleteItem(id) {
    await apiWrite(`/api/items/${id}`, 'DELETE')
    await fetchItems()
  }

  // ─── Export / Import ─────────────────────────────────────────────────────

  async function exportConfig() {
    const res = await fetch('/api/items/export', { headers: authHeader })
    if (res.status === 401) { onUnauthorized?.(); throw new Error('Unauthorized') }
    if (res.status === 403) { onTwoFactorRequired?.(); throw new Error('2FA required') }
    if (!res.ok) throw new Error(`Export failed: HTTP ${res.status}`)
    const data = await res.json()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'dashboard-config.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importConfig(jsonData) {
    await apiWrite('/api/items/import', 'POST', jsonData)
    await fetchItems()
  }

  return { items, loading, error, refresh, triggerAction, createItem, updateItem, deleteItem, exportConfig, importConfig }
}
