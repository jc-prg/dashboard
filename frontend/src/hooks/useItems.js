import { useState, useEffect, useCallback } from 'react'

const POLL_INTERVAL_MS = 30_000

export function useItems(token, onUnauthorized) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const authHeader = { Authorization: `Basic ${token}` }

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/items', { headers: authHeader })
      if (res.status === 401) { onUnauthorized?.(); return }
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setItems(await res.json())
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchItems()
    const id = setInterval(fetchItems, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchItems])

  // ─── Remote actions (SSH) ────────────────────────────────────────────────

  async function triggerAction(id, action) {
    const res = await fetch(`/api/items/${id}/action/${action}`, {
      method: 'POST',
      headers: authHeader,
    })
    if (res.status === 401) { onUnauthorized?.(); throw new Error('Unauthorized') }
    return res.json()
  }

  // ─── CRUD helpers ────────────────────────────────────────────────────────

  async function apiWrite(url, method, body) {
    const res = await fetch(url, {
      method,
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 401) { onUnauthorized?.(); throw new Error('Unauthorized') }
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

  return { items, loading, error, refresh: fetchItems, triggerAction, createItem, updateItem, deleteItem }
}
